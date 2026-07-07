import 'server-only';
import { query } from '../../../../../../lib/db/client';
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
 * Journalisation différée : `curation_patrimoine_log.action` a un CHECK fermé sans valeur « suppression »
 * et ce chantier interdit toute migration (cf. RAPPORT_BUILD, décision A).
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  try {
    const { rows } = await query<{ id: number }>(
      `WITH cible AS (
         SELECT id FROM patrimoine_entite WHERE id = $1 AND meta->>'origine' = 'manuel'
       ), del_liaisons AS (
         DELETE FROM patrimoine_entite_batiment WHERE entite_id IN (SELECT id FROM cible)
       ), del_entite AS (
         DELETE FROM patrimoine_entite WHERE id IN (SELECT id FROM cible) RETURNING id
       )
       SELECT id FROM del_entite`,
      [idNum],
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
 * Server-only, paramétré. Journalisation différée (même raison que DELETE).
 */
export async function PATCH(request: Request, ctx: Ctx) {
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

  try {
    const { rows } = await query<{ id: number; nom: string | null }>(
      `UPDATE patrimoine_entite SET nom = $2
       WHERE id = $1 AND meta->>'origine' = 'manuel'
       RETURNING id, nom`,
      [idNum, nom],
    );
    if (rows.length === 0) {
      return Response.json({ erreurs: [{ message: 'entité manuelle introuvable' }] }, { status: 404 });
    }
    return Response.json({ ok: true, id: rows[0].id, nom: rows[0].nom });
  } catch {
    return Response.json({ erreur: 'renommage impossible' }, { status: 503 });
  }
}
