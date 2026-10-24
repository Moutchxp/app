import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/client';
import { hacher } from './motDePasse';
import { changerMotDePasseSelf, trouverCompte } from './comptes';
import { LONGUEUR_MIN_MOT_DE_PASSE } from './politiqueMdp';
import { revoquerSessions } from './etatSession';
import {
  adresseNormalisee, attenteApres, corpsReinitialisation, DUREE_LIEN_MINUTES, FENETRE_DEMANDES_S, lienReinitialisation,
  MESSAGE_LIEN_INVALIDE, messageIdReinitialisation, OBJET_REINITIALISATION, verdictLien, type VerdictLien,
} from './reinitialisation';
import { adresseApplication } from '../gestion/adresseApplication';
import { chargerConfigGestion } from '../gestion/config';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';

/**
 * ══ 🔴🔴 « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION (Arno, 24/10/2026, migration 416) — LE DÉPÔT ═════════════════════════════
 *
 * Le mail part de gestion@ par la voie d'envoi des INVITATIONS de compte (même expéditeur, même transport ; FACTICE sous les
 * tests). Le jeton n'existe en clair que dans le mail ; la base n'en garde que l'empreinte SHA-256 (déterministe, indexée — un
 * secret aléatoire de 256 bits n'a pas besoin d'un hachage lent). RIEN de secret n'est journalisé : ni jeton, ni empreinte, ni
 * adresse — seulement l'identifiant numérique du compte.
 * Sans la migration 416 : la demande répond le même message et n'envoie rien ; le lien n'agit pas.
 */

export const empreinte = (secret: string): string => createHash('sha256').update(secret, 'utf8').digest('hex');
/** La clé anti-rafale : empreinte de « admin-reset: » + adresse normalisée (jamais l'adresse en clair, espace de clés propre). */
export const cleDemande = (adresse: string): string => empreinte(`admin-reset:${adresseNormalisee(adresse)}`);

