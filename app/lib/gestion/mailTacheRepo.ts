import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '../db/client';
import { lireCle } from './coffre';
import { titreLogement } from './annuaireRecherche';
import { coordonneesLisibles, estFamille, type ContactSource } from './contactsTache';
import { echeanceLisible } from './taches';
import { liensDemande, messageIdDemande, objetDemande, type StatutAcceptation } from './acceptationTache';
import { mailTache, objetConfirmation, planPieces, PREFIXE_OBJET_RECAPITULATIF, SEUIL_PIECES_OCTETS, type PieceMail, type SorteMailTache } from './mailTache';
import { adresseApplication, MENTION_LIEN_LOCAL } from './adresseApplication';
import { jetonPourSubject } from './driveDelegue';
import { verdictJoindreFichier } from './driveVerdict';
import { lireContenuFichier, ouvrirFluxExportPdf, ouvrirFluxFichier, type FluxDrive } from './drive';
import { fetchDriveLectureSeule } from './driveLectureSeule';
import { invitesTacheDisponible } from './schema';
import type { MessageAEnvoyer, PieceAEnvoyer } from './envoiGmail';

/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — CE QUE LE MAIL D'UNE TÂCHE DIT, LU EN BASE ══════════════════════
 *
 * Le contenu est décidé par `mailTache.ts` (pur) ; ce module va chercher les données (la demande, la tâche, le bien,
 * les invités, les contacts copiés, les pièces) et prépare les pièces jointes.
 *
 * 🔴 LES PIÈCES : des RÉFÉRENCES Drive (lot TACHES-PIECES-DRIVE). Pour les joindre, on LIT le fichier (jamais une
 * écriture : `fetchDriveLectureSeule`), avec les droits du collaborateur qui a envoyé l'invitation (délégation). Le
 * verdict « peut-on joindre ce fichier ? » est LE MÊME que celui du composeur (`verdictJoindreFichier`) : un fichier sous
 * « Documents clients scannés » n'est ni joint, ni téléchargeable — son nom seul est cité.
 *
 * 🔴 LE LIEN DE TÉLÉCHARGEMENT : `/api/tache/piece?j=…`, SIGNÉ (HMAC-SHA256, clé dérivée de `GESTION_JETON_CLE`), propre
 * à UNE demande et UNE pièce, avec une date de fin. Il cesse d'agir quand la demande est remplacée (renvoi, destinataire
 * changé), quand la pièce est retirée de la tâche, ou à sa date de fin. Aucun secret dans le mail : la signature ne
 * permet de rien fabriquer d'autre.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE LIEN SIGNÉ D'UNE PIÈCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CHEMIN_PIECE_PUBLIQUE = '/api/tache/piece';

function clePieces(env: Record<string, string | undefined> = process.env): Buffer | null {
  try { return createHmac('sha256', lireCle(env)).update('svav-tache-piece-v1').digest(); } catch { return null; }
}

/** Le jeton d'une pièce : `<demande>.<pièce>.<fin en secondes>.<signature>`. `null` si la clé manque. */
export function signerPiece(demandeId: number, pieceId: number, expire: Date, env: Record<string, string | undefined> = process.env): string | null {
  const cle = clePieces(env);
  if (cle === null) return null;
  const corps = `${demandeId}.${pieceId}.${Math.floor(expire.getTime() / 1000)}`;
  return `${corps}.${createHmac('sha256', cle).update(corps).digest('base64url')}`;
}

