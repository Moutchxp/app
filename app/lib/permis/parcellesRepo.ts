/**
 * N3-E — DÉPÔT des parcelles cadastrales (table `permis_parcelle`, migration 112) + RATTACHEMENT à `parcelle` par l'IDU (géométrie).
 * IMPUR (base). Module PROPRE : n'importe que `db/client`. `parcelle.id` (IDU) est indexé (migration 111).
 *
 * 🔒 Invariant « une saisie n'est jamais écrasée » : l'écriture AUTOMATIQUE purge d'abord SES lignes ('extraite'), puis insère en
 * `ON CONFLICT … DO NOTHING` → une parcelle saisie à la main (même dossier/rôle/section/numéro/préfixe) n'est jamais remplacée.
 */
import { query } from '../db/client';
import type { ParcelleDecision } from './decisionParcelles';

export interface ParcelleLigne {
  prefixe: string | null; section: string; numero: string; superficieDeclareeM2: number | null;
  role: 'origine' | 'finale'; origine: 'saisie' | 'extraite' | null;
  idu: string | null; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; provenance: string | null;
  // ── rattachement à `parcelle` ──
  communeCadastrale: string | null;   // commune de la parcelle rattachée (arrondissement) ; null si non rattachée
  contenance: number | null;          // contenance cadastrale (m²) ; null si non rattachée
  aireCadastraleM2: number | null;    // ST_Area(geom) ; null si non rattachée
  aGeometrie: boolean;                 // la parcelle a un contour en base
  deptCharge: boolean;                 // le département de l'IDU est chargé dans `parcelle` (sinon : « géométrie non chargée »)
}

/** Écrit les parcelles décidées (mode 'extraite'). Recompute idempotent + invariant saisie. Renvoie le nb écrit / ignoré. */
export async function ecrireParcelles(dossierId: number, parcelles: ParcelleDecision[], majPar: string): Promise<{ ecrites: number; ignorees: number }> {
  await query(`DELETE FROM permis_parcelle WHERE dossier_id = $1 AND origine = 'extraite'`, [dossierId]); // ciblé : jamais la saisie
  let ecrites = 0, ignorees = 0;
  for (const p of parcelles) {
    const res = await query(
      `INSERT INTO permis_parcelle (dossier_id, prefixe, section, numero, superficie_declaree_m2, role, origine, idu, confiance, reserve, provenance, maj_le, maj_par)
         VALUES ($1, $2, $3, $4, $5, $6, 'extraite', $7, $8, $9, $10, now(), $11)
         ON CONFLICT (dossier_id, role, section, numero, prefixe) DO NOTHING`,
      [dossierId, p.prefixe, p.section, p.numero, p.superficieDeclareeM2, p.role, p.idu, p.confiance, p.reserve, p.provenance, majPar]);
    if ((res.rowCount ?? 0) > 0) ecrites++; else ignorees++; // ignoré = une saisie occupe déjà la clé
  }
  return { ecrites, ignorees };
}

/**
 * Lit les parcelles d'un permis, RATTACHÉES par l'IDU à `parcelle` : contenance cadastrale, ST_Area(geom), présence du contour, et si
 * le DÉPARTEMENT de l'IDU est chargé (pour distinguer « géométrie non chargée » de « référence introuvable au cadastre »).
 */
export async function lireParcellesPermis(dossierId: number): Promise<ParcelleLigne[]> {
  const { rows } = await query<{
    prefixe: string | null; section: string; numero: string; superficie: string | number | null;
    role: 'origine' | 'finale'; origine: 'saisie' | 'extraite' | null; idu: string | null;
    confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; provenance: string | null;
    commune: string | null; contenance: number | null; aire: string | number | null; a_geometrie: boolean; dept_charge: boolean;
  }>(
    `SELECT pp.prefixe, pp.section, pp.numero, pp.superficie_declaree_m2 AS superficie, pp.role, pp.origine, pp.idu,
            pp.confiance, pp.reserve, pp.provenance,
            par.commune, par.contenance,
            CASE WHEN par.id IS NOT NULL THEN round(ST_Area(par.geom)::numeric, 1) END AS aire,
            (par.id IS NOT NULL) AS a_geometrie,
            (pp.idu IS NOT NULL AND EXISTS (SELECT 1 FROM parcelle p2 WHERE p2.commune LIKE left(pp.idu, 2) || '%')) AS dept_charge
       FROM permis_parcelle pp
       LEFT JOIN parcelle par ON par.id = pp.idu
      WHERE pp.dossier_id = $1
      ORDER BY pp.role, pp.section, pp.numero`,
    [dossierId]);
  return rows.map((r) => ({
    prefixe: r.prefixe, section: r.section, numero: r.numero,
    superficieDeclareeM2: r.superficie === null ? null : Number(r.superficie),
    role: r.role, origine: r.origine, idu: r.idu, confiance: r.confiance, reserve: r.reserve, provenance: r.provenance,
    communeCadastrale: r.commune, contenance: r.contenance,
    aireCadastraleM2: r.aire === null ? null : Number(r.aire), aGeometrie: r.a_geometrie === true, deptCharge: r.dept_charge === true,
  }));
}

/** GeoJSON (FeatureCollection, WGS84) des parcelles RATTACHÉES d'un permis — pour export/téléchargement, jamais déversé à l'écran. */
export async function geojsonParcellesPermis(dossierId: number): Promise<unknown> {
  const { rows } = await query<{ fc: unknown }>(
    `SELECT jsonb_build_object(
              'type', 'FeatureCollection',
              'features', COALESCE(jsonb_agg(jsonb_build_object(
                'type', 'Feature',
                'properties', jsonb_build_object('idu', par.id, 'section', par.section, 'numero', par.numero,
                                                 'contenance_m2', par.contenance, 'aire_postgis_m2', round(ST_Area(par.geom)::numeric, 1)),
                'geometry', ST_AsGeoJSON(ST_Transform(par.geom, 4326))::jsonb)), '[]'::jsonb)) AS fc
       FROM permis_parcelle pp
       JOIN parcelle par ON par.id = pp.idu
      WHERE pp.dossier_id = $1`,
    [dossierId]);
  return rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };
}
