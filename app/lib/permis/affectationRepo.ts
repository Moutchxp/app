/**
 * FUS-3d — ADAPTATEUR IMPUR de l'affectation polygone ↔ corps. Lit l'empreinte + les polygones BD TOPO (PostGIS) et les corps
 * déclarés, dérive les repères (ordre DÉTERMINISTE), et construit le schéma SVG (module pur). L'écriture pose le lien avec
 * EXCLUSIVITÉ garantie par l'index unique partiel (migration 117). RÉSILIENT : tant que 117 n'est pas appliquée, la colonne
 * `cleabs_affecte` n'existe pas → lecture repliée (aucune affectation) + `colonneManquante`, écriture refusée avec motif clair.
 * Module PROPRE : n'importe que db/client et le module pur. NE TOUCHE PAS au moteur de verdict SVAV.
 */
import { query } from '../db/client';
import {
  construireSchema, geomDepuisGeoJSON, repereDepuisIndex,
  type SchemaEmpreinte, type CorpsAffectation, type PolygoneAffectable, type PolygoneEntreeSchema,
} from './affectationSchema';

export interface AffectationEtat {
  empreinteFigee: boolean;
  motif: string | null;               // pourquoi l'affectation n'est pas possible (empreinte incomplète / non figée)
  colonneManquante: boolean;          // migration 117 non appliquée → écriture impossible (l'écran le dit)
  schema: SchemaEmpreinte;
  polygones: PolygoneAffectable[];    // repère + cleabs + hors-empreinte
  corps: CorpsAffectation[];          // corps déclarés + leur cleabs affecté (null si aucun)
}

/** L4 — état du schéma « Configuration d'origine » : AffectationEtat + la PROVENANCE du dessin (snapshot figé vs couche vivante). */
export interface AffectationOrigineEtat extends AffectationEtat {
  figee: boolean;              // true = polygones lus dans le snapshot gelé ; false = repli assumé sur la couche vivante (aucune capture)
  captureVide: boolean;        // capture faite MAIS 0 bâtiment gelé (terrain nu au moment du gel) — distinct de « aucune capture »
  millesimeGel: string | null; // édition de la couche bâti au moment du gel (null = inconnu)
}

/** Corps déclarés du permis + leur cleabs affecté. Repli SANS `cleabs_affecte` si la migration 117 n'est pas appliquée. */
async function lireCorps(dossierId: number): Promise<{ corps: CorpsAffectation[]; colonneManquante: boolean }> {
  const map = (r: { id: number; repere: string | null; alt: string | number | null; etages: number | null; cleabs?: string | null }): CorpsAffectation => ({
    id: Number(r.id), repere: r.repere, altitudeSommetNgf: r.alt == null ? null : Number(r.alt), nbEtages: r.etages, cleabsAffecte: r.cleabs ?? null,
  });
  try {
    const { rows } = await query<{ id: number; repere: string | null; alt: string | number | null; etages: number | null; cleabs: string | null }>(
      `SELECT id, repere, altitude_sommet_ngf AS alt, nb_etages AS etages, cleabs_affecte AS cleabs
         FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]);
    return { corps: rows.map(map), colonneManquante: false };
  } catch {
    const { rows } = await query<{ id: number; repere: string | null; alt: string | number | null; etages: number | null }>(
      `SELECT id, repere, altitude_sommet_ngf AS alt, nb_etages AS etages
         FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]);
    return { corps: rows.map(map), colonneManquante: true }; // 117 non appliquée → aucun lien, écriture impossible
  }
}

