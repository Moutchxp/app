import 'server-only';
import { withTransaction, type RequeteTx } from '../../../../../../../lib/db/client';
import { lireCorps, lireId } from '../../../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/** Ligne de journal à inverser. `avant`/`apres` sont du JSONB (déjà parsé par `pg`). */
interface LigneJournal {
  id: number;
  action: string;
  cleabs: string | null;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
}

/** Snapshot d'une liaison (structure des `avant` écrits par les routes liaisons). */
interface LiaisonAvant {
  source: string;
  actif: boolean;
  detache: boolean;
  verifie_manuellement: boolean;
}

/**
 * POST /api/admin/curation/entites/[id]/annuler-edition — ROLLBACK d'une session d'édition de carte.
 *
 * Body `{ borne: number }` (= `max(id)` de `curation_patrimoine_log` capturé à l'OUVERTURE de la carte).
 * Rejoue **en sens inverse** (id DESC) toutes les mutations de l'entité `id > borne`, en appliquant les
 * `avant` (inverse par action, SQL DIRECT — sans émettre de ligne de journal par inverse), dans **UNE
 * transaction** (ROLLBACK complet si un inverse échoue). La ligne d'audit **unique** `annulation_edition`
 * n'est émise **que si** au moins un inverse a été appliqué (sinon no-op).
 *
 * `suppression_entite_manuelle` est **HORS PÉRIMÈTRE** (elle ferme la carte) → ignorée. GOLDEN-SAFE :
 * `curation_patrimoine_log` n'est lu par aucun chemin de score ; `geom_point` (original) n'est JAMAIS muté
 * (seul `geom_point_corrige` l'est) ; `ST_Force2D` conservé. Server-only, paramétré, sous garde `proxy.ts`.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }
  const body = await lireCorps(request);
  const borne = body && typeof body.borne === 'number' && Number.isInteger(body.borne) ? body.borne : null;
  if (borne === null) {
    return Response.json({ erreurs: [{ message: 'borne (entier) attendue' }] }, { status: 422 });
  }

  try {
    const resultat = await withTransaction(async (q: RequeteTx) => {
      // 1. Mutations de l'entité depuis l'ouverture, en ordre inverse chronologique.
      const { rows } = await q<LigneJournal>(
        `SELECT id, action, cleabs, avant, apres
           FROM curation_patrimoine_log
          WHERE entite_id = $1 AND id > $2
          ORDER BY id DESC`,
        [idNum, borne],
      );
      const jusquA = rows.length > 0 ? rows[0].id : borne;
      let nb = 0;

      for (const l of rows) {
        const liaison = (l.avant ?? null) as LiaisonAvant | null;
        switch (l.action) {
          case 'deplacement': {
            // `avant` = point EFFECTIF (COALESCE(corrige, original)). Restauration : si égal (≈1cm, absorbe le
            // round-trip 2154↔4326) au geom_point ORIGINAL → corrige NULL ; sinon corrige = ce point.
            const pt = l.avant == null ? null : JSON.stringify(l.avant);
            await q(
              `UPDATE patrimoine_entite pe
                  SET geom_point_corrige = CASE
                        WHEN $2::text IS NULL THEN NULL
                        WHEN pe.geom_point IS NOT NULL AND ST_DWithin(
                               ST_Force2D(pe.geom_point),
                               ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 2154)),
                               0.01) THEN NULL
                        ELSE ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 2154))
                      END
                WHERE pe.id = $1`,
              [idNum, pt],
            );
            nb++;
            break;
          }
          case 'annulation_deplacement': {
            // `avant` = geom_point_corrige BRUT (peut être NULL) → restauration directe.
            const pt = l.avant == null ? null : JSON.stringify(l.avant);
            await q(
              `UPDATE patrimoine_entite
                  SET geom_point_corrige = CASE WHEN $2::text IS NULL THEN NULL
                        ELSE ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 2154)) END
                WHERE id = $1`,
              [idNum, pt],
            );
            nb++;
            break;
          }
          case 'rattachement': {
            if (liaison == null) {
              // La liaison n'existait pas avant → la supprimer.
              await q(`DELETE FROM patrimoine_entite_batiment WHERE entite_id = $1 AND cleabs = $2`, [idNum, l.cleabs]);
            } else {
              // Upsert préexistant réactivé → restaurer l'état d'avant.
              await q(
                `UPDATE patrimoine_entite_batiment
                    SET source = $3, actif = $4, detache = $5, verifie_manuellement = $6
                  WHERE entite_id = $1 AND cleabs = $2`,
                [idNum, l.cleabs, liaison.source, liaison.actif, liaison.detache, liaison.verifie_manuellement],
              );
            }
            nb++;
            break;
          }
          case 'detachement': {
            if (liaison == null) break; // improbable (le détachement lit toujours la liaison)
            // Manuel (DELETE) → ré-insertion ; auto (tombstone) → mise à jour. Upsert couvre les deux.
            await q(
              `INSERT INTO patrimoine_entite_batiment (entite_id, cleabs, source, actif, detache, verifie_manuellement)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (entite_id, cleabs)
               DO UPDATE SET source = EXCLUDED.source, actif = EXCLUDED.actif,
                             detache = EXCLUDED.detache, verifie_manuellement = EXCLUDED.verifie_manuellement`,
              [idNum, l.cleabs, liaison.source, liaison.actif, liaison.detache, liaison.verifie_manuellement],
            );
            nb++;
            break;
          }
          case 'verification': {
            if (liaison == null) break;
            await q(
              `UPDATE patrimoine_entite_batiment SET verifie_manuellement = $3 WHERE entite_id = $1 AND cleabs = $2`,
              [idNum, l.cleabs, liaison.verifie_manuellement],
            );
            nb++;
            break;
          }
          case 'renommage': {
            const ancien = (l.avant?.nom ?? null) as string | null;
            await q(`UPDATE patrimoine_entite SET nom = $2 WHERE id = $1`, [idNum, ancien]);
            nb++;
            break;
          }
          case 'creation_entite_manuelle': {
            // L'entité a été créée dans la session → la supprimer (liaisons d'abord, FK sans cascade).
            await q(`DELETE FROM patrimoine_entite_batiment WHERE entite_id = $1`, [idNum]);
            await q(`DELETE FROM patrimoine_entite WHERE id = $1`, [idNum]);
            nb++;
            break;
          }
          // suppression_entite_manuelle (ferme la carte) + annulation_edition + inconnu → ignorés.
          default:
            break;
        }
      }

      // 2. Ligne d'audit UNIQUE — seulement si au moins un inverse a été appliqué.
      if (nb > 0) {
        await q(
          `INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
           VALUES ('annulation_edition', $1, NULL, NULL, $2::jsonb)`,
          [idNum, JSON.stringify({ borne, jusqu_a: jusquA, nb_lignes: nb })],
        );
      }
      return { nbLignes: nb, jusquA };
    });

    return Response.json({ ok: true, borne, jusquA: resultat.jusquA, nbLignes: resultat.nbLignes });
  } catch {
    return Response.json({ erreur: 'annulation impossible' }, { status: 503 });
  }
}
