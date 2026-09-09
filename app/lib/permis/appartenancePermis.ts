import { query } from '../db/client';
import { batimentAppartientPermis, type IntersectionParcelleBatiment } from './projectionConfig';

/**
 * VOIS-1 — RÈGLE UNIQUE D'APPARTENANCE AU PERMIS (décision Arno). Un bâtiment VOISIN n'entre JAMAIS dans les caractéristiques d'un permis :
 * partout où l'on documentait le bâti par un simple `ST_Intersects(b.geom, empreinte)` (bâti au moment de l'analyse, schéma d'origine +
 * repères, surveillance, gel), on filtre désormais par `batimentAppartientPermis` (projectionConfig.ts) — LE MÊME critère que la projection,
 * une seule vérité dans tout le projet. Calcul géométrique IDENTIQUE à `lirePolygonesEmpreinte` : pour chaque bâtiment, la liste de ses
 * intersections parcellaires (aire + « parcelle du permis » = ≥ 50 % dans l'empreinte) → la fonction PURE tranche (parcelle DOMINANTE du
 * permis ET bâtiment majoritairement dessus).
 *
 * `source` = table du bâti : 'batiment' (couche VIVANTE, ∩ empreinte) ou 'snapshot' (photo figée `permis_bati_snapshot` du dossier — on
 * juge chaque footprint FIGÉ, jamais réécrit). Retourne l'ENSEMBLE des `cleabs` qui appartiennent au permis (cleabs NULL exclu — sans
 * identité, un bâtiment ne peut entrer dans les caractéristiques ; en pratique `cleabs` est toujours renseigné dans BD TOPO). PUR d'effet
 * de bord (lecture seule). Les erreurs (empreinte/parcelle absentes) sont propagées à l'appelant, qui garde son repli habituel.
 */
export async function cleabsAppartenantPermis(dossierId: number, source: 'batiment' | 'snapshot'): Promise<Set<string>> {
  // Les sous-requêtes `par.geom && b.geom` tiennent l'index GiST (aucun KNN). `emp` = empreinte figée du permis.
  const fromBati = source === 'batiment'
    ? 'batiment b, emp WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)'
    : 'permis_bati_snapshot b, emp WHERE b.dossier_id = $1';
  const { rows } = await query<{ cleabs: string | null; aire_bat: number | string | null; parcelles: { aireInterM2: number | string; estParcellePermis: boolean }[] | null }>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT b.cleabs, ST_Area(ST_Force2D(b.geom)) AS aire_bat,
            (SELECT json_agg(json_build_object(
               'aireInterM2', ST_Area(ST_Intersection(ST_Force2D(par.geom), ST_Force2D(b.geom))),
               'estParcellePermis', (ST_Area(ST_Intersection(ST_Force2D(par.geom), emp.geom)) / NULLIF(ST_Area(ST_Force2D(par.geom)), 0)) >= 0.5))
               FROM parcelle par WHERE par.geom && b.geom AND ST_Intersects(par.geom, b.geom)) AS parcelles
       FROM ${fromBati}`, [dossierId]);
  const appartenant = new Set<string>();
  for (const r of rows) {
    if (r.cleabs == null) continue; // sans cleabs (identité), jamais dans les caractéristiques
    const intersections: IntersectionParcelleBatiment[] = (r.parcelles ?? []).map((p) => ({ aireInterM2: Number(p.aireInterM2), estParcellePermis: p.estParcellePermis === true }));
    if (batimentAppartientPermis(Number(r.aire_bat ?? 0), intersections)) appartenant.add(r.cleabs);
  }
  return appartenant;
}
