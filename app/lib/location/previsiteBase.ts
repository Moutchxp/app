import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import type { DemandePosee } from '../gestion/acceptationRepo';
import { chargerConfigGestion } from '../gestion/config';
import { adresseApplication } from '../gestion/adresseApplication';
import { tachesDisponibles } from '../gestion/schema';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { destinatairesSortie } from './sortieLocatairesRepo';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { adressesUniques, copiesAvis, prenomNom } from './mailsPreavisSortie';
import { locatairesAvis, logementDe, signatureEcran, type DepsAvis } from './mailsPreavisSortieRepo';
import type { LignePreavisAccueil } from './preavis';
import {
  NOM_FICHIER_ICS, finDuRendezVous, invitationIcs, mailPrevisite, objetConfirmationLocataires, objetModificationLocataires,
  paragraphesConfirmationLocataires, paragraphesModificationLocataires, statutPrevisite, tousRefusent, uidPrevisite,
  type FaitsPrevisite, type MailPrevisite, type RdvPrevisite, type ReponseDuCollegue,
} from './previsite';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE — LA BASE COMMUNE DU DÉPÔT (Arno, 10/11/2026) ════════════════════════════════════════════════════════════
 * Ce que l'écran, la route ET le démon de la Gestion partagent : le préavis et son suivi (migration 464), les réponses des collègues,
 * les mails aux locataires. 🔴 AUCUN module `server-only` ici (ni le module de tâches) : le démon (`relever-gestion-continu`, tsx)
 * l'atteint par `previsiteAuto.ts` — le garde `serverOnly.guard.test.ts` le vérifie.
 */

export const previsiteDisponible = async (): Promise<boolean> =>
  (await colonneExisteMemo('gestion_location_previsite', 'cle')) && (await colonneExisteMemo('gestion_location_preavis', 'date_max')) && (await tachesDisponibles());

export type IssuePrevisite<T> =
  | { etat: 'ok'; data: T; demandes?: DemandePosee[] }
  | { etat: 'refus'; motif: string; champ?: string | null }
  | { etat: 'inconnu' }
  | { etat: 'sans_schema' };

export const SANS_SCHEMA = { etat: 'sans_schema' as const };
/** L'auteur des envois automatiques (journal : libellé obligatoire). */
export const AUTEUR_AUTOMATIQUE: Auteur = { id: null, libelle: 'Envoi automatique (pré-visite)' };

// ══ LE PRÉAVIS (ses occupations) ════════════════════════════════════════════════════════════════════════════════════════

export type LigneGroupe = { id: string; locataire_id: string; lot_id: string; sortie: string | null; recu_le: string | null; date_max: string | null;
  entree: string | null; bail_id: string | null };
export interface Groupe { lignes: LigneGroupe[]; lotId: number; cle: string; recuLe: string; dateMax: string; ids: number[] }

/** La clé d'un préavis : le bail (ou le logement + l'entrée) et la date de réception — elle survit à une correction de la durée. PUR. */
export function clePrevisite(l: { bail_id: string | null; lot_id: string; entree: string | null; recu_le: string }): string {
  return l.bail_id !== null ? `bail:${l.bail_id}|${l.recu_le}` : `lot:${l.lot_id}|${l.entree ?? ''}|${l.recu_le}`;
}

