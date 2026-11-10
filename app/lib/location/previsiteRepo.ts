import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { adresseApplication } from '../gestion/adresseApplication';
import { rappelsParDefaut, type SaisieTache } from '../gestion/taches';
import { annulerTache, creerTache, decalerTache, listerCollaborateurs, marquerFaite, modifierTache, type Collaborateur, type IssueTache } from '../gestion/tachesRepo';
import { renvoyerInvitation } from '../gestion/invitesRepo';
import type { DemandePosee } from '../gestion/acceptationRepo';
import { mailTache } from '../gestion/mailTache';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { edlsDisponible } from './edlsRepo';
import { destinatairesSortie } from './sortieLocatairesRepo';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { adressesUniques, copiesAvis, prenomNom } from './mailsPreavisSortie';
import { envoyerSerie, locatairesAvis, logementDe, mailsAvisDisponibles, signatureEcran, type DepsAvis, type EnvoiAvis } from './mailsPreavisSortieRepo';
import { dateFrPreavis, type LignePreavisAccueil } from './preavis';
import { plageFr } from './edls';
import {
  CORPS_MAX, MENTION_AUTOMATIQUE, NOM_FICHIER_ICS, OBJET_TACHE_PREVISITE, creneauFr, enAlerte, finDuRendezVous, invitationIcs, mailPrevisite,
  objetAlertePrevisite, objetCompteRendu, objetConfirmationLocataires, objetInvitationCompteRendu, objetModificationLocataires, objetRefusPrevisite,
  paragraphesAlertePrevisite, paragraphesConfirmationLocataires, paragraphesDuTexte, paragraphesInvitationCompteRendu,
  paragraphesModificationLocataires, statutPrevisite, texteRefusPrevisite, tousRefusent, uidPrevisite, verifierRdvPrevisite,
  type FaitsPrevisite, type MailPrevisite, type RdvPrevisite, type ReponseDuCollegue, type StatutPrevisite,
} from './previsite';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE D'ÉTAT DES LIEUX DE SORTIE — LE DÉPÔT (Arno, 10/11/2026). IMPUR (base + envoi). ═══════════════════════════════
 *
 * Règles et textes : `previsite.ts`. Données : migration 464 (`gestion_location_previsite`, SONDÉE — sans elle, rien ne s'affiche et
 * rien ne s'écrit : les préavis restent comme avant).
 *   · LE RENDEZ-VOUS est une TÂCHE du module de tâches de la Gestion — le chemin de l'état des lieux de sortie planifié : `creerTache`
 *     (le premier collègue en « Confiée à », les suivants en invités ; chacun sa demande Accepter / Refuser, son statut), `decalerTache`
 *     (statuts remis à zéro, « Tâche déplacée »), `modifierTache` (réaffecter). Les mails des collègues partent par la route, après
 *     l'écriture, exactement comme pour l'EDLS (droit d'envoi relu, réglage du module, mode RECETTE).
 *   · LES MAILS AUX LOCATAIRES, À L'ÉQUIPE (alerte, compte rendu, refus / absence) partent par le canal des mails Location
 *     (`envoyerSerie` : gestion@, « Mail envoyé par … », signature Gmail, journal du bien `gestion_location_mail_avis`).
 *   · Ordre : LIRE (FOR UPDATE) → REFUSER → ÉCRIRE ; jamais une ligne effacée ; chaque geste au journal de la Gestion, par locataire.
 */

export const previsiteDisponible = async (): Promise<boolean> =>
  (await colonneExisteMemo('gestion_location_previsite', 'cle')) && (await edlsDisponible());

export type IssuePrevisite<T> =
  | { etat: 'ok'; data: T; demandes?: DemandePosee[] }
  | { etat: 'refus'; motif: string; champ?: string | null }
  | { etat: 'inconnu' }
  | { etat: 'sans_schema' };

const SANS_SCHEMA = { etat: 'sans_schema' as const };
/** L'auteur des envois automatiques (journal : libellé obligatoire). */
export const AUTEUR_AUTOMATIQUE: Auteur = { id: null, libelle: 'Envoi automatique (pré-visite)' };

// ══ LE PRÉAVIS (ses occupations) ════════════════════════════════════════════════════════════════════════════════════════

type LigneGroupe = { id: string; locataire_id: string; lot_id: string; sortie: string | null; recu_le: string | null; date_max: string | null;
  entree: string | null; bail_id: string | null };
interface Groupe { lignes: LigneGroupe[]; lotId: number; cle: string; recuLe: string; dateMax: string; ids: number[] }

/** La clé d'un préavis : le bail (ou le logement + l'entrée) et la date de réception — elle survit à une correction de la durée. PUR. */
export function clePrevisite(l: { bail_id: string | null; lot_id: string; entree: string | null; recu_le: string }): string {
  return l.bail_id !== null ? `bail:${l.bail_id}|${l.recu_le}` : `lot:${l.lot_id}|${l.entree ?? ''}|${l.recu_le}`;
}

async function lireGroupe(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; g: Groupe } | { ok: false; issue: IssuePrevisite<never> }> {
  const bail = (await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id')) ? 'o.bail_id::text' : 'NULL::text';
  const { rows } = await q<LigneGroupe>(
    `SELECT o.id::text, o.locataire_id::text, o.lot_id::text, o.sortie::text, o.entree::text, ${bail} AS bail_id, p.recu_le::text, p.date_max::text
       FROM gestion_annuaire_occupation o
       LEFT JOIN gestion_location_preavis p ON p.occupation_id = o.id AND p.remplace_le IS NULL AND p.annule_le IS NULL
      WHERE o.id = ANY($1::bigint[]) ORDER BY o.id FOR UPDATE OF o`, [[...ids]]);
  if (rows.length !== ids.length || rows.length === 0) return { ok: false, issue: { etat: 'inconnu' } };
  if (rows.some((r) => r.sortie !== null)) return { ok: false, issue: { etat: 'refus', motif: 'Un des locataires est déjà sorti : rechargez la page.' } };
  if (rows.some((r) => r.recu_le === null || r.date_max === null)) return { ok: false, issue: { etat: 'refus', motif: 'Un des locataires n’est plus en préavis : rechargez la page.' } };
  if (new Set(rows.map((r) => r.lot_id)).size !== 1) return { ok: false, issue: { etat: 'refus', motif: 'Ces locataires n’occupent pas le même logement.' } };
  const recuLe = rows.map((r) => r.recu_le as string).sort().pop() as string;
  const dateMax = rows.map((r) => r.date_max as string).sort().pop() as string;
  return { ok: true, g: { lignes: rows, lotId: Number(rows[0].lot_id), recuLe, dateMax, ids: rows.map((r) => Number(r.id)),
    cle: clePrevisite({ ...rows[0], recu_le: recuLe }) } };
}

// ══ LE SUIVI (une ligne par préavis) ════════════════════════════════════════════════════════════════════════════════════

export interface LigneSuivi {
  id: string; cle: string; lot_id: string; occupation_ids: string[]; recu_le: string; tache_id: string | null;
  rdv_saisi_le: string | null; rdv_modifie_le: string | null; alerte_envoyee_le: string | null; cr_invitation_le: string | null;
  effectuee_le: string | null; refus_le: string | null;
  tache_etat: string | null; jour: string | null; heure: string | null; duree: number | null;
}

const CHAMPS_SUIVI = `s.id::text, s.cle, s.lot_id::text, s.occupation_ids::text[] AS occupation_ids, s.recu_le::text, s.tache_id::text,
  to_char(s.rdv_saisi_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS rdv_saisi_le,
  to_char(s.rdv_modifie_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS rdv_modifie_le,
  s.alerte_envoyee_le::text, s.cr_invitation_le::text,
  to_char(s.effectuee_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS effectuee_le,
  to_char(s.refus_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS refus_le,
  t.etat AS tache_etat, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure, t.duree_minutes AS duree`;

async function suiviOuvert(q: RequeteTx, cle: string, verrou = false): Promise<LigneSuivi | null> {
  const { rows } = await q<LigneSuivi>(
    `SELECT ${CHAMPS_SUIVI} FROM gestion_location_previsite s LEFT JOIN gestion_tache t ON t.id = s.tache_id
      WHERE s.cle = $1 AND s.clos_le IS NULL${verrou ? ' FOR UPDATE OF s' : ''}`, [cle]);
  return rows[0] ?? null;
}

/** Le suivi du préavis, créé s'il n'existe pas encore (un seul ouvert par clé : index unique). */
async function assurerSuivi(q: RequeteTx, g: Groupe): Promise<LigneSuivi> {
  await q(
    `INSERT INTO gestion_location_previsite (cle, lot_id, occupation_ids, recu_le) VALUES ($1, $2, $3::bigint[], $4::date)
     ON CONFLICT (cle) WHERE clos_le IS NULL DO NOTHING`, [g.cle, g.lotId, g.ids, g.recuLe]);
  return (await suiviOuvert(q, g.cle, true)) as LigneSuivi;
}

/** Le rendez-vous d'un suivi : sa tâche, si elle n'est pas annulée. */
const rdvDuSuivi = (s: LigneSuivi | null): RdvPrevisite | null =>
  (s === null || s.tache_id === null || s.tache_etat === 'annulee' || s.jour === null || s.heure === null ? null
    : { jour: s.jour, heure: s.heure, dureeMinutes: s.duree === null ? 60 : Number(s.duree) });

/** Les faits du statut : un rendez-vous dont la tâche a été annulée ne compte plus. PUR. */
export function faitsDuSuivi(recuLe: string, s: LigneSuivi | null): FaitsPrevisite {
  const avecRdv = rdvDuSuivi(s) !== null;
  return { recuLe, rdvSaisiLe: avecRdv ? s?.rdv_saisi_le ?? null : null, rdvModifieLe: avecRdv ? s?.rdv_modifie_le ?? null : null,
    refusLe: s?.refus_le ?? null, effectueeLe: s?.effectuee_le ?? null };
}

async function journaliser(q: RequeteTx, lignes: readonly LigneGroupe[], action: string, avant: string | null, apres: string | null, commentaire: string, auteur: Auteur): Promise<void> {
  for (const r of lignes) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
      [Number(r.locataire_id), action, avant, apres, `${commentaire} — occupation ${r.id}`, auteur.id, auteur.libelle]);
  }
}

async function aujourdhui(): Promise<string> {
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  return rows[0].j;
}

// ══ LES COLLÈGUES ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * « Destinataires » du rendez-vous : les collègues qui peuvent recevoir une tâche (actifs, adresse de notre Workspace — LA règle du
 * module de tâches) ET qui ont accès à Gestion et/ou Location. Moi en tête (par défaut à l'écran).
 */
export async function collegesPrevisite(moi: number | null): Promise<Collaborateur[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? ' OR perm_location IS TRUE' : '';
  const { rows } = await query<{ id: number }>(
    `SELECT id::int AS id FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE${location})`);
  const permis = new Set(rows.map((r) => Number(r.id)));
  return (await listerCollaborateurs(moi)).filter((c) => permis.has(Number(c.id)));
}

/** Tous les collaborateurs ayant accès à Gestion et/ou Location — chaque adresse une fois. */
export const collaborateursInternes = (): Promise<string[]> => destinatairesSortie(null);

/** Les collègues invités d'une tâche et leur réponse courante (une requête par lot de tâches). */
export async function reponsesDesTaches(tacheIds: readonly number[]): Promise<Map<number, ReponseDuCollegue[]>> {
  const m = new Map<number, ReponseDuCollegue[]>();
  if (tacheIds.length === 0) return m;
  const invites = await colonneExisteMemo('gestion_tache_demande', 'invite_id');
  const { rows } = await query<{ tache_id: string; destinataire_id: string | null; libelle: string; email: string | null; statut: string; motif: string | null }>(
    `SELECT d.tache_id::text, d.destinataire_id::text, d.destinataire_libelle AS libelle, d.destinataire_email AS email, d.statut, d.motif
       FROM gestion_tache_demande d
       ${invites ? 'LEFT JOIN gestion_tache_invite i ON i.id = d.invite_id' : ''}
      WHERE d.tache_id = ANY($1::bigint[]) AND d.statut <> 'remplacee'${invites ? ' AND (i.id IS NULL OR i.retire_le IS NULL)' : ''}
      ORDER BY d.tache_id, d.id`, [[...tacheIds]]);
  for (const r of rows) {
    const l = m.get(Number(r.tache_id)) ?? [];
    l.push({ collaborateurId: r.destinataire_id === null ? null : Number(r.destinataire_id), libelle: r.libelle, email: r.email,
      statut: r.statut === 'en_attente' || r.statut === 'acceptee' || r.statut === 'refusee' ? r.statut : null, motif: r.motif });
    m.set(Number(r.tache_id), l);
  }
  return m;
}

// ══ CE QUE LA LIGNE DU PRÉAVIS MONTRE ═══════════════════════════════════════════════════════════════════════════════════

/** Le statut de pré-visite de chaque ligne de l'accueil (lecture seule). Sans la 464 : les lignes telles quelles. */
export async function avecPrevisites<T extends { disponible: boolean; lignes: LignePreavisAccueil[] }>(r: T, maintenant: Date = new Date()): Promise<T & { previsite: boolean }> {
  if (!r.disponible || r.lignes.length === 0 || !(await previsiteDisponible())) return { ...r, previsite: r.disponible && r.lignes.length === 0 && await previsiteDisponible().catch(() => false) };
  const { rows } = await query<LigneSuivi>(
    `SELECT ${CHAMPS_SUIVI} FROM gestion_location_previsite s LEFT JOIN gestion_tache t ON t.id = s.tache_id
      WHERE s.clos_le IS NULL AND s.occupation_ids && $1::bigint[]`, [r.lignes.flatMap((l) => l.occupationIds)]);
  const reponses = await reponsesDesTaches(rows.filter((s) => s.tache_id !== null && s.tache_etat !== 'annulee').map((s) => Number(s.tache_id)));
  const jour = await aujourdhui();
  for (const l of r.lignes) {
    const s = rows.find((x) => x.recu_le === l.recuLe && x.occupation_ids.some((id) => l.occupationIds.includes(Number(id)))) ?? null;
    const rdv = rdvDuSuivi(s);
    const collegues = rdv === null ? [] : reponses.get(Number(s?.tache_id)) ?? [];
    l.previsite = {
      statut: statutPrevisite(faitsDuSuivi(l.recuLe, s), jour), rdv, tacheId: rdv === null ? null : Number(s?.tache_id),
      collegues, tousRefusent: tousRefusent(collegues.map((c) => c.statut)),
      rdvPasse: rdv !== null && finDuRendezVous(rdv.jour, rdv.heure, rdv.dureeMinutes).getTime() <= maintenant.getTime(),
      alerteEnvoyeeLe: s?.alerte_envoyee_le ?? null,
    };
  }
  return { ...r, previsite: true };
}

// ══ LE LIEN QUI OUVRE LA LIGNE, DÉPLIÉE ═════════════════════════════════════════════════════════════════════════════════

export function lienLignePreavis(occupationId: number): string {
  return `${adresseApplication().base.replace(/\/+$/, '')}/admin/location?previsite=${occupationId}`;
}

// ══ LES MAILS AUX LOCATAIRES (confirmation, modification) ═══════════════════════════════════════════════════════════════

/** Le nombre de déplacements de la tâche : la SÉQUENCE de l'invitation d'agenda (même UID, l'agenda met à jour). */
async function sequenceTache(tacheId: number): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache_action WHERE tache_id = $1 AND action = 'decalage'`, [tacheId]);
  return Number(rows[0]?.n ?? 0);
}

interface Contexte { adresse: string; lotId: number; locataires: Awaited<ReturnType<typeof locatairesAvis>>; expediteur: string;
  qui: Awaited<ReturnType<typeof emailDeLAuteur>>; brute: string; signature: { html: string; texte: string } }

async function contexte(ids: readonly number[], auteur: Auteur, deps: DepsAvis): Promise<Contexte | null> {
  const logement = await logementDe(ids[0]);
  if (logement === null) return null;
  const sig = await signatureEcran(deps);
  return { adresse: logement.adresse, lotId: logement.lotId, locataires: await locatairesAvis(ids), expediteur: (await chargerConfigGestion()).adresseGestion,
    qui: await emailDeLAuteur(auteur), brute: sig.brute, signature: sig.ecran };
}

const sansEmail = (c: Contexte): string[] => c.locataires.filter((l) => adressesUniques(l.emails).length === 0).map(prenomNom);

function icsDuRdv(c: Contexte, previsiteId: number, rdv: RdvPrevisite, sequence: number, maintenant: Date): MailPrevisite['ics'] {
  return {
    nom: NOM_FICHIER_ICS,
    contenu: invitationIcs({ uid: uidPrevisite(previsiteId, c.expediteur.split('@')[1] ?? ''), sequence, rdv, maintenant,
      titre: `Pré-visite d’état des lieux de sortie — ${c.adresse}`, lieu: c.adresse,
      description: `Pré-visite d’état des lieux de sortie du logement situé ${c.adresse} (${c.locataires.map(prenomNom).join(', ')}).` }),
  };
}

/** Le mail aux locataires (confirmation ou modification), ou `null` si aucun n'a d'adresse. PUR (le contexte est lu). */
function mailLocataires(c: Contexte, previsiteId: number, rdv: RdvPrevisite, sequence: number, ancien: RdvPrevisite | null, maintenant: Date): MailPrevisite | null {
  const a = adressesUniques(c.locataires.flatMap((l) => l.emails));
  if (a.length === 0) return null;
  return mailPrevisite({
    sorte: ancien === null ? 'previsite_locataires' : 'previsite_locataires_modif', de: c.expediteur, a, cc: copiesAvis(c.expediteur, c.qui, a),
    objet: ancien === null ? objetConfirmationLocataires(c.adresse, rdv) : objetModificationLocataires(c.adresse, rdv),
    paragraphes: ancien === null ? paragraphesConfirmationLocataires({ adresse: c.adresse, locataires: c.locataires, rdv })
      : paragraphesModificationLocataires({ adresse: c.adresse, locataires: c.locataires, rdv, ancien }),
    qui: c.qui, signature: c.signature, ics: icsDuRdv(c, previsiteId, rdv, sequence, maintenant),
  });
}

/** Le texte de l'invitation des collègues (le mail du module de tâches), pour le récapitulatif : les liens y sont personnels. */
function texteInvitationCollegue(c: Contexte, rdv: RdvPrevisite, libelle: string, invites: readonly string[], ancien: RdvPrevisite | null): string {
  const t = mailTache({
    sorte: 'invitation', destinataire: libelle, expediteur: c.qui.nom, demandeLe: new Date().toISOString(), jour: rdv.jour, heure: rdv.heure,
    dureeMinutes: rdv.dureeMinutes, titre: OBJET_TACHE_PREVISITE, notes: recapitulatifMission(c), adresse: c.adresse, contacts: [],
    invites: invites.map((x) => ({ libelle: x, statut: 'en_attente' as const, moi: x === libelle })), pieces: [],
    liens: { accepter: '[lien personnel « Accepter »]', refuser: '[lien personnel « Refuser »]', expireLe: new Date(Date.now() + 7 * 86_400_000).toISOString() },
    ...(ancien !== null ? { deplacement: ancien } : {}),
  });
  return t.texte;
}

const recapitulatifMission = (c: Pick<Contexte, 'adresse' | 'locataires'>): string =>
  [`Mission : pré-visite d’état des lieux de sortie.`, '', `Adresse : ${c.adresse}`, '',
    `Locataire${c.locataires.length > 1 ? 's' : ''} :`, ...c.locataires.map((l) => `· ${[prenomNom(l), ...adressesUniques(l.emails)].join(' — ')}`)].join('\n');

export interface MailApercu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; piece?: string | null }

// ══ PROGRAMMER — DÉPLACER — RÉAFFECTER ═════════════════════════════════════════════════════════════════════════════════

const refusTache = (r: Extract<IssueTache, { ok: false }>): IssuePrevisite<never> => ({ etat: 'refus', motif: r.motif, champ: r.champ === 'confieeA' ? 'destinataires' : (r.champ ?? null) });

async function verifierCollegues(ids: readonly number[], auteur: Auteur): Promise<string | null> {
  const permis = await collegesPrevisite(auteur.id);
  const hors = ids.filter((id) => !permis.some((c) => Number(c.id) === id));
  return hors.length === 0 ? null : 'Un des collègues choisis n’a pas accès à Gestion ou Location avec une adresse de notre Workspace.';
}

const saisieRdv = (rdv: RdvPrevisite, destinataires: readonly number[], note: string): SaisieTache => ({
  objet: OBJET_TACHE_PREVISITE, jour: rdv.jour, heure: rdv.heure, dureeMinutes: rdv.dureeMinutes, note,
  confieeA: destinataires[0], invites: destinataires.slice(1), evenementId: null, rappels: rappelsParDefaut(true),
});

export interface ResultatRdv { previsiteId: number; tacheId: number; rdv: RdvPrevisite; ancien: RdvPrevisite | null; occupationIds: number[] }

/** L'APERÇU d'un rendez-vous (programmer ou déplacer) : les textes intégraux, sans rien écrire ni envoyer. */
export async function apercuRdvPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; destinataires?: readonly number[]; deplacer?: boolean }, auteur: Auteur, deps: DepsAvis = {},
): Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  const lu = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    return g.ok ? { ok: true as const, g: g.g, s: await suiviOuvert(q, g.g.cle) } : g;
  });
  if (!lu.ok) return lu.issue;
  const ancien = d.deplacer ? rdvDuSuivi(lu.s) : null;
  if (d.deplacer && (ancien === null || lu.s?.tache_etat !== 'a_faire')) return { etat: 'refus', motif: 'Aucune pré-visite programmée à déplacer pour ce préavis.' };
  const reponses = d.deplacer && lu.s?.tache_id ? (await reponsesDesTaches([Number(lu.s.tache_id)])).get(Number(lu.s.tache_id)) ?? [] : [];
  const dest = d.deplacer ? reponses.map((r) => r.collaborateurId ?? 0) : [...(d.destinataires ?? [])];
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: dest.length > 0 ? dest : [0] }, [{ recuLe: lu.g.recuLe, dateMax: lu.g.dateMax }]);
  if (!v.ok && v.champ !== 'destinataires') return { etat: 'refus', motif: v.motif, champ: v.champ };
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const libelles = d.deplacer ? reponses.map((r) => r.libelle)
    : (await collegesPrevisite(auteur.id)).filter((x) => dest.includes(Number(x.id))).map((x) => x.libelle);
  const objetCollegue = `${ancien ? 'Rendez-vous déplacé — ' : ''}${OBJET_TACHE_PREVISITE} — ${c.adresse} — ${plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes)}`;
  const mails: MailApercu[] = libelles.map((l) => ({
    sorte: 'previsite_invitation', objet: objetCollegue, a: [l], cc: [], piece: NOM_FICHIER_ICS,
    texte: `${texteInvitationCollegue(c, rdv, l, libelles, ancien)}\n\n${c.qui.email ? `Mail envoyé par ${c.qui.nom} (${c.qui.email})` : ''}`.trim(),
  }));
  const loc = mailLocataires(c, 0, rdv, 0, ancien, new Date());
  if (loc !== null) mails.push({ sorte: loc.sorte, objet: loc.objet, a: loc.a, cc: loc.cc, texte: loc.texte, piece: NOM_FICHIER_ICS });
  return { etat: 'ok', data: { mails, sansEmail: sansEmail(c) } };
}

/** PROGRAMMER la pré-visite : la tâche (rendez-vous) et ses invités, le suivi (date de PREMIÈRE saisie), le journal. */
export async function programmerPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; destinataires: readonly number[] }, auteur: Auteur,
): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  const avant = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return g;
    const s = await suiviOuvert(q, g.g.cle, true);
    if (s !== null && s.tache_etat === 'a_faire') return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Une pré-visite est déjà programmée pour ce préavis : déplacez-la.' } };
    return g;
  });
  if (!avant.ok) return avant.issue;
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: d.destinataires }, [{ recuLe: avant.g.recuLe, dateMax: avant.g.dateMax }]);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const horsDroit = await verifierCollegues(v.destinataires, auteur);
  if (horsDroit !== null) return { etat: 'refus', motif: horsDroit, champ: 'destinataires' };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  const c = await contexte(ids, auteur, {});
  const t = await creerTache(avant.g.lotId, saisieRdv(rdv, v.destinataires, c === null ? 'Mission : pré-visite d’état des lieux de sortie.' : recapitulatifMission(c)), auteur);
  if (!t.ok) return refusTache(t);
  const lien = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return { ok: false as const, issue: g.issue };
    const s = await assurerSuivi(q, g.g);
    if (s.tache_id !== null && s.tache_etat === 'a_faire') {
      return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Une pré-visite vient d’être programmée par quelqu’un d’autre pour ce préavis.' } };
    }
    await q(
      `UPDATE gestion_location_previsite SET tache_id = $2, occupation_ids = $3::bigint[], rdv_saisi_le = coalesce(rdv_saisi_le, now()),
              rdv_saisi_par_libelle = coalesce(rdv_saisi_par_libelle, $4), rdv_modifie_le = now(), cr_invitation_le = NULL
        WHERE id = $1`, [Number(s.id), t.id, g.g.ids, auteur.libelle]);
    await journaliser(q, g.g.lignes, 'location_previsite_programmee', null, plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes),
      `pré-visite d’état des lieux de sortie programmée le ${plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes)} — tâche ${t.id}`, auteur);
    return { ok: true as const, id: Number(s.id) };
  });
  if (!lien.ok) { await annulerTache(t.id, auteur); return lien.issue; }
  return { etat: 'ok', data: { previsiteId: lien.id, tacheId: t.id, rdv, ancien: null, occupationIds: ids }, demandes: t.demandes ?? (t.demande ? [t.demande] : []) };
}

/** Le suivi et sa tâche À FAIRE, sous verrou, ou le refus. */
async function rdvCourant(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; g: Groupe; s: LigneSuivi; rdv: RdvPrevisite } | { ok: false; issue: IssuePrevisite<never> }> {
  const g = await lireGroupe(q, ids);
  if (!g.ok) return g;
  const s = await suiviOuvert(q, g.g.cle, true);
  const rdv = rdvDuSuivi(s);
  if (s === null || rdv === null || s.tache_etat !== 'a_faire') return { ok: false, issue: { etat: 'refus', motif: 'Aucune pré-visite programmée pour ce préavis.' } };
  return { ok: true, g: g.g, s, rdv };
}

/**
 * DÉPLACER le rendez-vous : nouvelle date / créneau — le module de tâches remet les statuts à zéro et renvoie « Tâche déplacée » à
 * chaque collègue ; le suivi garde sa date de PREMIÈRE saisie ; l'invitation au compte rendu redevient à faire.
 */
export async function deplacerPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string }, auteur: Auteur,
): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  const avant = await withTransaction(async (q) => rdvCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: [1] }, [{ recuLe: avant.g.recuLe, dateMax: avant.g.dateMax }]);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  if (rdv.jour === avant.rdv.jour && rdv.heure === avant.rdv.heure && rdv.dureeMinutes === avant.rdv.dureeMinutes) {
    return { etat: 'refus', motif: 'La pré-visite est déjà à cette date et à ce créneau.' };
  }
  const tacheId = Number(avant.s.tache_id);
  const t = await decalerTache(tacheId, { jour: rdv.jour, heure: rdv.heure, dureeMinutes: rdv.dureeMinutes }, auteur);
  if (!t.ok) return refusTache(t);
  await withTransaction(async (q) => {
    await q('UPDATE gestion_location_previsite SET rdv_modifie_le = now(), cr_invitation_le = NULL WHERE id = $1', [Number(avant.s.id)]);
    await journaliser(q, avant.g.lignes, 'location_previsite_deplacee', plageFr(avant.rdv.jour, avant.rdv.heure, avant.rdv.dureeMinutes),
      plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes), `pré-visite déplacée — tâche ${tacheId}`, auteur);
  });
  return { etat: 'ok', data: { previsiteId: Number(avant.s.id), tacheId, rdv, ancien: avant.rdv, occupationIds: ids }, demandes: t.demandes ?? (t.demande ? [t.demande] : []) };
}

/**
 * RÉAFFECTER après que TOUS ont refusé : d'autres collègues (ou les mêmes) — chacun une nouvelle demande, un nouveau mail. Rien
 * n'est supprimé : le module de tâches garde les refus dans sa trace.
 */
export async function reaffecterPrevisite(d: { occupationIds: readonly number[]; destinataires: readonly number[] }, auteur: Auteur): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  const dest = [...new Set(d.destinataires.filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (dest.length === 0) return { etat: 'refus', motif: 'Choisissez au moins un collègue.', champ: 'destinataires' };
  const avant = await withTransaction(async (q) => rdvCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const tacheId = Number(avant.s.tache_id);
  const reponses = (await reponsesDesTaches([tacheId])).get(tacheId) ?? [];
  if (!tousRefusent(reponses.map((r) => r.statut))) return { etat: 'refus', motif: 'Tous les collègues n’ont pas refusé : déplacez la pré-visite pour changer de personne.' };
  const horsDroit = await verifierCollegues(dest, auteur);
  if (horsDroit !== null) return { etat: 'refus', motif: horsDroit, champ: 'destinataires' };
  const { rows } = await query<{ note: string | null }>('SELECT note FROM gestion_tache WHERE id = $1', [tacheId]);
  const t = await modifierTache(tacheId, saisieRdv(avant.rdv, dest, rows[0]?.note ?? ''), auteur);
  if (!t.ok) return refusTache(t);
  const demandes = [...(t.demandes ?? (t.demande ? [t.demande] : []))];
  // Un collègue gardé qui avait refusé : son invitation est renvoyée (nouvelle demande, statut remis « en attente »).
  if (await colonneExisteMemo('gestion_tache_demande', 'invite_id')) {
    const { rows: inv } = await query<{ id: string; collaborateur_id: string | null; statut: string | null }>(
      `SELECT i.id::text, i.collaborateur_id::text, (SELECT d.statut FROM gestion_tache_demande d WHERE d.invite_id = i.id AND d.statut <> 'remplacee' LIMIT 1) AS statut
         FROM gestion_tache_invite i WHERE i.tache_id = $1 AND i.retire_le IS NULL`, [tacheId]);
    for (const i of inv.filter((x) => x.statut === 'refusee' && dest.includes(Number(x.collaborateur_id)))) {
      const r = await renvoyerInvitation(tacheId, Number(i.id), auteur);
      if (r.ok) demandes.push(...r.demandes);
    }
  }
  await withTransaction(async (q) => journaliser(q, avant.g.lignes, 'location_previsite_reaffectee', reponses.map((r) => r.libelle).join(', '), dest.join(', '),
    `pré-visite réaffectée après le refus de tous les collègues — tâche ${tacheId}`, auteur));
  return { etat: 'ok', data: { previsiteId: Number(avant.s.id), tacheId, rdv: avant.rdv, ancien: null, occupationIds: ids }, demandes };
}

/** APRÈS le rendez-vous écrit : le mail aux locataires (confirmation, ou modification avec l'ancien créneau). Ne lève jamais. */
export async function envoyerMailLocatairesPrevisite(r: ResultatRdv, auteur: Auteur, deps: DepsAvis & { maintenant?: Date } = {}): Promise<{ envois: EnvoiAvis[]; sansEmail: string[] }> {
  try {
    if (!(await mailsAvisDisponibles())) return { envois: [], sansEmail: [] };
    const c = await contexte(r.occupationIds, auteur, deps);
    if (c === null) return { envois: [], sansEmail: [] };
    const m = mailLocataires(c, r.previsiteId, r.rdv, await sequenceTache(r.tacheId), r.ancien, deps.maintenant ?? new Date());
    return { envois: m === null ? [] : await envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds: r.occupationIds, auteur }, deps), sansEmail: sansEmail(c) };
  } catch (e) {
    return { envois: [{ sorte: 'previsite_locataires', objet: 'Mail aux locataires', a: [], cc: [], envoye: false, motif: (e as Error)?.message || 'erreur inattendue' }], sansEmail: [] };
  }
}

// ══ LE COMPTE RENDU ═════════════════════════════════════════════════════════════════════════════════════════════════════

async function mailCompteRendu(ids: readonly number[], corps: string, aussiLocataires: boolean, auteur: Auteur, deps: DepsAvis):
  Promise<IssuePrevisite<{ mail: MailPrevisite; c: Contexte; s: LigneSuivi; g: Groupe; rdv: RdvPrevisite; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const texte = (corps ?? '').trim();
  if (texte === '') return { etat: 'refus', motif: 'Écrivez le compte rendu.', champ: 'corps' };
  if (texte.length > CORPS_MAX) return { etat: 'refus', motif: `Le compte rendu dépasse ${CORPS_MAX} caractères.`, champ: 'corps' };
  const lu = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    return g.ok ? { ok: true as const, g: g.g, s: await suiviOuvert(q, g.g.cle) } : g;
  });
  if (!lu.ok) return lu.issue;
  const rdv = rdvDuSuivi(lu.s);
  if (lu.s === null || rdv === null) return { etat: 'refus', motif: 'Aucune pré-visite programmée pour ce préavis.' };
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const internes = await collaborateursInternes();
  const locs = aussiLocataires ? adressesUniques(c.locataires.flatMap((l) => l.emails)) : [];
  const a = locs.length > 0 ? locs : internes;
  const mail = mailPrevisite({ sorte: 'previsite_compte_rendu', de: c.expediteur, a, cc: locs.length > 0 ? adressesUniques(internes, locs) : [],
    objet: objetCompteRendu(rdv), paragraphes: paragraphesDuTexte(texte), qui: c.qui, signature: c.signature });
  return { etat: 'ok', data: { mail, c, s: lu.s, g: lu.g, rdv, sansEmail: aussiLocataires ? sansEmail(c) : [] } };
}

export async function apercuCompteRendu(d: { occupationIds: readonly number[]; corps: string; aussiLocataires: boolean }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  const r = await mailCompteRendu([...new Set(d.occupationIds)], d.corps, d.aussiLocataires, auteur, deps);
  if (r.etat !== 'ok') return r;
  const m = r.data.mail;
  return { etat: 'ok', data: { mails: [{ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, texte: m.texte }], sansEmail: r.data.sansEmail } };
}

/** ENVOIE le compte rendu ; dès qu'il est parti, le préavis passe en « Pré-visite effectuée » (et la tâche est faite). */
export async function envoyerCompteRendu(d: { occupationIds: readonly number[]; corps: string; aussiLocataires: boolean }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ envois: EnvoiAvis[]; statut: StatutPrevisite | null }>> {
  const ids = [...new Set(d.occupationIds)];
  const r = await mailCompteRendu(ids, d.corps, d.aussiLocataires, auteur, deps);
  if (r.etat !== 'ok') return r;
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: 'Les mails de la Location demandent la migration 457 : rien n’est parti.' };
  const envois = await envoyerSerie([r.data.mail], r.data.c.brute, { lotId: r.data.c.lotId, occupationIds: ids, auteur }, deps);
  if (!envois.some((e) => e.envoye)) return { etat: 'ok', data: { envois, statut: null } };
  await withTransaction(async (q) => {
    await q('UPDATE gestion_location_previsite SET effectuee_le = now(), effectuee_par_libelle = $2 WHERE id = $1 AND effectuee_le IS NULL', [Number(r.data.s.id), auteur.libelle]);
    await journaliser(q, r.data.g.lignes, 'location_previsite_effectuee', null, r.data.mail.objet, `compte rendu de pré-visite envoyé à ${r.data.mail.a.join(', ')}`, auteur);
  });
  if (r.data.s.tache_etat === 'a_faire') await marquerFaite(Number(r.data.s.tache_id), auteur).catch(() => null);
  return { etat: 'ok', data: { envois, statut: 'effectuee' } };
}

// ══ LE REFUS / L'ABSENCE DE PRÉ-VISITE ══════════════════════════════════════════════════════════════════════════════════

/** Le texte prérempli de la modale (lecture seule). */
export async function texteRefusPropose(ids: readonly number[], auteur: Auteur): Promise<IssuePrevisite<{ texte: string; objet: string; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const c = await contexte([...new Set(ids)], auteur, { signatureBrute: async () => '' });
  if (c === null) return { etat: 'inconnu' };
  return { etat: 'ok', data: { texte: texteRefusPrevisite({ adresse: c.adresse, locataires: c.locataires }), objet: objetRefusPrevisite(c.adresse), sansEmail: sansEmail(c) } };
}

async function mailRefus(ids: readonly number[], texte: string, auteur: Auteur, deps: DepsAvis):
  Promise<IssuePrevisite<{ mail: MailPrevisite; c: Contexte; g: Groupe; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const t = (texte ?? '').trim();
  if (t === '') return { etat: 'refus', motif: 'Le texte du mail est vide.', champ: 'texte' };
  if (t.length > CORPS_MAX) return { etat: 'refus', motif: `Le texte dépasse ${CORPS_MAX} caractères.`, champ: 'texte' };
  const g = await withTransaction(async (q) => lireGroupe(q, ids));
  if (!g.ok) return g.issue;
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const internes = await collaborateursInternes();
  const locs = adressesUniques(c.locataires.flatMap((l) => l.emails));
  // Aux locataires, copie à tous les collaborateurs (une fois par adresse) ; aucun locataire joignable : aux seuls collaborateurs.
  const a = locs.length > 0 ? locs : internes;
  const mail = mailPrevisite({ sorte: 'previsite_refus', de: c.expediteur, a, cc: locs.length > 0 ? adressesUniques(internes, locs) : [],
    objet: objetRefusPrevisite(c.adresse), paragraphes: paragraphesDuTexte(t), qui: c.qui, signature: c.signature });
  return { etat: 'ok', data: { mail, c, g: g.g, sansEmail: sansEmail(c) } };
}

export async function apercuRefus(d: { occupationIds: readonly number[]; texte: string }, auteur: Auteur, deps: DepsAvis = {}): Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  const r = await mailRefus([...new Set(d.occupationIds)], d.texte, auteur, deps);
  if (r.etat !== 'ok') return r;
  const m = r.data.mail;
  return { etat: 'ok', data: { mails: [{ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, texte: m.texte }], sansEmail: r.data.sansEmail } };
}

/** ENVOIE le mail de refus / absence ; parti, le préavis passe en « Pré-visite refusée / absente » et l'alerte tombe. */
export async function envoyerRefus(d: { occupationIds: readonly number[]; texte: string }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ envois: EnvoiAvis[]; statut: StatutPrevisite | null }>> {
  const ids = [...new Set(d.occupationIds)];
  const r = await mailRefus(ids, d.texte, auteur, deps);
  if (r.etat !== 'ok') return r;
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: 'Les mails de la Location demandent la migration 457 : rien n’est parti.' };
  const envois = await envoyerSerie([r.data.mail], r.data.c.brute, { lotId: r.data.c.lotId, occupationIds: ids, auteur }, deps);
  if (!envois.some((e) => e.envoye)) return { etat: 'ok', data: { envois, statut: null } };
  await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return;
    const s = await assurerSuivi(q, g.g);
    await q('UPDATE gestion_location_previsite SET refus_le = now(), refus_par_libelle = $2 WHERE id = $1', [Number(s.id), auteur.libelle]);
    await journaliser(q, g.g.lignes, 'location_previsite_refusee', null, r.data.mail.objet, `mail de refus / absence de pré-visite envoyé à ${r.data.mail.a.join(', ')}`, auteur);
  });
  return { etat: 'ok', data: { envois, statut: 'refusee' } };
}

// ══ LES ENVOIS AUTOMATIQUES (le démon de la Gestion, à chaque tour) ═════════════════════════════════════════════════════

/**
 * L'ALERTE DU 11e JOUR, UNE SEULE FOIS : pour chaque préavis en cours en alerte et jamais alerté, le suivi est créé, puis RÉSERVÉ
 * (`UPDATE … SET alerte_envoyee_le = now() WHERE alerte_envoyee_le IS NULL` — deux passes simultanées ne peuvent pas toutes deux le
 * prendre), puis UN mail part, À : tous les collaborateurs ayant accès à Gestion et/ou Location (chaque adresse une fois). Un échec
 * d'envoi rend la réservation (la passe suivante réessaie) ; un envoi réussi ne se refait jamais.
 */
export async function passeAlertesPrevisite(
  lignes: readonly LignePreavisAccueil[], deps: DepsAvis & { maintenant?: Date } = {},
): Promise<{ alertes: number; echecs: number }> {
  const bilan = { alertes: 0, echecs: 0 };
  if (lignes.length === 0 || !(await previsiteDisponible()) || !(await mailsAvisDisponibles())) return bilan;
  const jour = await aujourdhui();
  for (const l of lignes) {
    const reserve = await withTransaction(async (q) => {
      const g = await lireGroupe(q, l.occupationIds);
      if (!g.ok) return null;
      const s0 = await suiviOuvert(q, g.g.cle);
      if (s0?.alerte_envoyee_le || !enAlerte(faitsDuSuivi(g.g.recuLe, s0), jour)) return null;
      const s = await assurerSuivi(q, g.g);
      const { rows } = await q<{ id: string }>(
        'UPDATE gestion_location_previsite SET alerte_envoyee_le = now() WHERE id = $1 AND alerte_envoyee_le IS NULL RETURNING id::text', [Number(s.id)]);
      return rows.length === 0 ? null : { id: Number(s.id), g: g.g };
    });
    if (reserve === null) continue;
    const ok = await (async () => {
      const c = await contexte(reserve.g.ids, AUTEUR_AUTOMATIQUE, deps);
      const internes = await collaborateursInternes();
      if (c === null || internes.length === 0) return false;
      const m = mailPrevisite({ sorte: 'previsite_alerte', de: c.expediteur, a: internes, cc: [], objet: objetAlertePrevisite(c.adresse),
        paragraphes: paragraphesAlertePrevisite({ adresse: c.adresse, locataires: c.locataires, recuLe: reserve.g.recuLe, dateMax: reserve.g.dateMax, lien: lienLignePreavis(reserve.g.ids[0]) }),
        qui: { mention: MENTION_AUTOMATIQUE }, signature: c.signature });
      const e = await envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds: reserve.g.ids, auteur: AUTEUR_AUTOMATIQUE }, deps);
      return e.some((x) => x.envoye);
    })().catch(() => false);
    if (ok) bilan.alertes += 1;
    else {
      bilan.echecs += 1;
      await query('UPDATE gestion_location_previsite SET alerte_envoyee_le = NULL WHERE id = $1', [reserve.id]).catch(() => {});
    }
  }
  return bilan;
}

/**
 * L'INVITATION AU COMPTE RENDU, une fois par rendez-vous (un déplacement la remet à faire) : la fin du rendez-vous est passée, ni compte
 * rendu ni refus depuis. À : les collègues destinataires qui n'ont pas refusé (tous, si tous ont refusé), avec le lien qui ouvre la ligne.
 */
export async function passeInvitationsCompteRendu(deps: DepsAvis & { maintenant?: Date } = {}): Promise<{ invitations: number; echecs: number }> {
  const bilan = { invitations: 0, echecs: 0 };
  if (!(await previsiteDisponible()) || !(await mailsAvisDisponibles())) return bilan;
  const maintenant = deps.maintenant ?? new Date();
  const { rows } = await query<LigneSuivi>(
    `SELECT ${CHAMPS_SUIVI} FROM gestion_location_previsite s JOIN gestion_tache t ON t.id = s.tache_id
      WHERE s.clos_le IS NULL AND s.cr_invitation_le IS NULL AND s.effectuee_le IS NULL AND t.etat = 'a_faire'
        AND t.jour <= (now() AT TIME ZONE 'Europe/Paris')::date`);
  for (const s of rows) {
    const rdv = rdvDuSuivi(s);
    if (rdv === null || finDuRendezVous(rdv.jour, rdv.heure, rdv.dureeMinutes).getTime() > maintenant.getTime()) continue;
    if (statutPrevisite(faitsDuSuivi(s.recu_le, s), rdv.jour) === 'refusee') continue;
    const { rows: pris } = await query<{ id: string }>(
      'UPDATE gestion_location_previsite SET cr_invitation_le = now() WHERE id = $1 AND cr_invitation_le IS NULL RETURNING id::text', [Number(s.id)]);
    if (pris.length === 0) continue;
    const ok = await (async () => {
      const ids = s.occupation_ids.map(Number);
      const c = await contexte(ids, AUTEUR_AUTOMATIQUE, deps);
      const reponses = (await reponsesDesTaches([Number(s.tache_id)])).get(Number(s.tache_id)) ?? [];
      const gardes = reponses.filter((r) => r.statut !== 'refusee');
      const a = adressesUniques((gardes.length > 0 ? gardes : reponses).map((r) => r.email));
      if (c === null || a.length === 0) return false;
      const m = mailPrevisite({ sorte: 'previsite_invitation_cr', de: c.expediteur, a, cc: [], objet: objetInvitationCompteRendu(c.adresse, rdv),
        paragraphes: paragraphesInvitationCompteRendu({ adresse: c.adresse, locataires: c.locataires, rdv, lien: lienLignePreavis(ids[0]) }),
        qui: { mention: MENTION_AUTOMATIQUE }, signature: c.signature });
      const e = await envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds: ids, auteur: AUTEUR_AUTOMATIQUE }, deps);
      return e.some((x) => x.envoye);
    })().catch(() => false);
    if (ok) bilan.invitations += 1;
    else {
      bilan.echecs += 1;
      await query('UPDATE gestion_location_previsite SET cr_invitation_le = NULL WHERE id = $1', [Number(s.id)]).catch(() => {});
    }
  }
  return bilan;
}

/** « 12/11/2026 de 10h00 à 11h00 » (réexport pour l'écran du résultat). */
export const libelleRdv = (r: RdvPrevisite): string => creneauFr(r);
export const libelleRecu = (iso: string): string => dateFrPreavis(iso);
