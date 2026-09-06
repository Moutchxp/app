import { describe, it, expect, vi } from 'vitest';

/**
 * DEMANDE 2 — lecture de la MARGE de cohérence sommet/plancher depuis `config_veille` (migration 205), REPLI SÛR + provenance.
 * `db/client` mocké (même patron que projectionConfig.test.ts / rattachementConfig.test.ts).
 */
const H = vi.hoisted(() => {
  const state = { mode: 'ok' as 'ok' | 'vide' | 'null' | 'negatif' | 'throw', row: { m: 0.25 } as Record<string, number | string | null> };
  const queryMock = async () => {
    if (state.mode === 'throw') throw new Error('column "coherence_sommet_plancher_marge_m" does not exist'); // 205 non appliquée
    if (state.mode === 'vide') return { rows: [], rowCount: 0 };
    if (state.mode === 'null') return { rows: [{ m: null }], rowCount: 1 };
    if (state.mode === 'negatif') return { rows: [{ m: -1 }], rowCount: 1 };
    return { rows: [state.row], rowCount: 1 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { lireMargeCoherenceSommetPlancherM, MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT } from './coherenceConfig';

describe('lireMargeCoherenceSommetPlancherM — repli sûr + provenance', () => {
  it('valeur en base (numeric → string) → prise + provenance base', async () => {
    H.state.mode = 'ok'; H.state.row = { m: '0.25' };
    expect(await lireMargeCoherenceSommetPlancherM()).toEqual({ margeM: 0.25, provenance: 'base' });
  });
  it('colonne absente (205 non appliquée, throw) → défaut + provenance defaut', async () => {
    H.state.mode = 'throw';
    expect(await lireMargeCoherenceSommetPlancherM()).toEqual({ margeM: MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT, provenance: 'defaut' });
  });
  it('ligne absente ou NULL → défaut', async () => {
    H.state.mode = 'vide';
    expect((await lireMargeCoherenceSommetPlancherM()).provenance).toBe('defaut');
    H.state.mode = 'null';
    expect((await lireMargeCoherenceSommetPlancherM()).provenance).toBe('defaut');
  });
  it('valeur négative (aberrante) → défaut (jamais une marge < 0)', async () => {
    H.state.mode = 'negatif';
    expect(await lireMargeCoherenceSommetPlancherM()).toEqual({ margeM: MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT, provenance: 'defaut' });
  });
});
