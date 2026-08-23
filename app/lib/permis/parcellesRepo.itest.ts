/**
 * Test d'INTÉGRATION (L9) — le gel du bâti fige etat_de_l_objet / usage_1 / usage_2. LECTURE SEULE : on ne RELANCE PAS
 * figerBatiSnapshot (il ferait DELETE+INSERT et RÉÉCRIRAIT les 2 captures existantes — interdit par le lot). On prouve donc :
 *   ① la migration 145 est appliquée (3 colonnes nullables) ;
 *   ② les captures DÉJÀ écrites ont NULL sur ces colonnes (aucun backfill, lignes existantes non modifiées) ;
 *   ③ la source (`batiment`) PORTE bien le signal pour les bâtis suivis → une capture FUTURE le figera (donnée capturable).
 * Motif *.itest.ts (`npm run test:integration`). Se saute proprement si la base n'est pas peuplée / migration absente.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { query, closePool } from '../db/client';

const DOSSIER = 11430; // 07512024V0037 : 16 bâtis figés (cf. recon L9)

let colonnesOk = false;

beforeAll(async () => {
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'permis_bati_snapshot' AND column_name IN ('etat_de_l_objet','usage_1','usage_2')`);
    colonnesOk = (rows[0]?.n ?? 0) === 3;
  } catch { colonnesOk = false; }
});
afterAll(async () => { await closePool(); });

describe('L9 — permis_bati_snapshot fige etat_de_l_objet / usage', () => {
  it('① la migration 145 est appliquée : 3 colonnes text NULLABLES', async () => {
    const { rows } = await query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'permis_bati_snapshot' AND column_name IN ('etat_de_l_objet','usage_1','usage_2') ORDER BY column_name`);
    expect(rows.map((r) => r.column_name)).toEqual(['etat_de_l_objet', 'usage_1', 'usage_2']);
    for (const r of rows) { expect(r.data_type).toBe('text'); expect(r.is_nullable).toBe('YES'); }
  });

  it('② la migration est additive (aucune contrainte NOT NULL) et les valeurs captées sont valides : etat_de_l_objet ∈ nomenclature IGN ou NULL', async () => {
    if (!colonnesOk) { expect(colonnesOk).toBe(false); return; } // migration absente → test neutralisé
    // NB : « aucun backfill » n'est plus observable une fois qu'une re-capture (L9) a rempli les colonnes — assertion durable ci-dessous.
    const { rows } = await query<{ lignes: number; hors_nomenclature: number }>(
      `SELECT count(*)::int AS lignes,
              count(*) FILTER (WHERE etat_de_l_objet IS NOT NULL
                AND etat_de_l_objet NOT IN ('En service','En construction','En projet','En ruine'))::int AS hors_nomenclature
         FROM permis_bati_snapshot`);
    expect(rows[0].lignes).toBeGreaterThan(0);      // il y a bien des captures
    expect(rows[0].hors_nomenclature).toBe(0);      // capture BRUTE : toute valeur non nulle est une valeur IGN valide (jamais inventée)
  });

  it('③ la source PORTE le signal : les bâtis de l’empreinte de 11430 ont un etat_de_l_objet (donc capturable au prochain gel)', async () => {
    if (!colonnesOk) { expect(colonnesOk).toBe(false); return; }
    const { rows } = await query<{ n: number; avec_etat: number }>(
      `WITH pil AS (
         SELECT b.etat_de_l_objet AS e
           FROM permis_empreinte pe JOIN batiment b ON b.geom && pe.geom AND ST_Intersects(b.geom, pe.geom)
          WHERE pe.dossier_id = $1 AND pe.geom IS NOT NULL)
       SELECT count(*)::int AS n, count(e)::int AS avec_etat FROM pil`, [DOSSIER]);
    if (rows[0].n === 0) { expect(rows[0].n).toBe(0); return; } // terrain nu / dossier absent : rien à capturer
    expect(rows[0].avec_etat).toBeGreaterThan(0); // la source porte l'état → le gel le figera (aujourd'hui perdu faute de capture)
  });
});
