/**
 * PROJ-2 — ADAPTATEUR IMPUR des emprises RECONSTITUÉES (tracé manuel assisté). Lit/écrit UNIQUEMENT `permis_emprise_reconstruite`.
 *
 * 🔴🔴🔴 GARDE FONDAMENTALE : une emprise reconstituée n'est JAMAIS une mesure. Ce module n'écrit RIEN dans `batiment`,
 * `permis_corps_batiment`, `permis_corps_polygone` ni `permis_polygone_altitude`. Il n'appelle NI le verdict, NI la préséance
 * d'altitude, NI un certificat. Sa seule table est `permis_emprise_reconstruite`. Un test (`empriseReconstruiteRepo.test.ts`)
 * casse si une écriture de ce module vise une autre table, et une garde statique vérifie que le moteur ignore cette table.
 *
 * RÉSILIENT : tant que la migration 149 n'est pas appliquée, la table n'existe pas → lecture repliée `[]` + `tableAbsente`,
 * écriture refusée avec motif clair (aucune exception qui remonte). Module PROPRE : n'importe que db/client et le module pur.
 */
import { query } from '../db/client';
import { aireM2, type PointLambert } from './calageEmprise';

/** Journal de calage stocké tel quel (jsonb) — auditable, jamais lissé. */
export interface CalageTrace {
  paires: { plan: { x: number; y: number }; lambert: { x: number; y: number } }[];
  ratioDeclare: number | null;
  ratioImplicite: number;
  residuFitM: number;
  residuEchelleM: number | null;
  douteux: boolean;
  raisons: string[];
}

export interface EmpriseReconstruite {
  id: number;
  dossierId: number;
  libelle: string;
  anneau: PointLambert[];        // contour EPSG:2154 (reconstitution)
  surfaceM2: number | null;
  pieceId: number | null;
  page: number | null;
  calage: CalageTrace | null;
  residuM: number | null;
  creeLe: string | null;
}

export interface EntreeEnregistrement {
  dossierId: number;
  libelle: string;
  anneau: PointLambert[];        // ≥ 3 sommets, en Lambert-93
  pieceId: number | null;
  page: number | null;
  calage: CalageTrace;
  residuM: number | null;
  creePar: string | null;
}

/** Table absente (149 pas encore appliquée) ? Détection par code Postgres 42P01 (undefined_table). */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}

/** WKT `POLYGON((x y, …, x y))` d'un anneau Lambert, FERMÉ explicitement. Nombres uniquement (aucune chaîne externe → pas d'injection). */
function anneauVersWkt(anneau: PointLambert[]): string {
  const pts = anneau.map((p) => `${p.x} ${p.y}`);
  if (pts.length > 0 && pts[0] !== pts[pts.length - 1]) pts.push(pts[0]); // fermeture explicite
  return `POLYGON((${pts.join(', ')}))`;
}

export type ResultatEnregistrement =
  | { ok: true; id: number }
  | { ok: false; motif: string; tableAbsente?: boolean };

/**
 * Enregistre UNE emprise reconstituée. Refuse un contour de moins de 3 sommets ou des coordonnées non finies (aucune
 * géométrie douteuse en base). La surface est calculée EN BASE (ST_Area) ET côté application (aireM2) — on stocke la valeur
 * base (autorité PostGIS). 🔴 N'écrit QUE dans permis_emprise_reconstruite ; `reconstitution` reste true (CHECK en base).
 */
