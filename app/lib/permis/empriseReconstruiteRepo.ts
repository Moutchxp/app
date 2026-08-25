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
import { query, withTransaction, type RequeteTx } from '../db/client';
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
  corpsId: number | null;        // PROJ-2b — bâtiment (permis_corps_batiment) reconstitué ; null = ligne PROJ-2 antérieure
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
  corpsId: number | null;        // PROJ-2b — bâtiment du permis auquel l'emprise se rattache
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
      `INSERT INTO permis_emprise_reconstruite (dossier_id, corps_id, libelle, geom, surface_m2, piece_id, page, calage, residu_m, cree_par)
       VALUES ($1, $9, $2, ST_GeomFromText($3, 2154), ST_Area(ST_GeomFromText($3, 2154)), $4, $5, $6::jsonb, $7, $8)
       RETURNING id::int AS id`,
      [e.dossierId, e.libelle.trim(), wkt, e.pieceId, e.page, JSON.stringify(e.calage), e.residuM, e.creePar, e.corpsId],
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
      id: number; corps_id: number | null; libelle: string; gj: { coordinates: number[][][] } | null; surface_m2: number | null;
      piece_id: number | null; page: number | null; calage: CalageTrace | null; residu_m: number | null; cree_le: Date | null;
    }>(
      `SELECT id::int AS id, corps_id::int AS corps_id, libelle, ST_AsGeoJSON(geom)::json AS gj, surface_m2, piece_id::int AS piece_id, page,
              calage, residu_m, cree_le
         FROM permis_emprise_reconstruite WHERE dossier_id = $1 ORDER BY id`,
      [dossierId],
    );
    return rows.map((r) => ({
      id: r.id, dossierId, corpsId: r.corps_id, libelle: r.libelle,
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

/**
 * PROJ-3h — polygones BD TOPO (couche VIVANTE `batiment`) qui intersectent l'empreinte du permis, avec leur ÉTAT IGN
 * (`etat_de_l_objet` : En service / En construction / En projet / En ruine). LECTURE SEULE, pour un pur AFFICHAGE (options de
 * visibilité du schéma de projection). Géométrie en Lambert-93 (comme la parcelle), `ST_Force2D` conservé (jamais retiré des
 * opérations géométriques). 🔴 Ce sont des DONNÉES IGN, jamais une reconstitution : aucune écriture, aucun couplage moteur. `[]`
 * si `permis_empreinte`/`batiment` absentes (résilient).
 */
export interface PolygoneBdTopo { cleabs: string | null; anneau: PointLambert[]; etat: string | null }
export async function lirePolygonesEmpreinte(dossierId: number): Promise<PolygoneBdTopo[]> {
  try {
    // ORDER BY spatial STABLE (haut→bas, gauche→droite, cleabs) : fixe les repères A/B/C… de façon déterministe (comme le Rattachement).
    const { rows } = await query<{ cleabs: string | null; gj: { type: string; coordinates: number[][][] | number[][][][] } | null; etat: string | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT b.cleabs, ST_AsGeoJSON(ST_Force2D(b.geom))::json AS gj, b.etat_de_l_objet AS etat
         FROM batiment b, emp
        WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)
        ORDER BY ST_YMax(b.geom) DESC, ST_XMin(b.geom), b.cleabs`, [dossierId]);
    const out: PolygoneBdTopo[] = [];
    for (const r of rows) {
      if (!r.gj) continue;
      const anneaux: number[][][] = r.gj.type === 'Polygon'
        ? [(r.gj.coordinates as number[][][])[0]].filter(Boolean)
        : r.gj.type === 'MultiPolygon'
          ? (r.gj.coordinates as number[][][][]).map((poly) => poly[0]).filter(Boolean)
          : [];
      for (const a of anneaux) out.push({ cleabs: r.cleabs ?? null, anneau: a.map(([x, y]) => ({ x, y })), etat: r.etat ?? null });
    }
    return out;
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

// PROJ-3i — SÉLECTION des polygones « en projet » (permis_polygone_projet_ecarte, migration 152). Par DÉFAUT tout est RETENU ;
//   une ligne = un cleabs ÉCARTÉ (décoché) par Arno, tracé (qui/quand). 🔴 AFFICHAGE/décision seulement : n'alimente NI verdict,
//   NI altitude, NI rattachement ; aucune écriture moteur. Résilient : table absente (152 non appliquée) → liste vide / refus clair.
export type ResultatEcartPolygone = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

/** cleabs des polygones « en projet » ÉCARTÉS d'un dossier (décochés). `[]` si la table n'existe pas encore. */
export async function listerPolygonesProjetEcartes(dossierId: number): Promise<string[]> {
  try {
    const { rows } = await query<{ cleabs: string }>(`SELECT cleabs FROM permis_polygone_projet_ecarte WHERE dossier_id = $1`, [dossierId]);
    return rows.map((r) => r.cleabs);
  } catch (err) { if (estTableAbsente(err)) return []; throw err; }
}

/** ÉCARTER un polygone « en projet » (décoché) : upsert idempotent, tracé (par). */
export async function ecarterPolygoneProjet(dossierId: number, cleabs: string, par: string | null): Promise<ResultatEcartPolygone> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  try {
    await query(`INSERT INTO permis_polygone_projet_ecarte (dossier_id, cleabs, ecarte_par) VALUES ($1, $2, $3)
                 ON CONFLICT (dossier_id, cleabs) DO NOTHING`, [dossierId, cleabs, par]);
    return { ok: true };
  } catch (err) { if (estTableAbsente(err)) return { ok: false, motif: 'sélection indisponible (migration 152 non appliquée)', tableAbsente: true }; throw err; }
}

/** RÉTABLIR un polygone « en projet » (re-coché) : supprime son écartement (réversible). */
export async function retablirPolygoneProjet(dossierId: number, cleabs: string): Promise<ResultatEcartPolygone> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  try {
    await query(`DELETE FROM permis_polygone_projet_ecarte WHERE dossier_id = $1 AND cleabs = $2`, [dossierId, cleabs]);
    return { ok: true };
  } catch (err) { if (estTableAbsente(err)) return { ok: false, motif: 'sélection indisponible (migration 152 non appliquée)', tableAbsente: true }; throw err; }
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

// ── Projections IGNORÉES par bâtiment (PROJ-2b) ──────────────────────────────
// État COURANT dans permis_projection_ignoree (réversible = suppression) ; AUDIT au journal append-only permis_rattachement_evenement
// (types 'projection_ignoree' / 'projection_retablie'), MÊME mécanique que les autres actions d'actionsRattachement. 🔴 N'écrit NI
// dans batiment, NI dans permis_polygone_altitude, NI dans permis_corps* : rien du moteur.
export interface ProjectionIgnoree { corpsId: number; motif: string }
export type ResultatIgnorance = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

async function rattId(q: RequeteTx, dossierId: number): Promise<number | null> {
  const { rows } = await q<{ id: number }>(`SELECT id FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  return rows[0]?.id ?? null;
}

/** IGNORER la projection d'un bâtiment : motif OBLIGATOIRE. Upsert l'état courant + trace un événement 'projection_ignoree'. */
export async function ignorerProjection(dossierId: number, corpsId: number, motif: string, par: string | null): Promise<ResultatIgnorance> {
  const m = (motif ?? '').trim();
  if (!m) return { ok: false, motif: 'un motif court est obligatoire pour ignorer la projection' };
  if (!Number.isInteger(corpsId) || corpsId <= 0) return { ok: false, motif: 'bâtiment invalide' };
  try {
    return await withTransaction(async (q) => {
      await q(`INSERT INTO permis_projection_ignoree (dossier_id, corps_id, motif, par) VALUES ($1, $2, $3, $4)
               ON CONFLICT (corps_id) DO UPDATE SET motif = EXCLUDED.motif, par = EXCLUDED.par, le = now()`, [dossierId, corpsId, m, par]);
      const rid = await rattId(q, dossierId);
      if (rid !== null) await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                                 VALUES ($1, 'projection_ignoree', NULL, NULL, $2::jsonb, $3)`, [rid, JSON.stringify({ corpsId, motif: m }), par]);
      return { ok: true } as const;
    });
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des projections ignorées absente (migration 150 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/** RÉTABLIR (annuler l'ignorance) d'un bâtiment : supprime l'état courant + trace un événement 'projection_retablie'. Réversible. */
export async function retablirProjection(dossierId: number, corpsId: number, par: string | null): Promise<ResultatIgnorance> {
  if (!Number.isInteger(corpsId) || corpsId <= 0) return { ok: false, motif: 'bâtiment invalide' };
  try {
    return await withTransaction(async (q) => {
      await q(`DELETE FROM permis_projection_ignoree WHERE corps_id = $1 AND dossier_id = $2`, [corpsId, dossierId]);
      const rid = await rattId(q, dossierId);
      if (rid !== null) await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                                 VALUES ($1, 'projection_retablie', NULL, NULL, $2::jsonb, $3)`, [rid, JSON.stringify({ corpsId }), par]);
      return { ok: true } as const;
    });
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des projections ignorées absente (migration 150 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/** Bâtiments déclarés du permis (permis_corps_batiment) — l'univers du tracé/ignorance. `[]` si la table manque. */
export async function listerBatiments(dossierId: number): Promise<{ corpsId: number; repere: string | null }[]> {
  try {
    const { rows } = await query<{ id: number; repere: string | null }>(
      `SELECT id::int AS id, repere FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]);
    return rows.map((r) => ({ corpsId: r.id, repere: r.repere }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

/** Projections IGNORÉES d'un dossier (état courant). `[]` si la table n'existe pas encore. */
export async function listerIgnorees(dossierId: number): Promise<ProjectionIgnoree[]> {
  try {
    const { rows } = await query<{ corps_id: number; motif: string }>(
      `SELECT corps_id::int AS corps_id, motif FROM permis_projection_ignoree WHERE dossier_id = $1 ORDER BY corps_id`, [dossierId]);
    return rows.map((r) => ({ corpsId: r.corps_id, motif: r.motif }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

/**
 * `surface_plancher_m2` est au niveau PERMIS (`permis_caracteristique`). Le NOMBRE D'ÉTAGES, lui, vit PAR BÂTIMENT
 * (`permis_corps_batiment.nb_etages`) : il n'existe PAS « un nombre d'étages du permis » — un permis peut porter plusieurs
 * bâtiments de hauteurs différentes (arc N9/N10). `permis_caracteristique` n'a donc AUCUNE colonne `nb_etages` (cause du 503 :
 * l'ancienne requête la lisait là où elle n'existe pas). Le contexte d'emprise ne s'en sert que pour une INDICATION de
 * vraisemblance (emprise ≈ plancher / étages, ±40 %, jamais un certificat ni le verdict). On remonte un agrégat EXPLICITE : le
 * MAX des étages déclarés parmi les bâtiments du permis (borne haute → emprise attendue basse, la plus prudente). `null` si aucun.
 */
async function lireCaracteristiques(dossierId: number): Promise<[number | null, number | null]> {
  try {
    const { rows } = await query<{ surface_plancher_m2: number | null; nb_etages_max: number | null }>(
      `SELECT c.surface_plancher_m2,
              (SELECT max(b.nb_etages) FROM permis_corps_batiment b WHERE b.dossier_id = c.dossier_id) AS nb_etages_max
         FROM permis_caracteristique c WHERE c.dossier_id = $1`, [dossierId]);
    const r = rows[0];
    if (!r) return [null, null];
    return [r.surface_plancher_m2 !== null ? Number(r.surface_plancher_m2) : null, r.nb_etages_max !== null ? Number(r.nb_etages_max) : null];
  } catch (err) {
    if (estTableAbsente(err)) return [null, null];
    throw err;
  }
}
