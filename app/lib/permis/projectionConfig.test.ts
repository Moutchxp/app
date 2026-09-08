import { describe, it, expect, vi } from 'vitest';

/**
 * PROJ-MIT — qualification « sur la parcelle » vs « mitoyen (contexte) » : fonction PURE (seuil PASSÉ, jamais en dur) + lecture du
 * seuil depuis `config_veille` (repli sûr + provenance). `db/client` mocké (même patron que rattachementConfig.test.ts).
 */
const H = vi.hoisted(() => {
  const state = { mode: 'ok' as 'ok' | 'vide' | 'null' | 'throw', row: { s: 5 } as Record<string, number | string | null> };
  const queryMock = async () => {
    if (state.mode === 'throw') throw new Error('column "projection_mitoyen_seuil_aire_m2" does not exist');
    if (state.mode === 'vide') return { rows: [], rowCount: 0 };
    if (state.mode === 'null') return { rows: [{ s: null }], rowCount: 1 };
    return { rows: [state.row], rowCount: 1 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { qualifierMitoyennete, batimentAppartientPermis, lireSeuilMitoyenAireM2, MITOYEN_SEUIL_AIRE_M2_DEFAUT, lireRayonContexteM, RAYON_CONTEXTE_M_DEFAUT, type IntersectionParcelleBatiment } from './projectionConfig';

/**
 * RÈGLE ARNO — un bâtiment appartient au permis si sa PARCELLE DOMINANTE fait partie du permis ET qu'il est MAJORITAIREMENT dessus.
 * PUR. Cas : majoritairement sur parcelle du permis (inclus) · mitoyen effleurant l'empreinte, dominante hors permis (exclu) · à cheval
 * majorité côté permis (inclus) · à cheval majorité hors permis (exclu) · aucune parcelle du permis renseignée (exclu).
 */
const inter = (aireInterM2: number, estParcellePermis: boolean): IntersectionParcelleBatiment => ({ aireInterM2, estParcellePermis });
describe('batimentAppartientPermis — critère parcelle dominante du permis', () => {
  it('majoritairement sur une parcelle DU PERMIS → inclus', () => {
    expect(batimentAppartientPermis(100, [inter(100, true)])).toBe(true);
    expect(batimentAppartientPermis(100, [inter(95, true), inter(5, false)])).toBe(true);
  });
  it('mitoyen effleurant l’empreinte, dominante HORS permis → exclu', () => {
    // A/C du 07511924V0040 : 0,3 m² sur l’empreinte, mais l’essentiel du bâtiment est sur une parcelle voisine.
    expect(batimentAppartientPermis(1618, [inter(1617.6, false), inter(0.36, true)])).toBe(false);
  });
  it('à cheval, MAJORITÉ côté permis → inclus (dominante = permis, > 50 %)', () => {
    expect(batimentAppartientPermis(100, [inter(60, true), inter(40, false)])).toBe(true);
  });
  it('à cheval, MAJORITÉ hors permis → exclu (dominante = voisin)', () => {
    expect(batimentAppartientPermis(100, [inter(40, true), inter(60, false)])).toBe(false);
  });
  it('à cheval sans majorité nette (dominante permis mais ≤ 50 %) → exclu (pas « majoritairement dessus »)', () => {
    expect(batimentAppartientPermis(100, [inter(40, true), inter(35, false), inter(25, false)])).toBe(false);
  });
  it('aucune parcelle du permis renseignée → exclu', () => {
    expect(batimentAppartientPermis(100, [inter(100, false)])).toBe(false);
    expect(batimentAppartientPermis(100, [])).toBe(false);
  });
  it('bâtiment d’aire nulle → exclu (jamais une division par zéro)', () => {
    expect(batimentAppartientPermis(0, [inter(0, true)])).toBe(false);
  });
});

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

describe('lireRayonContexteM — rayon LU depuis config_veille, repli sûr + provenance (PROJ-CTX)', () => {
  it('(c) valeur en base (numeric/integer → string) → rayon lu + provenance « base » ; NON codé en dur', async () => {
    H.state.mode = 'ok'; H.state.row = { r: '120' }; // 120 ≠ défaut 50 → prouve que la valeur vient bien de la config
    expect(await lireRayonContexteM()).toEqual({ rayonM: 120, provenance: 'base' });
  });
  it('colonne non migrée (erreur SQL) → défaut 50 + provenance « defaut »', async () => {
    H.state.mode = 'throw';
    expect(await lireRayonContexteM()).toEqual({ rayonM: RAYON_CONTEXTE_M_DEFAUT, provenance: 'defaut' });
    expect(RAYON_CONTEXTE_M_DEFAUT).toBe(50); // = DEFAULT de la migration 204
  });
  it('ligne absente / valeur NULL → défaut + provenance « defaut »', async () => {
    H.state.mode = 'vide';
    expect((await lireRayonContexteM()).provenance).toBe('defaut');
    H.state.mode = 'ok'; H.state.row = { r: null };
    expect((await lireRayonContexteM()).provenance).toBe('defaut');
  });
});
