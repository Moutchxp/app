import 'server-only';
import { query, withTransaction, type RequeteTx } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { colonnesTrace } from '../../gestion/traceJournal';
import { suppressionPersonneDisponible } from '../../gestion/schema';
import { marquerPersonneSupprimeeTx } from '../../gestion/annuaireEditionRepo';
import type { Auteur } from '../../gestion/rattachementRepo';
import { ECRAN_SUIVI_MOIS } from './ligneSuivi';

/**
 * ══ 🔴🔴 LOT LS1 (Arno, 30/10/2026, option A) — SUPPRIMER UNE LOCATION (Suivi du mois) ══════════════════════════════════════════════════════
 * Suppression autorisée par Arno. Ce qui part, et seulement cela :
 *   · la LIGNE de location (`gestion_location_activite`) : marquée annulée (`annule_le`, qui, quand) — toutes les lectures de la Location
 *     l'écartent déjà (suivi du mois, Le mois, L'année, CA, compteurs, primes, apporteurs, collègues, fiche du bien de la Location) ;
 *   · la FICHE de chaque locataire de la location, par la suppression de fiche existante (`marquerPersonneSupprimeeTx` : annuaire,
 *     recherches, propositions), le garde « dernière carte complète » LEVÉ pour ce seul geste (décision d'Arno) ;
 *   · 🔴 SAUF un locataire rattaché à un AUTRE bien (une occupation sur un autre lot, à toute date) ou à une AUTRE location vivante : sa fiche,
 *     ses coordonnées et son autre rattachement restent intacts ; seul son lien avec la location supprimée disparaît (la ligne). La location sur
 *     l'autre bien n'est touchée en rien.
 * Ce qui reste, sans aucune écriture : le bien, son ou ses propriétaires, le mandat de gestion, le bail et les occupations (option A : la tuile
 * Gestion — mails, Drive, historique, fiche du bien — n'est pas touchée ; sa fiche du bien peut encore montrer l'ancien locataire).
 * Aucun DELETE. Journalisé (la location, et chaque fiche supprimée). Le plan est RECALCULÉ dans la transaction, verrous posés : ce que l'écran
 * a montré ne fait jamais foi (un appel direct, une fenêtre restée ouverte).
 */

export interface LocataireDuPlan { id: number; nom: string; conserve: boolean;
  /** Le bien (ou la location) qui le retient ; null : sa fiche est supprimée. */
  autreBien: string | null }
export interface PlanSuppression { id: number; bien: string; dateSignature: string; locataires: LocataireDuPlan[] }
export type IssueSuppression = { etat: 'ok'; data: PlanSuppression } | { etat: 'inconnu' } | { etat: 'refus'; motif: string };

const n = (x: unknown): number => Number(x);
const NOM_LOCATAIRE = `coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom, 'Locataire sans nom')`;
const LIBELLE_LOT = (alias: string): string => `coalesce(nullif(btrim(concat_ws(', ', ${alias}.adresse, nullif(btrim(concat_ws(' ', ${alias}.code_postal, ${alias}.commune)), ''))), ''), 'lot ' || ${alias}.wippimmo_id::text, 'lot n° ' || ${alias}.id::text)`;

/**
 * LE PLAN : la location (son bien, sa date), ses locataires et, pour chacun, ce qui le retient ailleurs. Lu dans la transaction de l'appelant
 * (`q`), ou seul pour la fenêtre de confirmation. null : location inconnue ou déjà supprimée.
 */
