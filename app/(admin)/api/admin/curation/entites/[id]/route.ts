import 'server-only';
import { query } from '../../../../../../lib/db/client';
import { lireSessionCuration } from '../../../../../../lib/admin/sessionServeur';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { lireCorps, lireId } from '../../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/**
 * GARDE-FOU DUR : ces opérations ne touchent QUE les entités MANUELLES (`meta->>'origine'='manuel'`).
 * Une entité NATIVE (MH/Inventaire/Mondial importée) n'est JAMAIS supprimée ni renommée ici.
 */

/**
 * DELETE /api/admin/curation/entites/[id] — SUPPRIME une entité MANUELLE et ses liaisons.
 *
 * FK `patrimoine_entite_batiment.entite_id` SANS `ON DELETE CASCADE` → suppression des liaisons PUIS de
 * l'entité, dans UNE requête atomique (CTE). Refuse (404) si l'entité n'existe pas OU n'est pas manuelle.
 * Server-only, paramétré. ⚠️ Action INTERNAUTE (l'agent ne l'exécute jamais réellement ; tests mockés).
 * Journalisé (CTE atomique) : `curation_patrimoine_log` action `'suppression_entite_manuelle'`, `avant` =
 * snapshot (famille/nom/ref_code + cleabs liés) capturé avant les DELETE. Requiert le CHECK élargi (migration 011).
 */
export async function DELETE(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'curation');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  const session = await lireSessionCuration(request); // traçabilité additive ; null si session illisible
  try {
    const { rows } = await query<{ id: number }>(
      `WITH cible AS (
         SELECT id FROM patrimoine_entite WHERE id = $1 AND meta->>'origine' = 'manuel'
       ), snap AS (   -- état AVANT suppression (snapshot du statement : lu avant les DELETE)
         SELECT pe.id, pe.famille, pe.nom, pe.ref_code,
                COALESCE((SELECT jsonb_agg(peb.cleabs ORDER BY peb.cleabs)
                            FROM patrimoine_entite_batiment peb WHERE peb.entite_id = pe.id), '[]'::jsonb) AS liaisons
         FROM patrimoine_entite pe WHERE pe.id IN (SELECT id FROM cible)
       ), del_liaisons AS (
         DELETE FROM patrimoine_entite_batiment WHERE entite_id IN (SELECT id FROM cible)
       ), del_entite AS (
         DELETE FROM patrimoine_entite WHERE id IN (SELECT id FROM cible) RETURNING id
       ), jrnl AS (
         INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres, session_jti, session_ouverte_a, utilisateur_id)
         SELECT 'suppression_entite_manuelle', snap.id, NULL,
                jsonb_build_object('famille', snap.famille, 'nom', snap.nom, 'ref_code', snap.ref_code, 'liaisons', snap.liaisons),
                NULL, $2, $3::timestamptz, $4
         FROM snap
       )
       SELECT id FROM del_entite`,
      [idNum, session.jti, session.iat, session.sub],
    );
    if (rows.length === 0) {
      // Entité inconnue OU native (non manuelle) → refus, aucune suppression.
      return Response.json({ erreurs: [{ message: 'entité manuelle introuvable' }] }, { status: 404 });
    }
    return Response.json({ ok: true, id: idNum });
  } catch {
    return Response.json({ erreur: 'suppression impossible' }, { status: 503 });
  }
}

/**
 * PATCH /api/admin/curation/entites/[id] — RENOMME une entité MANUELLE. Body `{ nom: string }` (peut être
 * vide → `nom=NULL`, tag sans légende). Refuse (404) si l'entité n'existe pas OU n'est pas manuelle.
 * Server-only, paramétré. Journalisé (CTE atomique) : action `'renommage'`, `avant={nom:ancien}` /
 * `apres={nom:nouveau}` (ancien nom capturé avant l'UPDATE). Requiert le CHECK élargi (migration 011).
 */
export async function PATCH(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'curation');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }
  const body = await lireCorps(request);
  if (!body || typeof body.nom !== 'string') {
    return Response.json({ erreurs: [{ message: 'nom (chaîne) attendu' }] }, { status: 422 });
  }
  const nomTrim = body.nom.trim();
  const nom = nomTrim.length > 0 ? nomTrim : null;
  const session = await lireSessionCuration(request); // traçabilité additive ; null si session illisible

  try {
    const { rows } = await query<{ id: number; nom: string | null }>(
      `WITH snap AS (   -- ancien nom (snapshot AVANT l'UPDATE)
         SELECT nom AS ancien FROM patrimoine_entite WHERE id = $1 AND meta->>'origine' = 'manuel'
       ), mut AS (
         UPDATE patrimoine_entite SET nom = $2
         WHERE id = $1 AND meta->>'origine' = 'manuel'
         RETURNING id, nom
       ), jrnl AS (
         INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres, session_jti, session_ouverte_a, utilisateur_id)
         SELECT 'renommage', mut.id, NULL,
                jsonb_build_object('nom', snap.ancien), jsonb_build_object('nom', mut.nom), $3, $4::timestamptz, $5
         FROM mut, snap
       )
       SELECT id, nom FROM mut`,
      [idNum, nom, session.jti, session.iat, session.sub],
    );
    if (rows.length === 0) {
      return Response.json({ erreurs: [{ message: 'entité manuelle introuvable' }] }, { status: 404 });
    }
    return Response.json({ ok: true, id: rows[0].id, nom: rows[0].nom });
  } catch {
    return Response.json({ erreur: 'renommage impossible' }, { status: 503 });
  }
}