export async function enregistrerEmprise(e: EntreeEnregistrement): Promise<ResultatEnregistrement> {
  if (!Number.isInteger(e.dossierId) || e.dossierId <= 0) return { ok: false, motif: 'dossier invalide' };
  if (e.libelle.trim() === '') return { ok: false, motif: 'libellé du bâtiment requis' };
  if (e.anneau.length < 3) return { ok: false, motif: 'un contour exige au moins 3 sommets' };
  if (!e.anneau.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return { ok: false, motif: 'coordonnées invalides' };
  const wkt = anneauVersWkt(e.anneau);
  try {
    const { rows } = await query<{ id: number }>(
      `INSERT INTO permis_emprise_reconstruite (dossier_id, libelle, geom, surface_m2, piece_id, page, calage, residu_m, cree_par)
       VALUES ($1, $2, ST_GeomFromText($3, 2154), ST_Area(ST_GeomFromText($3, 2154)), $4, $5, $6::jsonb, $7, $8)
       RETURNING id::int AS id`,
      [e.dossierId, e.libelle.trim(), wkt, e.pieceId, e.page, JSON.stringify(e.calage), e.residuM, e.creePar],
    );
    return { ok: true, id: rows[0].id };
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des emprises absente (migration 149 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/** Liste les emprises reconstituées d'un dossier (contour EPSG:2154 → anneau). `[]` si la table n'existe pas encore. */
export async function listerEmprises(dossierId: number): Promise<EmpriseReconstruite[]> {
  try {
    const { rows } = await query<{
      id: number; libelle: string; gj: { coordinates: number[][][] } | null; surface_m2: number | null;
      piece_id: number | null; page: number | null; calage: CalageTrace | null; residu_m: number | null; cree_le: Date | null;
    }>(
      `SELECT id::int AS id, libelle, ST_AsGeoJSON(geom)::json AS gj, surface_m2, piece_id::int AS piece_id, page,
              calage, residu_m, cree_le
         FROM permis_emprise_reconstruite WHERE dossier_id = $1 ORDER BY id`,
      [dossierId],
    );
    return rows.map((r) => ({
      id: r.id, dossierId, libelle: r.libelle,
      anneau: (r.gj?.coordinates?.[0] ?? []).map(([x, y]) => ({ x, y })),
      surfaceM2: r.surface_m2 !== null ? Number(r.surface_m2) : null,
      pieceId: r.piece_id, page: r.page, calage: r.calage,
      residuM: r.residu_m !== null ? Number(r.residu_m) : null,
      creeLe: r.cree_le ? r.cree_le.toISOString() : null,
    }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

/** Supprime UNE emprise (scopée au dossier — jamais une suppression aveugle par id seul). Renvoie le nombre de lignes retirées. */
export async function supprimerEmprise(id: number, dossierId: number): Promise<number> {
  try {
    const { rowCount } = await query(`DELETE FROM permis_emprise_reconstruite WHERE id = $1 AND dossier_id = $2`, [id, dossierId]);
    return rowCount ?? 0;
  } catch (err) {
    if (estTableAbsente(err)) return 0;
    throw err;
  }
}

/** Aide d'affichage (pure) : surface application (aireM2) d'une emprise lue, pour recouper la valeur base sans la remplacer. */
export function surfaceApplicative(e: EmpriseReconstruite): number {
  return aireM2(e.anneau);
}

/**
 * CONTEXTE d'un dossier pour le tracé : empreinte de parcelle (Lambert, pour le schéma + désignation des points de calage)
 * et repères de VRAISEMBLANCE (terrain / plancher / étages) lus en base. LECTURE SEULE, chaque source ISOLÉE (résiliente à
 * l'ordre d'application des migrations) : une source absente vaut `null`/`[]`, jamais une exception qui casse l'écran.
 */
export interface ContexteEmprise {
  empreinteAnneaux: PointLambert[][]; // parcelle en Lambert-93 (anneaux extérieurs)
  surfaceTerrainM2: number | null;
  surfacePlancherM2: number | null;
  nbEtages: number | null;
}
export async function lireContexteEmprise(dossierId: number): Promise<ContexteEmprise> {
  const empreinte = await lireEmpreinteParcelle(dossierId);
  const [surfacePlancherM2, nbEtages] = await lireCaracteristiques(dossierId);
  return { empreinteAnneaux: empreinte.anneaux, surfaceTerrainM2: empreinte.surfaceM2, surfacePlancherM2, nbEtages };
}

async function lireEmpreinteParcelle(dossierId: number): Promise<{ anneaux: PointLambert[][]; surfaceM2: number | null }> {
  try {
    const { rows } = await query<{ gj: { type: string; coordinates: number[][][] | number[][][][] } | null; surface_m2: number | null }>(
      `SELECT ST_AsGeoJSON(geom)::json AS gj, surface_m2 FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    if (!r || !r.gj) return { anneaux: [], surfaceM2: null };
    const anneaux: PointLambert[][] = [];
    if (r.gj.type === 'Polygon') { const c = r.gj.coordinates as number[][][]; if (c[0]) anneaux.push(c[0].map(([x, y]) => ({ x, y }))); }
    else if (r.gj.type === 'MultiPolygon') { for (const poly of r.gj.coordinates as number[][][][]) if (poly[0]) anneaux.push(poly[0].map(([x, y]) => ({ x, y }))); }
    return { anneaux, surfaceM2: r.surface_m2 !== null ? Number(r.surface_m2) : null };
  } catch (err) {
    if (estTableAbsente(err)) return { anneaux: [], surfaceM2: null };
    throw err;
  }
}

async function lireCaracteristiques(dossierId: number): Promise<[number | null, number | null]> {
  try {
    const { rows } = await query<{ surface_plancher_m2: number | null; nb_etages: number | null }>(
      `SELECT surface_plancher_m2, nb_etages FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    if (!r) return [null, null];
    return [r.surface_plancher_m2 !== null ? Number(r.surface_plancher_m2) : null, r.nb_etages !== null ? Number(r.nb_etages) : null];
  } catch (err) {
    if (estTableAbsente(err)) return [null, null];
    throw err;
  }
}