/** Empreinte (parcelle du permis) : sa géométrie + si elle est figée+complète ; sinon le motif à afficher. Lecture seule. */
async function lireEmpreinte(dossierId: number): Promise<{ gj: unknown; empreinteFigee: boolean; motif: string | null }> {
  const { rows } = await query<{ gj: unknown; complete: boolean; a_geom: boolean }>(
    `SELECT ST_AsGeoJSON(geom)::json AS gj, complete, (geom IS NOT NULL) AS a_geom FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const emp = rows[0];
  const empreinteFigee = emp?.complete === true && emp?.a_geom === true;
  const motif = empreinteFigee ? null : (!emp
    ? 'parcelle du permis non figée : affectation impossible (lancer d’abord la parcelle du permis)'
    : 'parcelle du permis incomplète (au moins une parcelle d’origine non rattachée) : affectation impossible');
  return { gj: emp?.gj ?? null, empreinteFigee, motif };
}

/** Construit polygones + schéma à partir d'un jeu de lignes {cleabs, gj, hors} DÉJÀ ORDONNÉES (l'ordre fixe les repères A/B/C…). */
function construireDepuisRows(rows: { cleabs: string | null; gj: unknown; hors: boolean }[], empGj: unknown): { polygones: PolygoneAffectable[]; schema: SchemaEmpreinte } {
  const entrees: PolygoneEntreeSchema[] = rows.map((r, i) => ({
    repere: repereDepuisIndex(i), cleabs: r.cleabs, geom: geomDepuisGeoJSON(r.gj), horsEmpreinte: r.hors === true,
  }));
  return {
    polygones: entrees.map((e) => ({ repere: e.repere, cleabs: e.cleabs, horsEmpreinte: e.horsEmpreinte })),
    schema: construireSchema(geomDepuisGeoJSON(empGj), entrees),
  };
}

/** Polygones de la couche bâti VIVANTE intersectant l'empreinte, ORDRE DÉTERMINISTE : haut→bas, gauche→droite, puis cleabs. */
async function lirePolygonesLive(dossierId: number, empGj: unknown): Promise<{ polygones: PolygoneAffectable[]; schema: SchemaEmpreinte }> {
  const { rows } = await query<{ cleabs: string | null; gj: unknown; hors: boolean }>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT b.cleabs, ST_AsGeoJSON(ST_Force2D(b.geom))::json AS gj,
            NOT ST_Covers(emp.geom, ST_Force2D(b.geom)) AS hors
       FROM batiment b, emp
      WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)
      ORDER BY ST_Y(ST_Centroid(b.geom)) DESC, ST_X(ST_Centroid(b.geom)), b.cleabs`, [dossierId]);
  return construireDepuisRows(rows, empGj);
}

/** État complet de l'affectation d'un permis (couche bâti VIVANTE) : empreinte + polygones (repères déterministes) + corps + schéma. Lecture seule. */
export async function lireAffectation(dossierId: number): Promise<AffectationEtat> {
  const { corps, colonneManquante } = await lireCorps(dossierId);
  const { gj, empreinteFigee, motif } = await lireEmpreinte(dossierId);
  if (!empreinteFigee) return { empreinteFigee: false, motif, colonneManquante, schema: construireSchema(null, []), polygones: [], corps };
  const { polygones, schema } = await lirePolygonesLive(dossierId, gj);
  return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps };
}

/**
 * L4 — État de l'affectation pour le schéma « Configuration d'origine », lu depuis le SNAPSHOT FIGÉ (permis_bati_snapshot) et NON la
 * couche vivante : c'est la référence de comparaison, elle ne doit pas bouger au réimport BD TOPO. Les repères A/B/C… sont calculés
 * par le MÊME ordre déterministe que le live (mêmes centroïdes → mêmes repères sur le même jeu). Lecture seule.
 *
 * Trois cas HONNÊTES (jamais un repli muet sur le vivant sous le nom « origine ») :
 *  · capture VALIDE (permis_bati_capture.capture=true) → schéma depuis le snapshot ; `figee=true` ; `captureVide` si 0 bâtiment gelé
 *    (terrain nu au moment du gel — information juste, distincte de « aucune capture ») ;
 *  · AUCUNE capture (ligne absente) OU capture=false → repli ASSUMÉ sur le vivant, `figee=false` (l'écran le nomme « état courant »).
 * `millesimeGel` = édition de la couche bâti au moment du gel (best-effort ; null = inconnu, dit tel quel à l'écran).
 */