export async function planSuppression(q: RequeteTx, id: number, verrou = false): Promise<PlanSuppression | null> {
  const avecBailOcc = await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id');
  const avecLotCp = await colonneExisteMemo('gestion_annuaire_lot', 'code_postal');
  const libelleLot = avecLotCp ? LIBELLE_LOT : (a: string) => `coalesce(nullif(btrim(${a}.adresse), ''), 'lot n° ' || ${a}.id::text)`;
  const { rows } = await q<{ id: string; date: string; bail_id: string | null; lot_id: string | null; locataire_id: string | null; bien: string | null; libelle: string | null }>(
    `SELECT a.id, to_char(a.date_signature, 'YYYY-MM-DD') AS date, a.bail_id, a.lot_id, a.locataire_id, ${libelleLot('l')} AS bien,
            coalesce(nullif(btrim(a.libelle_proprietaire), ''), nullif(btrim(a.libelle_locataire), '')) AS libelle
       FROM gestion_location_activite a LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
      WHERE a.id = $1 AND a.annule_le IS NULL${verrou ? ' FOR UPDATE OF a' : ''}`, [id]);
  const a = rows[0];
  if (a === undefined) return null;
  // Les locataires de la location : les occupants de son bail (comme la ligne du Suivi), sinon le locataire de la ligne.
  const { rows: locs } = await q<{ id: string; nom: string; supprime: boolean }>(
    `SELECT lo.id, ${NOM_LOCATAIRE} AS nom, ${await suppressionPersonneDisponible() ? 'lo.supprime_le IS NOT NULL' : 'false'} AS supprime
       FROM gestion_annuaire_locataire lo
      WHERE lo.id = $2 OR ($1::bigint IS NOT NULL AND ${avecBailOcc ? 'lo.id IN (SELECT oc.locataire_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = $1)' : 'false'})
      ORDER BY lo.id${verrou ? ' FOR UPDATE OF lo' : ''}`, [a.bail_id, a.locataire_id]);
  // Les lots de la location (celui de la ligne, ceux de son bail) : un rattachement à l'un d'eux n'est pas « un autre bien ».
  const { rows: lotsLoc } = await q<{ id: string }>(
    `SELECT DISTINCT x.id FROM (SELECT $1::bigint AS id ${avecBailOcc ? 'UNION SELECT oc.lot_id FROM gestion_annuaire_occupation oc WHERE $2::bigint IS NOT NULL AND oc.bail_id = $2' : ''}
       UNION SELECT b.lot_id FROM gestion_bail b WHERE b.id = $2) x WHERE x.id IS NOT NULL`, [a.lot_id, a.bail_id]);
  const lots = lotsLoc.map((r) => n(r.id));
  const locataires: LocataireDuPlan[] = [];
  for (const lo of locs.filter((x) => !x.supprime)) {
    // 🔴 L'EXCEPTION D'ARNO : une occupation sur un AUTRE lot (à toute date), ou une AUTRE location vivante qui le nomme (son locataire, ou un
    // occupant de son bail) — la première trouvée nomme le bien qui le retient.
    const { rows: autre } = await q<{ bien: string }>(
      `SELECT bien FROM (
         SELECT ${libelleLot('l')} AS bien, 1 AS rang, o.id AS cle FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot l ON l.id = o.lot_id
          WHERE o.locataire_id = $1 AND NOT (o.lot_id = ANY($2::bigint[]))
         UNION ALL
         SELECT coalesce(${libelleLot('l')}, nullif(btrim(a.libelle_proprietaire), ''), 'une autre location') AS bien, 2 AS rang, a.id AS cle
           FROM gestion_location_activite a LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
          WHERE a.id <> $3 AND a.annule_le IS NULL
            AND (a.locataire_id = $1 ${avecBailOcc ? 'OR a.bail_id IN (SELECT oc.bail_id FROM gestion_annuaire_occupation oc WHERE oc.locataire_id = $1 AND oc.bail_id IS NOT NULL)' : ''})
       ) x ORDER BY rang, cle LIMIT 1`, [n(lo.id), lots, n(a.id)]);
    locataires.push({ id: n(lo.id), nom: lo.nom, conserve: autre.length > 0, autreBien: autre[0]?.bien ?? null });
  }
  return { id: n(a.id), bien: a.bien ?? a.libelle ?? `location n° ${a.id}`, dateSignature: a.date, locataires };
}

/** La fenêtre de confirmation : le plan, sans rien écrire. */
export async function lirePlanSuppression(id: unknown): Promise<IssueSuppression> {
  const x = Number(id);
  if (!Number.isSafeInteger(x) || x <= 0) return { etat: 'refus', motif: 'Location inconnue.' };
  const p = await planSuppression((t, v) => query(t, v), x);
  return p === null ? { etat: 'inconnu' } : { etat: 'ok', data: p };
}

const fr = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * SUPPRIMER LA LOCATION : le plan recalculé sous verrou, la ligne marquée, chaque fiche à supprimer marquée (journal de l'annuaire), puis la
 * location au journal (qui, quand, quoi : les fiches supprimées et les conservées). Rend le plan appliqué.
 */
export async function supprimerLocation(id: unknown, auteur: Auteur): Promise<IssueSuppression> {
  const x = Number(id);
  if (!Number.isSafeInteger(x) || x <= 0) return { etat: 'refus', motif: 'Location inconnue.' };
  const avecSuppressionFiche = await suppressionPersonneDisponible();
  return withTransaction(async (q) => {
    const p = await planSuppression(q, x, true);
    if (p === null) return { etat: 'inconnu' as const };
    const aSupprimer = p.locataires.filter((l) => !l.conserve);
    if (aSupprimer.length > 0 && !avecSuppressionFiche) {
      return { etat: 'refus' as const, motif: 'Disponible après la mise à jour de la base (suppression des fiches, migration 287) : rien n’a été supprimé.' };
    }
    await q('UPDATE gestion_location_activite SET annule_le = now(), annule_par_libelle = $2 WHERE id = $1 AND annule_le IS NULL', [x, auteur.libelle]);
    const quoi = `location ${p.bien} — ${fr(p.dateSignature)}`;
    for (const l of aSupprimer) {
      await marquerPersonneSupprimeeTx(q, 'locataire', l.id, auteur,
        `fiche supprimée avec la ${quoi} (Suivi du mois) — aucune ligne n’est effacée ; le bien, ses propriétaires, le bail et les mails restent intacts`);
    }
    const resume = [
      ...aSupprimer.map((l) => `${l.nom} : fiche supprimée`),
      ...p.locataires.filter((l) => l.conserve).map((l) => `${l.nom} : conservé (aussi rattaché à ${l.autreBien})`),
    ].join(' ; ');
    const t = await colonnesTrace({ sujet: 'activite', champ: 'Location' }, 6);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
       VALUES ('location_activite', $1, 'location_supprimee', $2, 'supprimée', $3, $4, $5${t.marques})`,
      [x, quoi, `${ECRAN_SUIVI_MOIS} — location supprimée (${quoi})${resume === '' ? '' : ` — ${resume}`}`, auteur.id, auteur.libelle, ...t.valeurs]);
    return { etat: 'ok' as const, data: p };
  });
}