/** Relit un jeton de pièce : signature, puis date de fin. `null` = faux ou périmé. */
export function lirePiece(jeton: string, maintenant: Date = new Date(), env: Record<string, string | undefined> = process.env):
  { demandeId: number; pieceId: number; expire: Date } | null {
  const m = /^(\d{1,12})\.(\d{1,12})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec((jeton ?? '').trim());
  const cle = clePieces(env);
  if (m === null || cle === null) return null;
  const attendu = createHmac('sha256', cle).update(`${m[1]}.${m[2]}.${m[3]}`).digest();
  const recu = Buffer.from(m[4], 'base64url');
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return null;
  const expire = new Date(Number(m[3]) * 1000);
  if (expire.getTime() <= maintenant.getTime()) return null;
  return { demandeId: Number(m[1]), pieceId: Number(m[2]), expire };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LECTURE DES PIÈCES DANS LE DRIVE (lecture seule, droits de l'expéditeur)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface PiecePreparee {
  pieceId: number; driveId: string; nom: string; typeMime: string | null;
  tailleOctets: number | null;
  /** Le verdict « joindre » permet-il de LIRE ce fichier ? */
  permis: boolean;
  /** A-t-il des octets à télécharger (un document Google n'en a pas : on l'exporte en PDF au téléchargement) ? */
  telechargeable: boolean;
  motif: string | null;
  lire: () => Promise<Buffer | null>;
}

export interface LecteurPiecesTache {
  preparer(pieces: readonly { pieceId: number; driveId: string; nom: string; typeMime: string | null }[], sujet: string | null): Promise<PiecePreparee[]>;
  /** Le flux d'une pièce pour le lien de téléchargement ; `null` + motif si refusée. */
  ouvrir(driveId: string, sujet: string | null): Promise<{ ok: true; flux: FluxDrive; nom: string } | { ok: false; motif: string }>;
}

const estDocumentGoogle = (mime: string | null) => (mime ?? '').startsWith('application/vnd.google-apps.');

export const lecteurPiecesDrive: LecteurPiecesTache = {
  async preparer(pieces, sujet) {
    const sans = (motif: string) => pieces.map((p) => ({
      ...p, tailleOctets: null, permis: false, telechargeable: false, motif, lire: async () => null,
    }));
    if (pieces.length === 0) return [];
    if (sujet === null) return sans('expéditeur sans adresse');
    const j = await jetonPourSubject(sujet, { fetch });
    if (!j.ok) return sans(`Drive indisponible : ${j.motif}`);
    const out: PiecePreparee[] = [];
    for (const p of pieces) {
      const { verdict, meta } = await verdictJoindreFichier(sujet, j.jeton, p.driveId);
      const mime = meta.ok ? meta.valeur.typeMime : p.typeMime;
      out.push({
        ...p, nom: meta.ok ? meta.valeur.nom : p.nom, typeMime: mime,
        tailleOctets: meta.ok ? meta.valeur.tailleOctets : null,
        permis: verdict.joindre, telechargeable: meta.ok && !estDocumentGoogle(mime), motif: verdict.motif,
        lire: async () => {
          const r = await lireContenuFichier(j.jeton, p.driveId, { fetch: fetchDriveLectureSeule() }, SEUIL_PIECES_OCTETS);
          return r.ok ? r.valeur : null;
        },
      });
    }
    return out;
  },
  async ouvrir(driveId, sujet) {
    if (sujet === null) return { ok: false, motif: 'expéditeur sans adresse' };
    const j = await jetonPourSubject(sujet, { fetch });
    if (!j.ok) return { ok: false, motif: `Drive indisponible : ${j.motif}` };
    const { verdict, meta } = await verdictJoindreFichier(sujet, j.jeton, driveId);
    if (!verdict.joindre || !meta.ok) return { ok: false, motif: verdict.motif ?? 'fichier illisible' };
    const deps = { fetch: fetchDriveLectureSeule() };
    const google = estDocumentGoogle(meta.valeur.typeMime);
    const f = google ? await ouvrirFluxExportPdf(j.jeton, driveId, deps) : await ouvrirFluxFichier(j.jeton, driveId, deps);
    if (!f.ok) return { ok: false, motif: f.motif };
    return { ok: true, flux: f.valeur, nom: google ? `${meta.valeur.nom}.pdf` : meta.valeur.nom };
  },
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE MAIL D'UNE DEMANDE (invitation, récapitulatif)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

interface LigneDemandeMail {
  id: number; tache_id: number; destinataire_id: number | null; destinataire_libelle: string; destinataire_email: string | null;
  demandeur_libelle: string; demandeur_email: string | null; cree_le: Date; expire_le: Date | null; statut: string;
  repondu_le?: Date | null; repondu_par_libelle?: string | null;
  objet: string; note: string | null; jour: string; heure: string | null; duree_minutes: number | null;
  adresse: string | null; commune: string | null;
}

const iso = (d: Date | string | null | undefined): string | null => {
  if (d === null || d === undefined) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

async function lireDemande(demandeId: number): Promise<LigneDemandeMail | null> {
  const { rows } = await query<LigneDemandeMail>(
    `SELECT d.id::int AS id, d.tache_id::int AS tache_id, d.destinataire_id::int AS destinataire_id, d.destinataire_libelle,
            d.destinataire_email, d.demandeur_libelle, u.identifiant AS demandeur_email, d.cree_le, d.expire_le, d.statut,
            d.repondu_le, d.repondu_par_libelle,
            t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            t.duree_minutes, l.adresse, l.commune
       FROM gestion_tache_demande d
       JOIN gestion_tache t ON t.id = d.tache_id
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN admin_utilisateur u ON u.id = d.demandeur_id
      WHERE d.id = $1`, [demandeId]).catch(async () => query<LigneDemandeMail>(
    // Sans la migration 350 (pas de durée).
    `SELECT d.id::int AS id, d.tache_id::int AS tache_id, d.destinataire_id::int AS destinataire_id, d.destinataire_libelle,
            d.destinataire_email, d.demandeur_libelle, u.identifiant AS demandeur_email, d.cree_le, d.expire_le, d.statut,
            d.repondu_le, d.repondu_par_libelle,
            t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            NULL::int AS duree_minutes, l.adresse, l.commune
       FROM gestion_tache_demande d
       JOIN gestion_tache t ON t.id = d.tache_id
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN admin_utilisateur u ON u.id = d.demandeur_id
      WHERE d.id = $1`, [demandeId]));
  return rows[0] ?? null;
}

async function contactsDe(tacheId: number): Promise<ContactSource[]> {
  const { rows } = await query<{ cle: string; famille: string; nom: string; qualite: string | null; organisation: string | null;
    adresse: string | null; coordonnees: unknown }>(
    `SELECT cle, famille, nom, qualite, organisation, adresse, coordonnees FROM gestion_tache_contact
      WHERE tache_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [tacheId]).catch(() => ({ rows: [] }));
  return rows.filter((r) => estFamille(r.famille)).map((r) => ({
    cle: r.cle, famille: r.famille as ContactSource['famille'], nom: r.nom, qualite: r.qualite, organisation: r.organisation,
    adresse: r.adresse, coordonnees: coordonneesLisibles(r.coordonnees),
  }));
}

async function piecesDe(tacheId: number): Promise<{ pieceId: number; driveId: string; nom: string; typeMime: string | null }[]> {
  const { rows } = await query<{ id: number; drive_fichier_id: string; nom: string; type_mime: string | null }>(
    `SELECT id::int AS id, drive_fichier_id, nom, type_mime FROM gestion_tache_piece WHERE tache_id = $1 AND retire_le IS NULL ORDER BY id`,
    [tacheId]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ pieceId: Number(r.id), driveId: r.drive_fichier_id, nom: r.nom, typeMime: r.type_mime }));
}

/** Les invités actifs et leur état (sans la 365 : le seul destinataire). */
async function invitesDe(d: LigneDemandeMail): Promise<{ libelle: string; statut: StatutAcceptation | null; moi: boolean }[]> {
  const seul = [{ libelle: d.destinataire_libelle, statut: d.statut as StatutAcceptation, moi: true }];
  if (!(await invitesTacheDisponible())) return seul;
  const { rows } = await query<{ libelle: string; collaborateur_id: number | null; statut: string | null }>(
    `SELECT i.libelle, i.collaborateur_id::int AS collaborateur_id,
            (SELECT x.statut FROM gestion_tache_demande x WHERE x.invite_id = i.id AND x.statut <> 'remplacee' LIMIT 1) AS statut
       FROM gestion_tache_invite i JOIN gestion_tache t ON t.id = i.tache_id
      WHERE i.tache_id = $1 AND i.retire_le IS NULL
      ORDER BY (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) DESC, i.rang, i.id`, [d.tache_id]);
  if (rows.length === 0) return seul;
  return rows.map((r) => ({
    libelle: r.libelle,
    statut: r.statut === 'en_attente' || r.statut === 'acceptee' || r.statut === 'refusee' ? r.statut : null,
    moi: r.collaborateur_id !== null && Number(r.collaborateur_id) === Number(d.destinataire_id),
  }));
}

export interface MessageTache { message: MessageAEnvoyer; destinataire: string; resumePieces: string[] }

/**
 * LE MESSAGE COMPLET d'une demande : objet, texte, HTML, pièces jointes. `jeton` : le jeton en clair de l'invitation
 * (ses deux liens) ; absent pour le récapitulatif. `null` quand la demande est introuvable ou sans adresse.
 */
export async function messageDeLaDemande(o: {
  demandeId: number; sorte: SorteMailTache; jeton?: string | null; agenda?: 'ajoutee' | 'bientot' | 'sans_agenda';
  de: string; lecteur?: LecteurPiecesTache; maintenant?: Date; dureeLienJours?: number;
  /** 🔴 Confirmation : les destinataires (gestion@ et le créateur), à la place de l'invité. */
  a?: readonly string[];
}): Promise<{ ok: true; m: MessageTache } | { ok: false; motif: string }> {
  const d = await lireDemande(o.demandeId);
  if (d === null) return { ok: false, motif: 'Demande introuvable.' };
  const destinataires = o.a ?? [d.destinataire_email ?? ''];
  if (destinataires.every((x) => x.trim() === '')) return { ok: false, motif: 'Le destinataire n’a pas d’adresse.' };
  const maintenant = o.maintenant ?? new Date();
  const { base, locale } = adresseApplication();
  const [contacts, pieces, invites] = await Promise.all([contactsDe(d.tache_id), piecesDe(d.tache_id), invitesDe(d)]);

  // Les pièces : lues dans le Drive (droits de l'expéditeur), jointes si leur total reste sous le seuil.
  const preparees = await (o.lecteur ?? lecteurPiecesDrive).preparer(pieces, d.demandeur_email);
  const plan = planPieces(preparees);
  // Les liens de téléchargement vivent aussi longtemps que les liens de réponse (invitation), ou la durée du réglage.
  const finLiens = o.sorte === 'invitation' && d.expire_le !== null ? new Date(d.expire_le)
    : new Date(maintenant.getTime() + (o.dureeLienJours ?? 7) * 86_400_000);
  const jointes: PieceAEnvoyer[] = [];
  const piecesMail: PieceMail[] = [];
  for (const { piece: p, jointe } of plan) {
    if (jointe) {
      const octets = await p.lire();
      if (octets !== null) {
        jointes.push({ nom: p.nom, typeMime: p.typeMime, octets });
        piecesMail.push({ nom: p.nom, jointe: true, lien: null, tailleOctets: octets.byteLength, motif: null });
        continue;
      }
    }
    const signe = p.permis ? signerPiece(d.id, p.pieceId, finLiens) : null;
    piecesMail.push({
      nom: p.nom, jointe: false, tailleOctets: p.tailleOctets,
      lien: signe === null ? null : `${base.replace(/\/+$/, '')}${CHEMIN_PIECE_PUBLIQUE}?j=${encodeURIComponent(signe)}`,
      motif: p.permis ? (signe === null ? 'lien indisponible' : null) : (p.motif ?? 'non disponible'),
    });
  }

  const liens = o.sorte === 'invitation' && o.jeton
    ? { ...liensDemande(base, o.jeton), expireLe: iso(d.expire_le) ?? maintenant.toISOString() } : undefined;
  const corps = mailTache({
    sorte: o.sorte, destinataire: d.destinataire_libelle, expediteur: d.demandeur_libelle, demandeLe: iso(d.cree_le) ?? '',
    jour: d.jour, heure: d.heure, dureeMinutes: d.duree_minutes === null ? null : Number(d.duree_minutes), titre: d.objet,
    notes: d.note, adresse: titreLogement(d.adresse, d.commune), contacts, invites, pieces: piecesMail, liens,
    agenda: o.agenda, mentionLiens: locale ? MENTION_LIEN_LOCAL : undefined,
    ...(o.sorte === 'confirmation'
      ? { acceptation: { par: d.repondu_par_libelle ?? d.destinataire_libelle, le: iso(d.repondu_le) ?? maintenant.toISOString() } } : {}),
    piecesExpirentLe: piecesMail.some((p) => !p.jointe && p.lien !== null) ? finLiens.toISOString() : null,
  });
  const adresseCourte = (d.adresse ?? '').trim() || titreLogement(d.adresse, d.commune);
  const echeance = echeanceLisible(d.jour, d.heure, maintenant);
  const objet = o.sorte === 'invitation'
    ? objetDemande({ adresseCourte, objet: d.objet, echeance })
    : o.sorte === 'confirmation'
      ? objetConfirmation({ par: d.repondu_par_libelle ?? d.destinataire_libelle, titre: d.objet, jour: d.jour, heure: d.heure })
      : `${PREFIXE_OBJET_RECAPITULATIF}${adresseCourte} — ${d.objet.trim()} — ${echeance}`;
  return {
    ok: true,
    m: {
      destinataire: d.destinataire_libelle,
      resumePieces: piecesMail.map((p) => `${p.nom} : ${p.jointe ? 'jointe' : p.lien !== null ? 'lien' : `non jointe (${p.motif ?? ''})`}`),
      message: {
        de: o.de, deNom: 'Gestion', a: destinataires.filter((x) => x.trim() !== ''), cc: [], cci: [], objet, corps: corps.texte, corpsHtml: corps.html,
        // La marque que la relève reconnaît (jamais rattaché à un bien), pour l'invitation comme pour le récapitulatif.
        messageId: messageIdDemande(o.de.split('@')[1] ?? '', randomBytes(12).toString('hex')),
        ...(jointes.length > 0 ? { pieces: jointes } : {}),
      },
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE TÉLÉCHARGEMENT PAR LE LIEN SIGNÉ (route publique `/api/tache/piece`)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IssuePieceSignee =
  | { ok: true; flux: FluxDrive; nom: string }
  | { ok: false; statut: number; message: string };

/**
 * OUVRE la pièce d'un lien signé, après avoir revérifié en base que le lien vaut ENCORE : la demande n'est pas remplacée
 * (renvoi, destinataire changé), l'invité n'a pas été retiré, la tâche n'est pas annulée, la pièce est toujours dans la
 * tâche. La lecture se fait avec les droits de l'expéditeur, et le verdict « joindre » est rejoué.
 */
export async function ouvrirPieceSignee(jeton: string, lecteur: LecteurPiecesTache = lecteurPiecesDrive, maintenant: Date = new Date()): Promise<IssuePieceSignee> {
  const l = lirePiece(jeton, maintenant);
  if (l === null) return { ok: false, statut: 410, message: 'Ce lien de téléchargement n’est pas valable ou a expiré.' };
  const avecInvites = await invitesTacheDisponible();
  const { rows } = await query<{ statut: string; etat: string; invite_retire: boolean; drive_fichier_id: string | null; email: string | null }>(
    `SELECT d.statut, t.etat, ${avecInvites ? '(i.retire_le IS NOT NULL)' : 'false'} AS invite_retire, p.drive_fichier_id,
            u.identifiant AS email
       FROM gestion_tache_demande d
       JOIN gestion_tache t ON t.id = d.tache_id
       LEFT JOIN gestion_tache_piece p ON p.id = $2 AND p.tache_id = d.tache_id AND p.retire_le IS NULL
       LEFT JOIN admin_utilisateur u ON u.id = d.demandeur_id
       ${avecInvites ? 'LEFT JOIN gestion_tache_invite i ON i.id = d.invite_id' : ''}
      WHERE d.id = $1`, [l.demandeId, l.pieceId]);
  const r = rows[0];
  if (r === undefined || r.statut === 'remplacee' || r.invite_retire === true) {
    return { ok: false, statut: 410, message: 'Ce lien de téléchargement ne vaut plus : l’invitation a été renvoyée ou ne vous est plus destinée.' };
  }
  if (r.etat === 'annulee') return { ok: false, statut: 410, message: 'Cette tâche a été annulée : la pièce n’est plus disponible par ce lien.' };
  if (r.drive_fichier_id === null) return { ok: false, statut: 410, message: 'Cette pièce n’est plus jointe à la tâche.' };
  const o = await lecteur.ouvrir(r.drive_fichier_id, r.email);
  if (!o.ok) return { ok: false, statut: 403, message: `Cette pièce ne peut pas être téléchargée : ${o.motif}` };
  return { ok: true, flux: o.flux, nom: o.nom };
}

/**
 * 🔴 LOT GESTION-CONFIRMATION-ACCEPTATION — LES DESTINATAIRES DE LA CONFIRMATION : la boîte gestion@ et l'adresse du
 * collaborateur qui a envoyé l'invitation (le compte de la session au moment de l'envoi : `demandeur_id`). Une adresse
 * en double (gestion@ a envoyé lui-même) ne compte qu'une fois. PUR.
 */
export function destinatairesConfirmation(gestion: string, createur: string | null): { a: string[]; sansCreateur: boolean } {
  const a: string[] = [];
  for (const x of [gestion, createur ?? '']) {
    const v = x.trim();
    if (v !== '' && !a.some((y) => y.toLowerCase() === v.toLowerCase())) a.push(v);
  }
  return { a, sansCreateur: (createur ?? '').trim() === '' };
}

/** L'adresse du collaborateur qui a envoyé une demande (son compte). `null` sans compte (accès de secours). */
export async function adresseDuDemandeur(demandeId: number): Promise<{ email: string | null; libelle: string } | null> {
  const { rows } = await query<{ email: string | null; libelle: string }>(
    `SELECT u.identifiant AS email, d.demandeur_libelle AS libelle
       FROM gestion_tache_demande d LEFT JOIN admin_utilisateur u ON u.id = d.demandeur_id WHERE d.id = $1`, [demandeId]);
  return rows[0] ?? null;
}
