import { describe, it, expect } from 'vitest';
import { verdictProjectionBatiments, libelleBatiment, eligibleProjection, effetValidationProjection } from './projectionBatiments';

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

  it('aucun bâtiment déclaré → BLOQUÉ (PROJ-3b : déclarer au moins un bâtiment avant de valider)', () => {
    const v = verdictProjectionBatiments([], [], []);
    expect(v.peutValider).toBe(false);
    expect(v.aucunBatiment).toBe(true);
  });
});

describe('PROJ-3b — la validation exige au moins un bâtiment déclaré (pur)', () => {
  const un = [{ corpsId: 1, repere: 'A' }];
  it('0 bâtiment déclaré → refusé', () => {
    const v = verdictProjectionBatiments([], [], []);
    expect(v.peutValider).toBe(false);
    expect(v.aucunBatiment).toBe(true);
  });
  it('1 bâtiment tracé → accepté', () => {
    const v = verdictProjectionBatiments(un, [1], []);
    expect(v.peutValider).toBe(true);
    expect(v.aucunBatiment).toBe(false);
  });
  it('1 bâtiment ignoré (avec motif, capté en amont) → accepté', () => {
    const v = verdictProjectionBatiments(un, [], [1]);
    expect(v.peutValider).toBe(true);
    expect(v.aucunBatiment).toBe(false);
  });
  it('2 bâtiments dont 1 ni tracé ni ignoré → refusé', () => {
    const v = verdictProjectionBatiments(B, [1], []);
    expect(v.peutValider).toBe(false);
    expect(v.aucunBatiment).toBe(false);
    expect(v.manquants.map((m) => m.repere)).toEqual(['2D2']);
  });
});

describe('PROJ-2c — éligibilité à la file Projection (pure)', () => {
  it('neuve/extension + documents obtenus + non validée → éligible ; sinon non', () => {
    expect(eligibleProjection(true, true, false)).toBe(true);   // documents obtenus, concerne, pas encore validée
    expect(eligibleProjection(false, true, false)).toBe(false); // pas de documents (pas satisfait)
    expect(eligibleProjection(true, false, false)).toBe(false); // surélévation / hors emprise
    expect(eligibleProjection(true, true, true)).toBe(false);   // déjà validée → a quitté la file
  });
});

describe('PROJ-2c — effet de « Valider la projection » (pure)', () => {
  it('peutValider → quitte la file + marqué suivi en_attente_bati', () => {
    const e = effetValidationProjection(true);
    expect(e).toMatchObject({ valide: true, etatSuiviCible: 'en_attente_bati', retireDeFile: true });
  });
  it('!peutValider → aucun avancement (ne fait rien)', () => {
    const e = effetValidationProjection(false);
    expect(e).toMatchObject({ valide: false, etatSuiviCible: null, retireDeFile: false });
  });
});
