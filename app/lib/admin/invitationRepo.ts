import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/client';
import { hacher } from './motDePasse';
import { changerMotDePasseSelf } from './comptes';
import { LONGUEUR_MIN_MOT_DE_PASSE } from './politiqueMdp';
import {
  DUREE_INVITATION_JOURS, corpsInvitation, lienActivation, messageIdInvitation, OBJET_INVITATION, refusRenvoi,
  verdictInvitation, compteActive, type EtatMailInvitation, type VerdictInvitation,
} from './invitation';
import { adresseApplication } from '../gestion/adresseApplication';
import { chargerConfigGestion } from '../gestion/config';
import { horodatageLisible } from '../gestion/taches';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';

/**
 * ══ 🔴🔴 LOT GESTION-INVITATION-ADMIN (16/10/2026) — LE DÉPÔT DES INVITATIONS (migration 363) ═════════════════════════
 *
 * Le mail part de gestion@ par la voie d'envoi EXISTANTE (celle des demandes d'acceptation de tâche : Gmail de gestion@),
 * FACTICE sous les tests (`transportParDefaut`). Le jeton n'existe en clair que dans le mail. Sans la migration 363,
 * rien ne part et l'écran le dit (« invitations non installées »).
 */

export const empreinte = (jeton: string): string => createHash('sha256').update(jeton).digest('hex');

let tableConnue: boolean | null = null;
export async function invitationDisponible(): Promise<boolean> {
  if (tableConnue === true) return true;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_invitation'`);
    tableConnue = (rows[0]?.n ?? 0) > 0;
  } catch { tableConnue = false; }
  return tableConnue;
}

export type IssueEnvoi =
  | { ok: true; etat: 'envoye' | 'factice'; destinataire: string }
  | { ok: false; etat: 'echec' | 'indisponible' | 'refuse'; destinataire: string; motif: string };

/** Les « invitations » d'un compte, telles que la liste les lit. */
export interface EtatInvitation { active: boolean; dernierEnvoi: string | null; mailEtat: EtatMailInvitation | null; mailErreur: string | null; expireLe: string | null }

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

/**
 * (RE)ENVOIE l'invitation d'un compte : refuse un compte inactif, déjà activé, ou un envoi trop rapproché ; REMPLACE
 * le lien précédent (il cesse aussitôt d'agir) ; envoie ; enregistre ce qui est RÉELLEMENT arrivé. Ne lève jamais.
 */
