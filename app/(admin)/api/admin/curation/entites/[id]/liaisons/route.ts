import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import { lireCorps, lireId, lireCleabs } from '../../../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/** Liaison lue avant mutation (journal `avant` + branchement manuel/auto). */
interface LiaisonAvant {
  source: string;
  actif: boolean;
  detache: boolean;
  verifie_manuellement: boolean;
}

/**
 * POST /api/admin/curation/entites/[id]/liaisons — RATTACHER une emprise (`cleabs` dans le body).
 *
 * Liaison `source='manuel', actif=true, detache=false` (EX-10). PK `(entite_id, cleabs)` →
 * `ON CONFLICT DO UPDATE` (réactive un tombstone). **PAS de tolérance 15 m** (réservée à l'AUTO,
 * EX-14). Entité inconnue → 404. Écriture ATOMIQUE (CTE) : upsert + journal `action='rattachement'`.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const cleabs = lireCleabs(body);
  if (!cleabs) {
    return Response.json({ erreurs: [{ message: 'cleabs (chaîne non vide) attendu' }] }, { status: 422 });
  }

  // Existence de l'entité (404) + liaison existante (journal `avant`).
  let entiteExiste = false;
  let avant: LiaisonAvant | null = null;
  try {
    const { rows } = await query<{ entite_existe: boolean; liaison_avant: LiaisonAvant | null }>(
      `SELECT
         EXISTS(SELECT 1 FROM patrimoine_entite WHERE id = $1) AS entite_existe,
         (SELECT jsonb_build_object(
                    'source', source, 'actif', actif, 'detache', detache,
                    'verifie_manuellement', verifie_manuellement)
            FROM patrimoine_entite_batiment WHERE entite_id = $1 AND cleabs = $2) AS liaison_avant`,
      [idNum, cleabs],
    );
    entiteExiste = rows[0]?.entite_existe ?? false;
    avant = rows[0]?.liaison_avant ?? null;
  } catch {
    return Response.json({ erreurs: [{ message: 'entité indisponible' }] }, { status: 503 });
  }
  if (!entiteExiste) {
    return Response.json({ erreurs: [{ message: 'entité introuvable' }] }, { status: 404 });
  }

  const apres = JSON.stringify({ source: 'manuel', actif: true, detache: false });
  const sql = `
    WITH mut AS (
      INSERT INTO patrimoine_entite_batiment (entite_id, cleabs, source, actif, detache)
      VALUES ($1, $2, 'manuel', true, false)
      ON CONFLICT (entite_id, cleabs)
      DO UPDATE SET source = 'manuel', detache = false, actif = true
      RETURNING entite_id, cleabs, source, actif, detache, verifie_manuellement
    ), jrnl AS (
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
      VALUES ('rattachement', $1, $2, $3::jsonb, $4::jsonb)
    )
    SELECT * FROM mut;
  `;
  try {
    const { rows } = await query<LiaisonAvant & { entite_id: number; cleabs: string }>(sql, [
      idNum,
      cleabs,
      avant === null ? null : JSON.stringify(avant),
      apres,
    ]);
    const l = rows[0];
    return Response.json({
      ok: true,
      liaison: {
        entiteId: l.entite_id,
        cleabs: l.cleabs,
        source: l.source,
        actif: l.actif,
        detache: l.detache,
        verifieManuellement: l.verifie_manuellement,
      },
    });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}

/**
 * DELETE /api/admin/curation/entites/[id]/liaisons — DÉTACHER une liaison (`cleabs` dans le body).
 *
 * Liaison inconnue → 404. `source='manuel'` → `DELETE` (EX-12). `source='auto'` → **tombstone**
 * `detache=true, source='manuel'` (jamais DELETE, EX-13), pour bloquer un ré-ajout au ré-import.
 * Écriture ATOMIQUE (CTE) : mutation + journal `action='detachement'`. ⚠️ Action INTERNAUTE
 * uniquement (l'agent ne l'exécute jamais réellement ; tests sur `query` mockée).
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const cleabs = lireCleabs(body);
  if (!cleabs) {
    return Response.json({ erreurs: [{ message: 'cleabs (chaîne non vide) attendu' }] }, { status: 422 });
  }

  // Liaison visée (branchement manuel/auto + journal `avant`).
  let avant: LiaisonAvant | undefined;
  try {
    const { rows } = await query<LiaisonAvant>(
      `SELECT source, actif, detache, verifie_manuellement
         FROM patrimoine_entite_batiment WHERE entite_id = $1 AND cleabs = $2`,
      [idNum, cleabs],
    );
    avant = rows[0];
  } catch {
    return Response.json({ erreurs: [{ message: 'liaison indisponible' }] }, { status: 503 });
  }
  if (!avant) {
    return Response.json({ erreurs: [{ message: 'liaison introuvable' }] }, { status: 404 });
  }

  const avantJson = JSON.stringify(avant);
  // Manuel → suppression sèche ; auto → tombstone (detache=true, source='manuel'), jamais DELETE.
  const sql =
    avant.source === 'manuel'
      ? `
        WITH mut AS (
          DELETE FROM patrimoine_entite_batiment WHERE entite_id = $1 AND cleabs = $2
          RETURNING entite_id, cleabs
        ), jrnl AS (
          INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
          VALUES ('detachement', $1, $2, $3::jsonb, NULL)
        )
        SELECT * FROM mut;
      `
      : `
        WITH mut AS (
          UPDATE patrimoine_entite_batiment
             SET detache = true, source = 'manuel'
           WHERE entite_id = $1 AND cleabs = $2
          RETURNING entite_id, cleabs, source, actif, detache, verifie_manuellement
        ), jrnl AS (
          INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
          VALUES ('detachement', $1, $2, $3::jsonb, $4::jsonb)
        )
        SELECT * FROM mut;
      `;
  const params =
    avant.source === 'manuel'
      ? [idNum, cleabs, avantJson]
      : [idNum, cleabs, avantJson, JSON.stringify({ source: 'manuel', detache: true })];

  try {
    await query(sql, params);
    return Response.json({ ok: true, entiteId: idNum, cleabs, tombstone: avant.source !== 'manuel' });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}

/**
 * PATCH /api/admin/curation/entites/[id]/liaisons — VÉRIFIER une liaison (`cleabs`, `verifie:true`).
 *
 * Pose `verifie_manuellement=true` **sans changer `source`** (promotion orange → vert, EX-16).
 * Liaison inconnue → 404. Écriture ATOMIQUE (CTE) : UPDATE + journal `action='verification'`.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const cleabs = lireCleabs(body);
  if (!cleabs) {
    return Response.json({ erreurs: [{ message: 'cleabs (chaîne non vide) attendu' }] }, { status: 422 });
  }
  if (body.verifie !== true) {
    return Response.json({ erreurs: [{ message: 'verifie:true attendu' }] }, { status: 422 });
  }

  // Liaison visée (journal `avant`).
  let avant: LiaisonAvant | undefined;
  try {
    const { rows } = await query<LiaisonAvant>(
      `SELECT source, actif, detache, verifie_manuellement
         FROM patrimoine_entite_batiment WHERE entite_id = $1 AND cleabs = $2`,
      [idNum, cleabs],
    );
    avant = rows[0];
  } catch {
    return Response.json({ erreurs: [{ message: 'liaison indisponible' }] }, { status: 503 });
  }
  if (!avant) {
    return Response.json({ erreurs: [{ message: 'liaison introuvable' }] }, { status: 404 });
  }

  const apres = JSON.stringify({ ...avant, verifie_manuellement: true });
  const sql = `
    WITH mut AS (
      UPDATE patrimoine_entite_batiment
         SET verifie_manuellement = true
       WHERE entite_id = $1 AND cleabs = $2
      RETURNING entite_id, cleabs, source, actif, detache, verifie_manuellement
    ), jrnl AS (
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
      VALUES ('verification', $1, $2, $3::jsonb, $4::jsonb)
    )
    SELECT * FROM mut;
  `;
  try {
    const { rows } = await query<LiaisonAvant & { entite_id: number; cleabs: string }>(sql, [
      idNum,
      cleabs,
      JSON.stringify(avant),
      apres,
    ]);
    const l = rows[0];
    return Response.json({
      ok: true,
      liaison: {
        entiteId: l.entite_id,
        cleabs: l.cleabs,
        source: l.source,
        actif: l.actif,
        detache: l.detache,
        verifieManuellement: l.verifie_manuellement,
      },
    });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}