export async function lireGroupe(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; g: Groupe } | { ok: false; issue: IssuePrevisite<never> }> {
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

export const CHAMPS_SUIVI = `s.id::text, s.cle, s.lot_id::text, s.occupation_ids::text[] AS occupation_ids, s.recu_le::text, s.tache_id::text,
  to_char(s.rdv_saisi_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS rdv_saisi_le,
  to_char(s.rdv_modifie_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS rdv_modifie_le,
  s.alerte_envoyee_le::text, s.cr_invitation_le::text,
  to_char(s.effectuee_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS effectuee_le,
  to_char(s.refus_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS refus_le,
  t.etat AS tache_etat, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure, t.duree_minutes AS duree`;

export async function suiviOuvert(q: RequeteTx, cle: string, verrou = false): Promise<LigneSuivi | null> {
  const { rows } = await q<LigneSuivi>(
    `SELECT ${CHAMPS_SUIVI} FROM gestion_location_previsite s LEFT JOIN gestion_tache t ON t.id = s.tache_id
      WHERE s.cle = $1 AND s.clos_le IS NULL${verrou ? ' FOR UPDATE OF s' : ''}`, [cle]);
  return rows[0] ?? null;
}

/** Le suivi du préavis, créé s'il n'existe pas encore (un seul ouvert par clé : index unique). */
export async function assurerSuivi(q: RequeteTx, g: Groupe): Promise<LigneSuivi> {
  await q(
    `INSERT INTO gestion_location_previsite (cle, lot_id, occupation_ids, recu_le) VALUES ($1, $2, $3::bigint[], $4::date)
     ON CONFLICT (cle) WHERE clos_le IS NULL DO NOTHING`, [g.cle, g.lotId, g.ids, g.recuLe]);
  return (await suiviOuvert(q, g.cle, true)) as LigneSuivi;
}

/** Le rendez-vous d'un suivi : sa tâche, si elle n'est pas annulée. */
export const rdvDuSuivi = (s: LigneSuivi | null): RdvPrevisite | null =>
  (s === null || s.tache_id === null || s.tache_etat === 'annulee' || s.jour === null || s.heure === null ? null
    : { jour: s.jour, heure: s.heure, dureeMinutes: s.duree === null ? 60 : Number(s.duree) });

/** Les faits du statut : un rendez-vous dont la tâche a été annulée ne compte plus. PUR. */
export function faitsDuSuivi(recuLe: string, s: LigneSuivi | null): FaitsPrevisite {
  const avecRdv = rdvDuSuivi(s) !== null;
  return { recuLe, rdvSaisiLe: avecRdv ? s?.rdv_saisi_le ?? null : null, rdvModifieLe: avecRdv ? s?.rdv_modifie_le ?? null : null,
    refusLe: s?.refus_le ?? null, effectueeLe: s?.effectuee_le ?? null };
}

export async function journaliser(q: RequeteTx, lignes: readonly LigneGroupe[], action: string, avant: string | null, apres: string | null, commentaire: string, auteur: Auteur): Promise<void> {
  for (const r of lignes) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
      [Number(r.locataire_id), action, avant, apres, `${commentaire} — occupation ${r.id}`, auteur.id, auteur.libelle]);
  }
}

export async function aujourdhui(): Promise<string> {
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  return rows[0].j;
}

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
export async function sequenceTache(tacheId: number): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache_action WHERE tache_id = $1 AND action = 'decalage'`, [tacheId]);
  return Number(rows[0]?.n ?? 0);
}

export interface Contexte { adresse: string; lotId: number; locataires: Awaited<ReturnType<typeof locatairesAvis>>; expediteur: string;
  qui: Awaited<ReturnType<typeof emailDeLAuteur>>; brute: string; signature: { html: string; texte: string } }

export async function contexte(ids: readonly number[], auteur: Auteur, deps: DepsAvis): Promise<Contexte | null> {
  const logement = await logementDe(ids[0]);
  if (logement === null) return null;
  const sig = await signatureEcran(deps);
  return { adresse: logement.adresse, lotId: logement.lotId, locataires: await locatairesAvis(ids), expediteur: (await chargerConfigGestion()).adresseGestion,
    qui: await emailDeLAuteur(auteur), brute: sig.brute, signature: sig.ecran };
}

export const sansEmail = (c: Contexte): string[] => c.locataires.filter((l) => adressesUniques(l.emails).length === 0).map(prenomNom);

export function icsDuRdv(c: Contexte, previsiteId: number, rdv: RdvPrevisite, sequence: number, maintenant: Date): MailPrevisite['ics'] {
  return {
    nom: NOM_FICHIER_ICS,
    contenu: invitationIcs({ uid: uidPrevisite(previsiteId, c.expediteur.split('@')[1] ?? ''), sequence, rdv, maintenant,
      titre: `Pré-visite d’état des lieux de sortie — ${c.adresse}`, lieu: c.adresse,
      description: `Pré-visite d’état des lieux de sortie du logement situé ${c.adresse} (${c.locataires.map(prenomNom).join(', ')}).` }),
  };
}

/** Le mail aux locataires (confirmation ou modification), ou `null` si aucun n'a d'adresse. PUR (le contexte est lu). */
export function mailLocataires(c: Contexte, previsiteId: number, rdv: RdvPrevisite, sequence: number, ancien: RdvPrevisite | null, maintenant: Date): MailPrevisite | null {
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

export const recapitulatifMission = (c: Pick<Contexte, 'adresse' | 'locataires'>): string =>
  [`Mission : pré-visite d’état des lieux de sortie.`, '', `Adresse : ${c.adresse}`, '',
    `Locataire${c.locataires.length > 1 ? 's' : ''} :`, ...c.locataires.map((l) => `· ${[prenomNom(l), ...adressesUniques(l.emails)].join(' — ')}`)].join('\n');

export interface MailApercu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; piece?: string | null }