export async function envoyerInvitation(utilisateurId: number, auteurId: number | null, o: {
  transport?: TransportDemande; maintenant?: Date; env?: Record<string, string | undefined>;
} = {}): Promise<IssueEnvoi> {
  const maintenant = o.maintenant ?? new Date();
  const env = o.env ?? process.env;
  const { rows: cs } = await query<{ identifiant: string; prenom: string; actif: boolean; derniere_connexion_a: Date | null }>(
    `SELECT identifiant, prenom, actif, derniere_connexion_a FROM admin_utilisateur WHERE id = $1`, [utilisateurId]);
  const c = cs[0];
  if (c === undefined) return { ok: false, etat: 'refuse', destinataire: '', motif: 'Compte introuvable.' };
  if (!(await invitationDisponible())) {
    return { ok: false, etat: 'indisponible', destinataire: c.identifiant, motif: 'invitations non installées sur ce serveur (migration 363)' };
  }
  // Adresse des liens : la MÊME que les autres liens sortants. En production, un repli sur localhost serait un lien
  // mort pour le destinataire : on n'envoie pas, et on le dit.
  const { base, locale } = adresseApplication(env);
  if (locale && env.NODE_ENV === 'production') {
    return { ok: false, etat: 'echec', destinataire: c.identifiant, motif: 'adresse de l’application non réglée (GESTION_URL_APPLICATION) : le lien pointerait vers localhost' };
  }

  // Le compte, le délai et la création du lien : une transaction, verrouillée sur le compte (deux clics → un seul envoi).
  const pose = await withTransaction(async (q) => {
    await q(`SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE`, [utilisateurId]);
    const { rows } = await q<{ cree_le: Date | null; utilisee: boolean }>(
      `SELECT max(cree_le) AS cree_le, bool_or(utilise_le IS NOT NULL) AS utilisee FROM admin_invitation WHERE utilisateur_id = $1`,
      [utilisateurId]);
    const refus = refusRenvoi({
      actif: c.actif, active: compteActive({ derniereConnexion: c.derniere_connexion_a, invitationUtilisee: rows[0]?.utilisee === true }),
      dernierEnvoi: rows[0]?.cree_le ?? null,
    }, maintenant);
    if (refus !== null) return { refus } as const;
    await q(`UPDATE admin_invitation SET remplacee_le = now() WHERE utilisateur_id = $1 AND utilise_le IS NULL AND remplacee_le IS NULL`, [utilisateurId]);
    const jeton = randomBytes(32).toString('base64url');
    const { rows: ins } = await q<{ id: number; expire_le: Date }>(
      `INSERT INTO admin_invitation (utilisateur_id, jeton_empreinte, cree_le, expire_le, envoye_par)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz + ($4::int * interval '1 day'), $5) RETURNING id::int AS id, expire_le`,
      [utilisateurId, empreinte(jeton), maintenant.toISOString(), DUREE_INVITATION_JOURS, auteurId]);
    return { jeton, id: Number(ins[0].id), expireLe: ins[0].expire_le } as const;
  });
  if ('refus' in pose) return { ok: false, etat: 'refuse', destinataire: c.identifiant, motif: pose.refus ?? '' };

  const marquer = (etat: EtatMailInvitation, erreur: string | null) =>
    query(`UPDATE admin_invitation SET mail_etat = $2, mail_le = now(), mail_erreur = $3 WHERE id = $1`, [pose.id, etat, erreur]).catch(() => {});
  try {
    const invitant = auteurId === null ? 'Un administrateur'
      : (await query<{ n: string }>(`SELECT btrim(prenom || ' ' || nom) AS n FROM admin_utilisateur WHERE id = $1`, [auteurId])).rows[0]?.n || 'Un administrateur';
    const de = (await chargerConfigGestion()).adresseGestion;
    const corps = corpsInvitation({
      prenom: c.prenom, identifiant: c.identifiant, invitant, lien: lienActivation(base, pose.jeton),
      expireLe: horodatageLisible(iso(pose.expireLe) ?? ''),
    });
    const r = await (o.transport ?? transportParDefaut(env)).envoyer({
      de, deNom: 'Sans Vis-à-Vis — Gestion', a: [c.identifiant], cc: [], cci: [], objet: OBJET_INVITATION,
      corps: corps.texte, corpsHtml: corps.html, messageId: messageIdInvitation(de.split('@')[1] ?? '', randomBytes(12).toString('hex')),
    });
    if (!r.ok) { await marquer('echec', r.motif.slice(0, 300)); return { ok: false, etat: 'echec', destinataire: c.identifiant, motif: r.motif }; }
    await marquer(r.factice ? 'factice' : 'envoye', null);
    console.info('[comptes/invitation] invitation %s pour le compte %s (par %s)', r.factice ? 'préparée (factice)' : 'envoyée', utilisateurId, auteurId ?? 'secours');
    return { ok: true, etat: r.factice ? 'factice' : 'envoye', destinataire: c.identifiant };
  } catch (e) {
    const motif = e instanceof Error ? e.message.slice(0, 300) : 'erreur inconnue';
    console.error('[comptes/invitation] envoi impossible pour le compte %s', utilisateurId, e);
    await marquer('echec', motif);
    return { ok: false, etat: 'echec', destinataire: c.identifiant, motif };
  }
}

