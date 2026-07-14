import { describe, it, expect, beforeEach, vi } from 'vitest';

// `extractionRepo` est `server-only` + accède au pool `pg` via `../db/client`. Pour tester la GARDE FAIL-CLOSED
// (défense PRIMAIRE, RGPD) SANS base, on neutralise `server-only` et on MOCKE `query`. Preuve visée : une sélection
// de statuts VIDE renvoie un résultat vide EN N'ÉMETTANT AUCUNE requête (jamais de lecture sans contrainte de finalité).
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { lireProfilsFiltres, lireProfilsExport, lireCommunesPresentes } from './extractionRepo';

describe('extractionRepo — GARDE FAIL-CLOSED : statuts VIDE → résultat vide SANS requête (jamais toute la base)', () => {
  beforeEach(() => query.mockReset());

  it('lireProfilsFiltres([]) → { total: 0, lignes: [] } et `query` JAMAIS appelé', async () => {
    const r = await lireProfilsFiltres({}, 1, 25, []);
    expect(r).toEqual({ total: 0, lignes: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('lireProfilsExport([]) → [] et `query` JAMAIS appelé', async () => {
    const r = await lireProfilsExport({}, []);
    expect(r).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('statuts uniquement FORGÉS (normalisés → vide) → fail-closed, aucune requête', async () => {
    const r = await lireProfilsFiltres({}, 1, 25, ["hack'; DROP TABLE internaute" as never]);
    expect(r).toEqual({ total: 0, lignes: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('lireCommunesPresentes([]) → [] et `query` JAMAIS appelé (court-circuit explicite)', async () => {
    const r = await lireCommunesPresentes([]);
    expect(r).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
