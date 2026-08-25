import { describe, it, expect } from 'vitest';
import { verdictProjectionBatiments, libelleBatiment } from './projectionBatiments';

const B = [{ corpsId: 1, repere: '2D1' }, { corpsId: 2, repere: '2D2' }];

describe('PROJ-2b — blocage de validation par bâtiment (pur)', () => {
  it('0 tracé sur 2 → BLOQUÉ, les deux en attente', () => {
    const v = verdictProjectionBatiments(B, [], []);
    expect(v.peutValider).toBe(false);
    expect(v.manquants.map((m) => m.repere)).toEqual(['2D1', '2D2']);
    expect(v.libelle).toBe('2 bâtiments · 0 emprise tracée · 2 en attente');
  });

  it('1 tracé sur 2 → BLOQUÉ en NOMMANT le manquant', () => {
    const v = verdictProjectionBatiments(B, [1], []);
    expect(v.peutValider).toBe(false);
    expect(v.manquants.map(libelleBatiment)).toEqual(['2D2']);
    expect(v.libelle).toBe('2 bâtiments · 1 emprise tracée · 1 en attente');
  });

  it('2 tracés sur 2 → PASSANT', () => {
    const v = verdictProjectionBatiments(B, [1, 2], []);
    expect(v.peutValider).toBe(true);
    expect(v.manquants).toEqual([]);
    expect(v.libelle).toBe('2 bâtiments · 2 emprises tracées · 0 en attente');
  });

  it('1 tracé + 1 ignoré → PASSANT (l’ignoré compte comme couvert)', () => {
    const v = verdictProjectionBatiments(B, [1], [2]);
    expect(v.peutValider).toBe(true);
    expect(v.nbTraces).toBe(1);
    expect(v.nbIgnores).toBe(1);
    expect(v.libelle).toBe('2 bâtiments · 1 emprise tracée · 1 ignorée · 0 en attente');
  });

  it('ignoré PUIS retracé → PASSANT, et l’emprise PRIME (jamais compté deux fois)', () => {
    // le bâtiment 2 est à la fois ignoré ET tracé → compté comme tracé, pas comme ignoré
    const v = verdictProjectionBatiments(B, [1, 2], [2]);
    expect(v.peutValider).toBe(true);
    expect(v.nbTraces).toBe(2);
    expect(v.nbIgnores).toBe(0);
    expect(v.libelle).toBe('2 bâtiments · 2 emprises tracées · 0 en attente');
  });

  it('aucun bâtiment déclaré → PASSANT (rien à exiger, jamais un faux blocage)', () => {
    expect(verdictProjectionBatiments([], [], []).peutValider).toBe(true);
  });
});