/** L'état d'invitation de chaque compte, pour la liste (une requête). Table absente → carte vide. */
export async function etatsInvitations(ids: readonly number[]): Promise<Map<number, EtatInvitation>> {
  const m = new Map<number, EtatInvitation>();
  if (ids.length === 0 || !(await invitationDisponible())) return m;
  const { rows } = await query<{ uid: number; der: Date | null; utilisee: boolean; mail_etat: EtatMailInvitation | null; mail_erreur: string | null; expire_le: Date | null; connexion: Date | null }>(
    `SELECT u.id::int AS uid, u.derniere_connexion_a AS connexion,
            (SELECT max(cree_le) FROM admin_invitation i WHERE i.utilisateur_id = u.id) AS der,
            coalesce((SELECT bool_or(utilise_le IS NOT NULL) FROM admin_invitation i WHERE i.utilisateur_id = u.id), false) AS utilisee,
            d.mail_etat, d.mail_erreur, d.expire_le
       FROM admin_utilisateur u
       LEFT JOIN LATERAL (SELECT mail_etat, mail_erreur, expire_le FROM admin_invitation i WHERE i.utilisateur_id = u.id
                           ORDER BY cree_le DESC, id DESC LIMIT 1) d ON true
      WHERE u.id = ANY($1::bigint[])`, [ids]);
  for (const r of rows) {
    m.set(Number(r.uid), {
      active: compteActive({ derniereConnexion: r.connexion, invitationUtilisee: r.utilisee === true }),
      dernierEnvoi: iso(r.der), mailEtat: r.mail_etat, mailErreur: r.mail_erreur, expireLe: iso(r.expire_le),
    });
  }
  return m;
}

interface LigneLien { id: number; utilisateur_id: number; expire_le: Date; utilise_le: Date | null; remplacee_le: Date | null; actif: boolean; prenom: string; identifiant: string }
const SQL_LIEN = `SELECT i.id::int AS id, i.utilisateur_id::int AS utilisateur_id, i.expire_le, i.utilise_le, i.remplacee_le,
                         u.actif, u.prenom, u.identifiant
                    FROM admin_invitation i JOIN admin_utilisateur u ON u.id = i.utilisateur_id WHERE i.jeton_empreinte = $1`;
const verdictDe = (l: LigneLien | undefined, maintenant: Date): VerdictInvitation => verdictInvitation(
  l === undefined ? null : { expireLe: l.expire_le, utiliseLe: l.utilise_le, remplaceeLe: l.remplacee_le, compteActif: l.actif === true }, maintenant);

/** LECTURE du lien, pour la page d'activation (n'écrit rien). Le prénom et l'identifiant ne sont rendus que si le lien agit. */
export async function lireLien(jeton: string, maintenant: Date = new Date()): Promise<{ verdict: VerdictInvitation; prenom: string | null; identifiant: string | null }> {
  if (!(await invitationDisponible())) return { verdict: verdictInvitation(null, maintenant), prenom: null, identifiant: null };
  const l = (await query<LigneLien>(SQL_LIEN, [empreinte(jeton)])).rows[0];
  const verdict = verdictDe(l, maintenant);
  return { verdict, prenom: verdict.ok ? l!.prenom : null, identifiant: verdict.ok ? l!.identifiant : null };
}

export type IssueActivation = { ok: true; identifiant: string } | { ok: false; statut: number; message: string };

/**
 * ACTIVE le compte par le lien : une seule fois (verrou de ligne + `utilise_le`), avant l'expiration, jamais un lien
 * remplacé. Pose le mot de passe CHOISI par le chemin existant du changement de mot de passe (`changerMotDePasseSelf` :
 * abaisse « doit changer », journal `changement_mot_de_passe`), dans la MÊME transaction que la consommation du lien.
 */
export async function activerParLien(jeton: string, motDePasse: string, confirmation: string, maintenant: Date = new Date()): Promise<IssueActivation> {
  if (!(await invitationDisponible())) return { ok: false, statut: 503, message: 'Les invitations ne sont pas installées sur ce serveur.' };
  if (motDePasse !== confirmation) return { ok: false, statut: 400, message: 'La confirmation ne correspond pas.' };
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return { ok: false, statut: 400, message: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.` };
  }
  const h = await hacher(motDePasse);
  return withTransaction(async (q) => {
    const l = (await q<LigneLien>(`${SQL_LIEN} FOR UPDATE OF i`, [empreinte(jeton)])).rows[0];
    const v = verdictDe(l, maintenant);
    if (!v.ok) return { ok: false, statut: 409, message: v.message };
    await q(`UPDATE admin_invitation SET utilise_le = now() WHERE id = $1`, [l!.id]);
    await changerMotDePasseSelf(l!.utilisateur_id, h, q);
    console.info('[comptes/invitation] compte %s activé par son lien d’invitation', l!.utilisateur_id);
    return { ok: true, identifiant: l!.identifiant };
  });
}
