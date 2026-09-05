import { describe, it, expect, vi } from 'vitest';
import { rattraperEtatDesLieux, type DepsRattrapage } from './etatDesLieuxRattrapage';
import { parserDepts } from '../../scripts/rapprocher-parcelles';

/**
 * LOT 104 — cœur du rattrapage d'état des lieux (deps injectées, aucune base). On éprouve : garde anti-écrasement (jamais réécrire),
 * complet vs incomplet, terrain nu valable, reprise sans doublon, erreur sans boucle infinie, dry-run.
 */
function deps(over: Partial<DepsRattrapage>): DepsRattrapage {
  return {
    selectionner: vi.fn(async () => []),
    aEtatDesLieux: vi.fn(async () => false),
    figer: vi.fn(async () => ({ complete: true, nbBatiments: 2 })),
    ...over,
  };
}

describe('parserDepts', () => {
  it('« --dept 75 » → [75] ; « --dept 75,92 » → [75,92] ; absent → null ; invalide → null', () => {
    expect(parserDepts(['--dept', '75'])).toEqual(['75']);
    expect(parserDepts(['--dept', '75,92,93'])).toEqual(['75', '92', '93']);
    expect(parserDepts(['--dept=94'])).toEqual(['94']);
    expect(parserDepts(['--dry-run'])).toBeNull();
    expect(parserDepts(['--dept', 'paris'])).toBeNull();
  });
});

describe('rattraperEtatDesLieux — garde, reprise, motifs', () => {
  it('dossier sans état des lieux → traité (figer appelé)', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([1, 2]).mockResolvedValue([]) });
    const r = await rattraperEtatDesLieux(d, { depts: ['75'], lot: 500, majPar: 'test' });
    expect(r.traites).toBe(2); expect(r.candidats).toBe(2);
    expect(vi.mocked(d.figer)).toHaveBeenCalledTimes(2);
  });
  it('🔴 dossier DÉJÀ POURVU → écarté « deja_pourvu », JAMAIS figé (anti-écrasement)', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([9]).mockResolvedValue([]), aEtatDesLieux: vi.fn(async () => true) });
    const r = await rattraperEtatDesLieux(d, { depts: null, lot: 500, majPar: 'test' });
    expect(r.ecartes.deja_pourvu).toBe(1); expect(r.traites).toBe(0);
    expect(vi.mocked(d.figer)).not.toHaveBeenCalled(); // photo existante jamais réécrite
  });
  it('empreinte INCOMPLÈTE (≥1 parcelle non résolue) → écarté « empreinte_incomplete »', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([3]).mockResolvedValue([]), figer: vi.fn(async () => ({ complete: false, nbBatiments: null })) });
    const r = await rattraperEtatDesLieux(d, { depts: null, lot: 500, majPar: 'test' });
    expect(r.ecartes.empreinte_incomplete).toBe(1); expect(r.traites).toBe(0);
  });
  it('terrain nu (complet, 0 bâtiment) → TRAITÉ + compté terrainNu (valable, pas un écart)', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([4]).mockResolvedValue([]), figer: vi.fn(async () => ({ complete: true, nbBatiments: 0 })) });
    const r = await rattraperEtatDesLieux(d, { depts: null, lot: 500, majPar: 'test' });
    expect(r.traites).toBe(1); expect(r.terrainNu).toBe(1); expect(Object.keys(r.ecartes)).toHaveLength(0);
  });
  it('REPRISE : un id revu d’un lot à l’autre n’est traité QU’UNE fois (pas de doublon)', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([1, 2]).mockResolvedValueOnce([2, 3]).mockResolvedValue([]) });
    const r = await rattraperEtatDesLieux(d, { depts: null, lot: 500, majPar: 'test' });
    expect(r.candidats).toBe(3); // 1,2,3 — le 2 revu est sauté
    expect(vi.mocked(d.figer)).toHaveBeenCalledTimes(3);
  });
  it('ERREUR sur un dossier → comptée, jamais de boucle infinie (l’id vu est sauté)', async () => {
    const d = deps({ selectionner: vi.fn(async () => [5]), figer: vi.fn(async () => { throw new Error('boom'); }) }); // sélection renvoie TOUJOURS [5]
    const r = await rattraperEtatDesLieux(d, { depts: null, lot: 500, majPar: 'test' });
    expect(r.erreurs).toBe(1); expect(r.candidats).toBe(1); // termine (5 sauté au 2e lot)
  });
  it('DRY-RUN → ne fige rien, compte les éligibles', async () => {
    const d = deps({ selectionner: vi.fn().mockResolvedValueOnce([1, 2, 3]).mockResolvedValue([]) });
    const r = await rattraperEtatDesLieux(d, { depts: ['75'], lot: 500, majPar: 'test', dryRun: true });
    expect(r.traites).toBe(3);
    expect(vi.mocked(d.figer)).not.toHaveBeenCalled();
  });
});
