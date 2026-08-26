import 'server-only';
import { query } from '../../../../../lib/db/client';
import { MARQUEUR_FICHE_SYNTHESE } from '../../../../../lib/permis/gedConstantes';

/**
 * GET /api/admin/curation/parcelle-dossiers?cleabs=… — DÉTAIL, À L'OUVERTURE SEULEMENT (PARC-2). Pour le bâtiment `cleabs`,
 * renvoie la liste des dossiers Sitadel rattachés à SA PARCELLE (parcelle sous `ST_PointOnSurface` du bâtiment) + le nombre de
 * bâtiments que porte cette parcelle (pour la mise en garde « parcelle partagée »). Aucune écriture, LECTURE SEULE, sous garde
 * `proxy.ts`. Ne touche NI le moteur NI le verdict.
 *
 * Par dossier : `numDau`, `type` (PC/PD, liste fermée), `dateAutorisation`, `etat` (code `etat_dau`, liste fermée SDES), et les
 * `gedPieces` RÉELLES (fiche de synthèse GÉNÉRÉE EXCLUE via son marqueur) → le raccourci GED n'apparaît que pour un dossier
 * ayant vraiment des pièces (jamais un lien mort). La NATURE (codes nus 1..6, non fiabilisés) N'EST PAS renvoyée (cf. PARC-2).
 */
export async function GET(request: Request) {
  const cleabs = new URL(request.url).searchParams.get('cleabs')?.trim();
  if (!cleabs) {
    return Response.json({ erreurs: [{ message: 'cleabs manquant' }] }, { status: 422 });
  }

  try {
    // 1) Parcelle du bâtiment + nombre de bâtiments qu'elle porte. Prefiltre `b2.geom && p.geom` (index gist) avant le test
    //    ponctuel `ST_Contains` → seuls les bâtiments proches sont testés. `ST_Force2D` conservé (bâti 3D).
    const par = await query<{ parcelle_id: string | null; nb_batiments: number }>(
      `WITH b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE cleabs = $1 LIMIT 1),
            p AS (SELECT pa.id, pa.geom FROM parcelle pa, b
                   WHERE ST_Contains(pa.geom, ST_PointOnSurface(b.g)) LIMIT 1)
       SELECT p.id AS parcelle_id,
              (SELECT count(*)::int FROM bdtopo_batiment b2
                WHERE b2.geom && p.geom
                  AND ST_Contains(p.geom, ST_PointOnSurface(ST_Force2D(b2.geom)))) AS nb_batiments
         FROM p`,
      [cleabs],
    );
    const parcelleId = par.rows[0]?.parcelle_id ?? null;
    if (parcelleId === null) {
      // Bâtiment sans parcelle dans le cadastre chargé (94/77) → indéterminé, jamais une absence.
      return Response.json({ parcelle: null, dossiers: [] });
    }

    // 2) Dossiers de la parcelle (dédoublonnés) + leurs pièces GED réelles (fiche générée exclue). `permis_parcelle` peut avoir
    //    plusieurs lignes par dossier/parcelle → `DISTINCT dossier_id` évite toute multiplication des pièces.
    const { rows } = await query<{
      num_dau: string;
      type: string | null;
      date_autorisation: string | null;
      etat_dau: string | null;
      ged_pieces: { id: number; nom: string }[];
    }>(
      `SELECT sd.num_dau, sd.type, sd.date_reelle_autorisation::text AS date_autorisation, sd.etat_dau,
              coalesce(
                json_agg(json_build_object('id', dd.id, 'nom', dd.nom_fichier) ORDER BY dd.depose_le, dd.id)
                  FILTER (WHERE dd.id IS NOT NULL),
                '[]'
              ) AS ged_pieces
         FROM (SELECT DISTINCT dossier_id FROM permis_parcelle WHERE idu = $1) pp
         JOIN sitadel_dossier sd ON sd.id = pp.dossier_id
         LEFT JOIN dossier_document dd ON dd.dossier_id = sd.id AND dd.note IS DISTINCT FROM $2
        GROUP BY sd.id, sd.num_dau, sd.type, sd.date_reelle_autorisation, sd.etat_dau
        ORDER BY sd.date_reelle_autorisation DESC NULLS LAST, sd.num_dau`,
      [parcelleId, MARQUEUR_FICHE_SYNTHESE],
    );

    return Response.json({
      parcelle: { id: parcelleId, nbBatiments: par.rows[0]?.nb_batiments ?? 0 },
      dossiers: rows.map((r) => ({
        numDau: r.num_dau,
        type: r.type,
        dateAutorisation: r.date_autorisation,
        etat: r.etat_dau,
        gedPieces: r.ged_pieces,
      })),
    });
  } catch {
    return Response.json({ erreur: 'détail parcelle indisponible' }, { status: 503 });
  }
}
