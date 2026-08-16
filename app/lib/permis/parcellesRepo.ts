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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FUS-1 — figer l'état géométrique d'origine + calculer l'EMPREINTE ATTENDUE de la future parcelle fusionnée.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface EmpreinteLigne {
  surfaceM2: number | null;      // ST_Area de l'union ; null si incomplète
  nbParcelles: number | null;    // nb de parcelles d'origine (union si complète, total sinon)
  complete: boolean;             // toutes les parcelles d'origine étaient rattachées
  motif: string | null;          // si incomplète : pourquoi (jamais une union muette sur un sous-ensemble)
  millesime: string | null;      // millésime cadastral de l'union
  aGeometrie: boolean;           // une empreinte géométrique existe en base
}

/**
 * Fige le SNAPSHOT géométrique des parcelles d'origine RATTACHÉES (copie de parcelle.geom + millésime cadastral courant), puis
 * calcule l'EMPREINTE ATTENDUE du permis = ST_Union de ces snapshots. À lancer APRÈS `ecrireParcelles`, dans le même run CLI.
 * Requiert la migration 113. Renvoie l'état de l'empreinte pour le log.
 *
 * ⚠️ Le snapshot est copié SUR `permis_parcelle` pour SURVIVRE au réimport DELETE+append du cadastre (`cadastre:ingest`) : sans lui,
 * la disparition d'une parcelle à la fusion serait invisible. Complète SEULEMENT si TOUTES les parcelles d'origine sont rattachées ;
 * sinon on marque l'empreinte incomplète avec le motif — jamais une union silencieuse sur un sous-ensemble.
 */
export async function figerEmpreinte(dossierId: number, majPar: string): Promise<EmpreinteLigne> {
  // 1) Snapshot : copie de la géométrie + du millésime cadastral courant du département, pour chaque parcelle d'origine rattachée.
  await query(
    `UPDATE permis_parcelle pp
        SET geom_snapshot = par.geom,
            snapshot_millesime = (SELECT cm.millesime FROM cadastre_millesime cm
                                   WHERE cm.departement = left(pp.idu, 2) ORDER BY cm.charge_le DESC LIMIT 1)
       FROM parcelle par
      WHERE par.id = pp.idu AND pp.dossier_id = $1 AND pp.role = 'origine'`,
    [dossierId]);

  // 2) Complétude : combien de parcelles d'origine, combien ont un snapshot ?
  const { rows: cnt } = await query<{ total: number; avec: number }>(
    `SELECT count(*)::int AS total, count(geom_snapshot)::int AS avec
       FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine'`, [dossierId]);
  const total = cnt[0]?.total ?? 0, avec = cnt[0]?.avec ?? 0;

  if (total > 0 && avec === total) {
    // ⚠️ LIMITE À NE JAMAIS OUBLIER : l'union des parcelles d'origine est une EMPREINTE ATTENDUE, PAS une prédiction de la future
    // parcelle. Le projet peut n'occuper qu'une partie des parcelles, un document d'arpentage peut redécouper, et le contour du
    // millésime suivant diffère toujours un peu. Ne JAMAIS traiter cette géométrie comme la vraie parcelle fusionnée : elle sert
    // de RÉFÉRENCE À COMPARER (FUS-2/3), rien de plus.
    const { rows } = await query<{ surface: string | number | null; nb: number; mill: string | null }>(
      `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
         SELECT $1, ST_Multi(ST_Union(geom_snapshot)), ST_Area(ST_Union(geom_snapshot)), count(*)::int, true, NULL,
                max(snapshot_millesime), now(), $2
           FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine' AND geom_snapshot IS NOT NULL
         ON CONFLICT (dossier_id) DO UPDATE
           SET geom = EXCLUDED.geom, surface_m2 = EXCLUDED.surface_m2, nb_parcelles = EXCLUDED.nb_parcelles,
               complete = EXCLUDED.complete, motif = EXCLUDED.motif, millesime = EXCLUDED.millesime,
               maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par
         RETURNING surface_m2 AS surface, nb_parcelles AS nb, millesime AS mill`,
      [dossierId, majPar]);
    const r = rows[0];
    return { surfaceM2: r?.surface == null ? null : Number(r.surface), nbParcelles: r?.nb ?? total,
             complete: true, motif: null, millesime: r?.mill ?? null, aGeometrie: true };
  }

  // Incomplète : au moins une parcelle d'origine non rattachée → on NE calcule PAS l'union (pas de sous-ensemble muet).
  const motif = total === 0
    ? 'aucune parcelle d’origine rattachée → empreinte attendue non calculable'
    : `${total - avec} parcelle(s) d’origine non rattachée(s) au cadastre → empreinte attendue incomplète (pas d’union sur un sous-ensemble)`;
  await query(
    `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
       VALUES ($1, NULL, NULL, $3, false, $4, NULL, now(), $2)
       ON CONFLICT (dossier_id) DO UPDATE
         SET geom = NULL, surface_m2 = NULL, nb_parcelles = EXCLUDED.nb_parcelles, complete = false,
             motif = EXCLUDED.motif, millesime = NULL, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
    [dossierId, majPar, total, motif]);
  return { surfaceM2: null, nbParcelles: total, complete: false, motif, millesime: null, aGeometrie: false };
}

/** Lit l'empreinte attendue d'un permis (table permis_empreinte). null si jamais calculée. */
export async function lireEmpreintePermis(dossierId: number): Promise<EmpreinteLigne | null> {
  const { rows } = await query<{
    surface: string | number | null; nb: number | null; complete: boolean; motif: string | null; mill: string | null; a_geom: boolean;
  }>(
    `SELECT surface_m2 AS surface, nb_parcelles AS nb, complete, motif, millesime AS mill, (geom IS NOT NULL) AS a_geom
       FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const r = rows[0];
  if (!r) return null;
  return { surfaceM2: r.surface == null ? null : Number(r.surface), nbParcelles: r.nb, complete: r.complete === true,
           motif: r.motif, millesime: r.mill, aGeometrie: r.a_geom === true };
}

/** GeoJSON (FeatureCollection WGS84, une Feature) de l'empreinte attendue d'un permis — pour export, jamais déversé à l'écran. */
export async function geojsonEmpreintePermis(dossierId: number): Promise<unknown> {
  const { rows } = await query<{ fc: unknown }>(
    `SELECT jsonb_build_object(
              'type', 'FeatureCollection',
              'features', COALESCE(jsonb_agg(jsonb_build_object(
                'type', 'Feature',
                'properties', jsonb_build_object('dossier_id', dossier_id, 'surface_m2', round(surface_m2::numeric, 1),
                                                 'nb_parcelles', nb_parcelles, 'millesime', millesime,
                                                 'note', 'empreinte ATTENDUE (union des parcelles d''origine), pas la parcelle fusionnée réelle'),
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb)), '[]'::jsonb)) AS fc
       FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`,
    [dossierId]);
  return rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };
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
