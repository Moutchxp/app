import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { metaPieces } from './piecesSortieRepo';
import { vocauxDesOccupations } from './vocauxCompteRenduRepo';
import { nettoyerBrouillon, type ContenuBrouillon } from './brouillonCompteRendu';

/**
 * ══ 🔴🔴 Arno (15/11/2026) — LE BROUILLON DU COMPTE RENDU, CÔTÉ SERVEUR (migration 474). IMPUR (base). ═══════════════════════════════
 * UN brouillon vivant par pré-visite ouverte ; enregistré par le formulaire (jamais refusé : il est nettoyé et borné) ; « Effacer le
 * brouillon » et l'envoi du compte rendu le MARQUENT effacé — rien n'est supprimé. Rien n'est envoyé à qui que ce soit. Sans la 474 : rien
 * n'est écrit, la lecture dit « indisponible » (le formulaire garde alors le brouillon sur l'appareil).
 */
export const brouillonDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_previsite_brouillon', 'contenu');

type Issue<T> = { etat: 'ok'; data: T } | { etat: 'refus'; motif: string } | { etat: 'sans_schema'; motif: string };
const SANS_474 = 'Le brouillon sur le serveur demande la migration 474 : il est gardé sur cet appareil.';

/** La pré-visite OUVERTE qui porte TOUTES ces occupations (ou null). */
async function previsiteDe(ids: readonly number[]): Promise<number | null> {
  if (ids.length === 0) return null;
  const { rows } = await query<{ id: string }>(
    `SELECT id::text FROM gestion_location_previsite WHERE clos_le IS NULL AND occupation_ids @> $1::bigint[] ORDER BY id DESC LIMIT 1`, [[...ids]]);
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Le brouillon vivant de la pré-visite, ou null. Les photos et les prises qu'il désigne sont RELUES : seules celles qui existent pour CES
 * occupations sont rendues (jamais la pièce d'un autre bail).
 */
export async function lireBrouillon(ids: readonly number[]): Promise<Issue<{ brouillon: ContenuBrouillon | null; enregistreLe: string | null }>> {
  if (!(await brouillonDisponible())) return { etat: 'sans_schema', motif: SANS_474 };
  const pv = await previsiteDe(ids);
  if (pv === null) return { etat: 'ok', data: { brouillon: null, enregistreLe: null } };
  const { rows } = await query<{ contenu: unknown; enregistre_le: string }>(
    `SELECT contenu, enregistre_le::text FROM gestion_location_previsite_brouillon WHERE previsite_id = $1 AND efface_le IS NULL`, [pv]);
  if (rows.length === 0) return { etat: 'ok', data: { brouillon: null, enregistreLe: null } };
  const c = nettoyerBrouillon(rows[0].contenu);
  const photos = c.photos.length === 0 ? new Set<number>() : new Set((await metaPieces(c.photos.map((p) => p.id), ids)).map((m) => Number(m.id)));
  const idsPrises = c.fichiers.flatMap((f) => f.prises.map((p) => p.id));
  const prises = idsPrises.length === 0 ? new Set<number>() : new Set((await vocauxDesOccupations(idsPrises, ids)).map((m) => Number(m.id)));
  const brouillon: ContenuBrouillon = { ...c, presents: c.presents.filter((x) => ids.includes(x)), photos: c.photos.filter((p) => photos.has(p.id)),
    fichiers: c.fichiers.map((f) => ({ ...f, prises: f.prises.filter((p) => prises.has(p.id)) })) };
  return { etat: 'ok', data: { brouillon, enregistreLe: new Date(rows[0].enregistre_le).toISOString() } };
}

/** Enregistre le brouillon (crée le vivant, ou le met à jour). Jamais refusé pour son contenu : il est nettoyé et borné. */
export async function ecrireBrouillon(ids: readonly number[], brut: unknown, auteur: Auteur): Promise<Issue<{ enregistreLe: string }>> {
  if (!(await brouillonDisponible())) return { etat: 'sans_schema', motif: SANS_474 };
  const pv = await previsiteDe(ids);
  if (pv === null) return { etat: 'refus', motif: 'Aucune pré-visite ouverte pour ce préavis : le brouillon reste sur cet appareil.' };
  const contenu = JSON.stringify(nettoyerBrouillon(brut));
  const { rows } = await query<{ enregistre_le: string }>(
    `INSERT INTO gestion_location_previsite_brouillon (previsite_id, occupation_ids, contenu, enregistre_par) VALUES ($1, $2::bigint[], $3::jsonb, $4)
     ON CONFLICT (previsite_id) WHERE efface_le IS NULL
     DO UPDATE SET contenu = EXCLUDED.contenu, enregistre_le = now(), enregistre_par = EXCLUDED.enregistre_par,
                   version = gestion_location_previsite_brouillon.version + 1
     RETURNING enregistre_le::text`, [pv, [...ids], contenu, auteur.libelle]);
  return { etat: 'ok', data: { enregistreLe: new Date(rows[0].enregistre_le).toISOString() } };
}

/** « Effacer le brouillon » (motif 'efface') ou l'envoi du compte rendu ('envoye') : le brouillon vivant est MARQUÉ effacé, jamais supprimé. */
export async function effacerBrouillon(ids: readonly number[], auteur: Auteur, motif: 'efface' | 'envoye' = 'efface'): Promise<Issue<{ efface: boolean }>> {
  if (!(await brouillonDisponible())) return { etat: 'sans_schema', motif: SANS_474 };
  const pv = await previsiteDe(ids);
  if (pv === null) return { etat: 'ok', data: { efface: false } };
  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_location_previsite_brouillon SET efface_le = now(), efface_motif = $2, efface_par = $3
      WHERE previsite_id = $1 AND efface_le IS NULL RETURNING id::text`, [pv, motif, auteur.libelle]);
  return { etat: 'ok', data: { efface: rows.length > 0 } };
}