let tablesConnues = false;
export async function reinitialisationDisponible(): Promise<boolean> {
  if (tablesConnues) return true;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'
          AND table_name IN ('admin_reinitialisation', 'admin_reinitialisation_demande')`);
    tablesConnues = (rows[0]?.n ?? 0) === 2;
  } catch { tablesConnues = false; }
  return tablesConnues;
}

/** L'anti-rafale : la demande est-elle permise ? Compte la demande dans tous les cas. FAIL-SAFE : une panne ne bloque jamais. */
async function demandePermise(cle: string): Promise<boolean> {
  let permise = true;
  try {
    const { rows } = await query<{ n: number; dernier: Date | null }>(
      `SELECT count(*)::int AS n, max(ts) AS dernier FROM admin_reinitialisation_demande
        WHERE cle_hachee = $1 AND ts > now() - ($2 || ' seconds')::interval`, [cle, FENETRE_DEMANDES_S]);
    const attente = attenteApres(rows[0]?.n ?? 0);
    const dernier = rows[0]?.dernier;
    if (attente > 0 && dernier) permise = (Date.now() - new Date(dernier).getTime()) / 1000 >= attente;
  } catch { /* fail-safe */ }
  try { await query(`INSERT INTO admin_reinitialisation_demande (cle_hachee) VALUES ($1)`, [cle]); } catch { /* best-effort */ }
  return permise;
}

export type IssueMail = { etat: 'envoye' | 'factice' } | { etat: 'echec'; motif: string };

/**
 * LA DEMANDE. Ne lève jamais et ne dit RIEN à l'appelant de ce qui s'est passé : la route répond le même message dans tous les
 * cas. `envoi` : la promesse de l'envoi (la route ne l'attend pas — le temps de réponse ne dépend pas de l'existence du compte ;
 * les épreuves l'attendent). `null` : aucun mail (adresse vide, rafale, compte inconnu ou désactivé, migration absente).
 */
export async function demanderReinitialisation(adresseBrute: unknown, o: {
  transport?: TransportDemande; env?: Record<string, string | undefined>; maintenant?: Date;
} = {}): Promise<{ envoi: Promise<IssueMail> | null }> {
  const adresse = adresseNormalisee(adresseBrute);
  if (adresse === '' || adresse.length > 254) return { envoi: null };
  if (!(await reinitialisationDisponible())) {
    console.warn('[admin/reinitialisation] demande ignorée : migration 416 non appliquée');
    return { envoi: null };
  }
  // ① L'anti-rafale D'ABORD, avant de savoir si un compte existe (sinon un oracle de temps sur l'existence).
  if (!(await demandePermise(cleDemande(adresse)))) return { envoi: null };
  // ② Le compte : inconnu ou désactivé → rien (et la même réponse).
  const compte = await trouverCompte(adresse).catch(() => null);
  if (compte === null || compte.actif !== true) return { envoi: null };
  const env = o.env ?? process.env;
  const { base, locale } = adresseApplication(env);
  if (locale && env.NODE_ENV === 'production') {
    console.error('[admin/reinitialisation] adresse de l’application non réglée (GESTION_URL_APPLICATION) : aucun lien envoyé pour le compte %s', compte.id);
    return { envoi: null };
  }
  const maintenant = o.maintenant ?? new Date();
  // ③ Le lien : le précédent cesse d'agir, le nouveau naît — une transaction verrouillée sur le compte.
  const pose = await withTransaction(async (q) => {
    await q(`SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE`, [compte.id]);
    await q(`UPDATE admin_reinitialisation SET remplacee_le = now() WHERE utilisateur_id = $1 AND utilise_le IS NULL AND remplacee_le IS NULL`, [compte.id]);
    const jeton = randomBytes(32).toString('base64url');
    const { rows } = await q<{ id: number }>(
      `INSERT INTO admin_reinitialisation (utilisateur_id, jeton_empreinte, cree_le, expire_le)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz + ($4::int * interval '1 minute')) RETURNING id::int AS id`,
      [compte.id, empreinte(jeton), maintenant.toISOString(), DUREE_LIEN_MINUTES]);
    return { jeton, id: Number(rows[0].id) };
  }).catch(() => null);
  if (pose === null) return { envoi: null };
  // ④ L'envoi : par la voie des invitations ; ce qui est RÉELLEMENT arrivé est noté sur la ligne (jamais un secret).
  const marquer = (etat: 'envoye' | 'factice' | 'echec', erreur: string | null) =>
    query(`UPDATE admin_reinitialisation SET mail_etat = $2, mail_le = now(), mail_erreur = $3 WHERE id = $1`, [pose.id, etat, erreur]).catch(() => {});
  const envoi = (async (): Promise<IssueMail> => {
    try {
      const de = (await chargerConfigGestion()).adresseGestion;
      const corps = corpsReinitialisation({ prenom: compte.prenom ?? '', identifiant: compte.identifiant, lien: lienReinitialisation(base, pose.jeton) });
      const r = await (o.transport ?? transportParDefaut(env)).envoyer({
        de, deNom: 'Sans Vis-à-Vis — Gestion', a: [compte.identifiant], cc: [], cci: [], objet: OBJET_REINITIALISATION,
        corps: corps.texte, corpsHtml: corps.html, messageId: messageIdReinitialisation(de.split('@')[1] ?? '', randomBytes(12).toString('hex')),
      });
      if (!r.ok) {
        await marquer('echec', r.motif.slice(0, 300));
        console.error('[admin/reinitialisation] envoi impossible pour le compte %s', compte.id);
        return { etat: 'echec', motif: r.motif };
      }
      await marquer(r.factice ? 'factice' : 'envoye', null);
      console.info('[admin/reinitialisation] lien %s pour le compte %s', r.factice ? 'préparé (factice)' : 'envoyé', compte.id);
      return { etat: r.factice ? 'factice' : 'envoye' };
    } catch (e) {
      const motif = e instanceof Error ? e.message.slice(0, 300) : 'erreur inconnue';
      await marquer('echec', motif);
      console.error('[admin/reinitialisation] envoi impossible pour le compte %s', compte.id);
      return { etat: 'echec', motif };
    }
  })();
  return { envoi };
}

interface LigneLien { id: number; utilisateur_id: number; expire_le: Date; utilise_le: Date | null; remplacee_le: Date | null; actif: boolean; identifiant: string }
const SQL_LIEN = `SELECT r.id::int AS id, r.utilisateur_id::int AS utilisateur_id, r.expire_le, r.utilise_le, r.remplacee_le, u.actif, u.identifiant
                    FROM admin_reinitialisation r JOIN admin_utilisateur u ON u.id = r.utilisateur_id WHERE r.jeton_empreinte = $1`;
const verdictDe = (l: LigneLien | undefined, maintenant: Date): VerdictLien => verdictLien(
  l === undefined ? null : { expireLe: l.expire_le, utiliseLe: l.utilise_le, remplaceeLe: l.remplacee_le, compteActif: l.actif === true }, maintenant);

/** LECTURE du lien, pour la page (n'écrit rien). L'identifiant n'est rendu que si le lien agit. */
export async function lireLienReinitialisation(jeton: string, maintenant: Date = new Date()): Promise<{ ok: true; identifiant: string } | { ok: false }> {
  if (!(await reinitialisationDisponible())) return { ok: false };
  const l = (await query<LigneLien>(SQL_LIEN, [empreinte(jeton)])).rows[0];
  return verdictDe(l, maintenant).ok ? { ok: true, identifiant: l!.identifiant } : { ok: false };
}

export type IssueReinitialisation = { ok: true; compteId: number; identifiant: string } | { ok: false; statut: number; message: string };

/**
 * LE NOUVEAU MOT DE PASSE, par le lien : une seule fois (verrou de ligne + `utilise_le`), avant l'expiration, jamais un lien
 * remplacé, jamais un compte désactivé. Posé par le chemin existant du changement de mot de passe (`changerMotDePasseSelf` :
 * abaisse « doit changer », journal `changement_mot_de_passe`), dans la MÊME transaction que la consommation du lien. Puis TOUTES
 * les sessions du compte sont fermées (version de session + 1 ; et l'empreinte du mot de passe a changé) — la route ouvre ensuite
 * celle du navigateur courant. Rôle, droits et données du compte : inchangés.
 */
export async function reinitialiserParLien(jeton: string, motDePasse: string, confirmation: string, maintenant: Date = new Date()): Promise<IssueReinitialisation> {
  if (!(await reinitialisationDisponible())) return { ok: false, statut: 409, message: MESSAGE_LIEN_INVALIDE };
  if (motDePasse !== confirmation) return { ok: false, statut: 400, message: 'La confirmation ne correspond pas.' };
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return { ok: false, statut: 400, message: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.` };
  }
  const h = await hacher(motDePasse);
  const r = await withTransaction(async (q): Promise<IssueReinitialisation> => {
    const l = (await q<LigneLien>(`${SQL_LIEN} FOR UPDATE OF r`, [empreinte(jeton)])).rows[0];
    if (!verdictDe(l, maintenant).ok) return { ok: false, statut: 409, message: MESSAGE_LIEN_INVALIDE };
    await q(`UPDATE admin_reinitialisation SET utilise_le = now() WHERE id = $1`, [l!.id]);
    await changerMotDePasseSelf(l!.utilisateur_id, h, q);
    return { ok: true, compteId: l!.utilisateur_id, identifiant: l!.identifiant };
  });
  if (r.ok) {
    await revoquerSessions(r.compteId);
    console.info('[admin/reinitialisation] mot de passe choisi par lien pour le compte %s ; ses autres sessions sont fermées', r.compteId);
  }
  return r;
}
