import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P-fond 4b — FRAÎCHEUR (contrôle clé). Le pré-calcul de fond ne mémorise que la matière STABLE (classements, dérivée de la GED).
 * La part VIVANTE (config_veille.familleAttendue*) est appliquée À LA VOLÉE par `lireCompletude`. Donc, à mémoire INCHANGÉE, un
 * changement de réglage doit changer le diagnostic IMMÉDIATEMENT — sans recalcul, sans relecture de la GED. On mocke `query`
 * (mémoire fixe) et `chargerConfigVeille` (réglage variable) pour le prouver sans base.
 */
const HG = vi.hoisted(() => ({ query: vi.fn(), cfg: vi.fn() }));
vi.mock('../db/client', () => ({ query: HG.query }));
vi.mock('../sitadel/veilleConfig', () => ({ chargerConfigVeille: HG.cfg }));

import { lireCompletude } from './completudeRepo';

const config = (coupe: boolean) => ({ familleAttendueCerfa: true, familleAttendueMasse: true, familleAttendueCoupe: coupe, familleAttendueEtage: true });

/** MÊME mémoire à chaque appel : 1er SELECT = classements (FIXES, vides ici), 2e SELECT = count (péremption). */
function armerMemoireFixe() {
  HG.query.mockResolvedValueOnce({ rows: [{ classements: [], nb_pieces: 0, calcule_le: '2026-01-01T00:00:00.000Z' }] });
  HG.query.mockResolvedValueOnce({ rows: [{ n: 0 }] });
}

beforeEach(() => { HG.query.mockReset(); HG.cfg.mockReset(); });

describe('P-fond 4b — lireCompletude applique config_veille AU READ (fraîcheur immédiate)', () => {
  it('config EXIGE la coupe → la famille coupe est présente dans le diagnostic', async () => {
    armerMemoireFixe(); HG.cfg.mockResolvedValueOnce(config(true));
    const c = await lireCompletude(1);
    expect(c?.diagnostic.lignes.some((l) => l.famille === 'coupe')).toBe(true);
  });

  it('🔴 MÊME mémoire, config n’exige PLUS la coupe → coupe ABSENTE immédiatement (aucun recalcul, aucune lecture GED)', async () => {
    armerMemoireFixe(); HG.cfg.mockResolvedValueOnce(config(false));
    const c = await lireCompletude(1);
    expect(c?.diagnostic.lignes.some((l) => l.famille === 'coupe')).toBe(false);
    // lireCompletude n'émet QUE des SELECT (aucune écriture, aucune lecture d'objet/GED) → le diagnostic suit la config sans rien recalculer.
    const sqls = HG.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.length).toBe(2);
    expect(sqls.every((s) => /^\s*SELECT/i.test(s))).toBe(true);
  });
});
