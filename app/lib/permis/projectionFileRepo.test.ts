import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PROJ-2c — validerProjection : la condition (chaque bâtiment tracé ou ignoré) est VÉRIFIÉE CÔTÉ SERVEUR ; à la validation, jalon
 * permis_projection + marquage suivi (permis_rattachement en_attente_bati, idempotent) + événement. `db/client` et le repo d'emprises mockés.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = { bats: [] as { id: number; repere: string | null }[], emprises: [] as { corpsId: number | null }[], ignores: [] as { corpsId: number }[], rattInsere: [{ id: 50 }] as { id: number }[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/FROM permis_corps_batiment WHERE dossier_id/i.test(sql)) return { rows: state.bats };
    if (/INSERT INTO permis_rattachement\b/i.test(sql)) return { rows: state.rattInsere };
    return { rows: [] };
  };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));
vi.mock('./empriseReconstruiteRepo', () => ({ listerEmprises: async () => H.state.emprises, listerIgnorees: async () => H.state.ignores }));

import { validerProjection, listerFileProjection } from './projectionFileRepo';

const ins = (re: RegExp) => H.calls.filter((c) => re.test(c.sql));
beforeEach(() => { H.calls.length = 0; H.state.bats = [{ id: 1, repere: '2D1' }, { id: 2, repere: '2D2' }]; H.state.emprises = []; H.state.ignores = []; H.state.rattInsere = [{ id: 50 }]; });

describe('PROJ-2c — validerProjection', () => {
  it('projection INCOMPLÈTE (1 bâtiment sans emprise ni ignorance) → refus, aucun jalon', async () => {
    H.state.emprises = [{ corpsId: 1 }];
    const r = await validerProjection(11434, 'admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/incomplète/);
    expect(ins(/INSERT INTO permis_projection/i)).toHaveLength(0);
    expect(ins(/INSERT INTO permis_rattachement\b/i)).toHaveLength(0);
  });

  it('COMPLÈTE (2 emprises) → jalon permis_projection + marquage suivi en_attente_bati + événement', async () => {
    H.state.emprises = [{ corpsId: 1 }, { corpsId: 2 }];
    const r = await validerProjection(11434, 'admin');
    expect(r).toEqual({ ok: true, marqueSuivi: true });
    const jalon = ins(/INSERT INTO permis_projection/i)[0];
    expect(jalon.sql).toMatch(/ON CONFLICT \(dossier_id\) DO NOTHING/);
    expect(jalon.params).toEqual([11434, 'admin']);
    const ratt = ins(/INSERT INTO permis_rattachement\b/i)[0];
    expect(ratt.sql).toMatch(/'en_attente_bati'/);
    expect(ratt.sql).toMatch(/ON CONFLICT \(dossier_id\) DO NOTHING/);
    expect(ins(/INSERT INTO permis_rattachement_evenement/i).some((c) => /'suivi_apres_projection'/.test(c.sql))).toBe(true);
    // 🔴 aucune écriture moteur
    expect(H.calls.map((c) => c.sql).join('\n')).not.toMatch(/INSERT INTO batiment|permis_polygone_altitude/i);
  });

  it('AUCUN bâtiment déclaré → refus explicite, aucun jalon (PROJ-3b, revérifié serveur)', async () => {
    H.state.bats = [];
    const r = await validerProjection(11434, 'admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/aucun bâtiment déclaré/);
    expect(ins(/INSERT INTO permis_projection/i)).toHaveLength(0);
    expect(ins(/INSERT INTO permis_rattachement\b/i)).toHaveLength(0);
  });

  it('COMPLÈTE via ignorance (1 tracé + 1 ignoré) → validée', async () => {
    H.state.emprises = [{ corpsId: 1 }];
    H.state.ignores = [{ corpsId: 2 }];
    expect((await validerProjection(11434, 'admin')).ok).toBe(true);
  });

  it('rattachement DÉJÀ existant (ON CONFLICT → RETURNING vide) → marqueSuivi false, aucun événement', async () => {
    H.state.emprises = [{ corpsId: 1 }, { corpsId: 2 }];
    H.state.rattInsere = []; // conflit : la ligne existait déjà
    const r = await validerProjection(11434, 'admin');
    expect(r).toEqual({ ok: true, marqueSuivi: false });
    expect(ins(/INSERT INTO permis_rattachement_evenement/i)).toHaveLength(0);
  });
});

describe('GED-1 — listerFileProjection : entrée en Analyse sur la GED (dossier_document), PLUS sur satisfait_le', () => {
  it('le prédicat d’éligibilité teste EXISTS dossier_document et n’utilise PLUS satisfait_le IS NOT NULL comme filtre', async () => {
    await listerFileProjection({} as unknown as Parameters<typeof listerFileProjection>[0]); // rows vides (mock) → cfg jamais lue au mapping
    const q = ins(/FROM demande_dossier dd/i)[0];
    expect(q, 'la requête de la file de projection doit être émise').toBeDefined();
    const sql = q.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = s.id)'); // « documents en GED »
    expect(sql).not.toContain('dd.satisfait_le IS NOT NULL'); // le « marqué reçu » n’est plus le déclencheur d’entrée
  });
});
