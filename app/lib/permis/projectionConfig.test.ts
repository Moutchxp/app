import { describe, it, expect, vi } from 'vitest';

/**
 * PROJ-MIT — qualification « sur la parcelle » vs « mitoyen (contexte) » : fonction PURE (seuil PASSÉ, jamais en dur) + lecture du
 * seuil depuis `config_veille` (repli sûr + provenance). `db/client` mocké (même patron que rattachementConfig.test.ts).
 */
const H = vi.hoisted(() => {
  const state = { mode: 'ok' as 'ok' | 'vide' | 'null' | 'throw', row: { s: 5 as number | string | null } };
  const queryMock = async () => {
    if (state.mode === 'throw') throw new Error('column "projection_mitoyen_seuil_aire_m2" does not exist');
    if (state.mode === 'vide') return { rows: [], rowCount: 0 };
    if (state.mode === 'null') return { rows: [{ s: null }], rowCount: 1 };
    return { rows: [state.row], rowCount: 1 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { qualifierMitoyennete, lireSeuilMitoyenAireM2, MITOYEN_SEUIL_AIRE_M2_DEFAUT } from './projectionConfig';

describe('qualifierMitoyennete — PUR (seuil paramétré, jamais codé en dur)', () => {
  it('(a) polygone à 100 % (aire ≫ seuil) → « sur la parcelle »', () => {
    expect(qualifierMitoyennete(100, 0.5)).toBe('sur_parcelle');
  });
  it('(b) contact de bord à 0 % (aire < seuil) → « mitoyen »', () => {
    expect(qualifierMitoyennete(0, 0.5)).toBe('mitoyen');
  });
  it('(c) bascule au seuil : borne INCLUSE (= seuil → sur la parcelle ; juste en dessous → mitoyen)', () => {
    expect(qualifierMitoyennete(0.5, 0.5)).toBe('sur_parcelle');   // égalité incluse
    expect(qualifierMitoyennete(0.49, 0.5)).toBe('mitoyen');       // juste en dessous
    expect(qualifierMitoyennete(0.5001, 0.5)).toBe('sur_parcelle'); // juste au-dessus
  });
  it('(d-pur) le SEUIL décide (pas une constante 0,5 en dur) : avec seuil 5, une aire de 3 devient « mitoyen »', () => {
    expect(qualifierMitoyennete(3, 5)).toBe('mitoyen');            // 3 < 5 → mitoyen (impossible si 0,5 était en dur)
    expect(qualifierMitoyennete(5, 5)).toBe('sur_parcelle');       // 5 ≥ 5 → sur la parcelle
  });
});

describe('lireSeuilMitoyenAireM2 — seuil LU depuis config_veille, repli sûr + provenance', () => {
  it('(d) valeur en base (numeric → string) → seuil lu + provenance « base » ; NON codé en dur', async () => {
    H.state.mode = 'ok'; H.state.row = { s: '5' }; // driver pg rend numeric en string
    const r = await lireSeuilMitoyenAireM2();
    expect(r).toEqual({ seuilM2: 5, provenance: 'base' });
  });
  it('valeur fractionnaire par défaut (0,5) lue en base', async () => {
    H.state.mode = 'ok'; H.state.row = { s: '0.5' };
    const r = await lireSeuilMitoyenAireM2();
    expect(r).toEqual({ seuilM2: 0.5, provenance: 'base' });
  });
  it('colonne non migrée (erreur SQL) → défaut + provenance « defaut »', async () => {
    H.state.mode = 'throw';
    expect(await lireSeuilMitoyenAireM2()).toEqual({ seuilM2: MITOYEN_SEUIL_AIRE_M2_DEFAUT, provenance: 'defaut' });
    expect(MITOYEN_SEUIL_AIRE_M2_DEFAUT).toBe(0.5); // le défaut = DEFAULT de la migration 203
  });
  it('ligne absente / valeur NULL → défaut + provenance « defaut »', async () => {
    H.state.mode = 'vide';
    expect((await lireSeuilMitoyenAireM2()).provenance).toBe('defaut');
    H.state.mode = 'null';
    expect((await lireSeuilMitoyenAireM2()).provenance).toBe('defaut');
  });
});