export async function lireAffectationOrigine(dossierId: number): Promise<AffectationOrigineEtat> {
  const { corps, colonneManquante } = await lireCorps(dossierId);
  const { gj, empreinteFigee, motif } = await lireEmpreinte(dossierId);
  if (!empreinteFigee) {
    return { empreinteFigee: false, motif, colonneManquante, schema: construireSchema(null, []), polygones: [], corps, figee: false, captureVide: false, millesimeGel: null };
  }

  const { rows: capRows } = await query<{ capture: boolean; mill: string | null }>(
    `SELECT capture, source_millesime AS mill FROM permis_bati_capture WHERE dossier_id = $1`, [dossierId]);
  const cap = capRows[0];

  // Aucune capture (ligne absente) OU capture=false (empreinte incomplète au gel) → repli HONNÊTE sur le vivant.
  if (cap?.capture !== true) {
    const { polygones, schema } = await lirePolygonesLive(dossierId, gj);
    return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps, figee: false, captureVide: false, millesimeGel: null };
  }

  // Capture VALIDE → schéma depuis le SNAPSHOT gelé, MÊME expression d'ordre que le live (mêmes repères sur le même jeu).
  const { rows: snap } = await query<{ cleabs: string | null; gj: unknown; hors: boolean }>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT s.cleabs, ST_AsGeoJSON(ST_Force2D(s.geom))::json AS gj,
            NOT ST_Covers(emp.geom, ST_Force2D(s.geom)) AS hors
       FROM permis_bati_snapshot s, emp
      WHERE s.dossier_id = $1
      ORDER BY ST_Y(ST_Centroid(s.geom)) DESC, ST_X(ST_Centroid(s.geom)), s.cleabs`, [dossierId]);
  const { polygones, schema } = construireDepuisRows(snap, gj);
  return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps, figee: true, captureVide: snap.length === 0, millesimeGel: cap.mill ?? null };
}

export type ResultatAffecter = { ok: true } | { ok: false; motif: string };

/**
 * Affecte (ou désaffecte si `cleabs` = null) un polygone à un corps. EXCLUSIVITÉ garantie par l'index unique partiel : si le
 * cleabs est déjà pris par un AUTRE corps du permis, l'UPDATE lève 23505 → refus explicite (l'UI ne le proposait déjà pas).
 * RÉVERSIBLE (aucun verrouillage). NE FAIT AUCUNE injection d'altitude (FUS-3e).
 */
export async function affecterPolygone(dossierId: number, corpsId: number, cleabs: string | null, majPar: string): Promise<ResultatAffecter> {
  // GARDE DE PERSISTANCE : tant qu'aucun dossier de rattachement n'existe pour ce permis (« aucun signal » = rien de mesuré à
  // arbitrer), on n'écrit AUCUN appariement — sinon on stockerait une donnée morte, relue plus tard sans être revérifiée. Message
  // EXPLICATIF (jamais technique) : l'affectation s'ouvrira quand un changement sera détecté. Même intention que validerRattachement.
  const { rows: dossier } = await query(`SELECT 1 FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  if (dossier.length === 0) {
    return { ok: false, motif: 'aucun signal de mise à jour n’a encore été détecté pour ce permis : il n’y a rien à arbitrer. L’affectation des polygones aux bâtiments s’ouvrira dès qu’un changement (parcelle ou bâti) sera détecté.' };
  }
  const { rows } = await query(`SELECT 1 FROM permis_corps_batiment WHERE id = $1 AND dossier_id = $2`, [corpsId, dossierId]);
  if (rows.length === 0) return { ok: false, motif: 'corps inconnu pour ce permis' };
  try {
    await query(`UPDATE permis_corps_batiment SET cleabs_affecte = $3, maj_le = now(), maj_par = $4 WHERE id = $1 AND dossier_id = $2`,
      [corpsId, dossierId, cleabs, majPar]);
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === '23505') return { ok: false, motif: 'ce polygone est déjà affecté à un autre corps — désaffectez-le d’abord' };
    if (code === '42703') return { ok: false, motif: 'affectation indisponible : migration 117 non appliquée' };
    throw e;
  }
}
