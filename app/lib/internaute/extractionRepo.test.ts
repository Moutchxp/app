import { describe, it, expect, beforeEach, vi } from 'vitest';

// `extractionRepo` est `server-only` + accède au pool `pg` via `../db/client`. Pour tester la GARDE FAIL-CLOSED
// (défense PRIMAIRE, RGPD) SANS base, on neutralise `server-only` et on MOCKE `query`. Preuve visée : une sélection
// de statuts VIDE renvoie un résultat vide EN N'ÉMETTANT AUCUNE requête (jamais de lecture sans contrainte de finalité).
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { lireProfilsFiltres, lireProfilsExport, lireCommunesPresentes, compterProfils } from './extractionRepo';

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

  it('FAIL-CLOSED tient AVEC une recherche `q` : statuts vide + q présent → vide, AUCUNE requête (la recherche ne contourne pas le garde)', async () => {
    const rF = await lireProfilsFiltres({ q: 'thevenin' }, 1, 25, []);
    expect(rF).toEqual({ total: 0, lignes: [] });
    const rE = await lireProfilsExport({ q: 'thevenin' }, []);
    expect(rE).toEqual([]);
    expect(query).not.toHaveBeenCalled(); // le court-circuit statuts vide précède TOUT (y compris le filtre q)
  });
});

describe('compterProfils — COUNT du compteur LIVE : fail-closed + réutilisation des builders partagés', () => {
  beforeEach(() => query.mockReset());

  it('statuts VIDE → 0 SANS requête (jamais toute la base)', async () => {
    expect(await compterProfils({}, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('statuts uniquement FORGÉS (normalisés → vide) → 0, aucune requête', async () => {
    expect(await compterProfils({}, ["hack'; DROP TABLE internaute" as never])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('statuts valides → COUNT via clauseStatuts (EXISTS, PAS un FROM brut) ; total coercé en number', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '7' }] });
    const total = await compterProfils({ scoreMin: 60 }, ['recontact_interne']);
    expect(total).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('count(*)');
    expect(sql).toContain('internaute_consentement_actif'); // preuve : passe par clauseStatuts (intersection), pas un FROM brut
    expect(sql).not.toMatch(/\bOR\b/); // zéro OR entre statuts (un seul statut ici ; jamais d'élargissement)
    // le filtre secondaire (score) est LIÉ en paramètre (anti-injection), jamais interpolé
    expect(query.mock.calls[0][1]).toContain(60);
  });

  it('résultat vide/absent → 0 (jamais NaN)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await compterProfils({}, ['recontact_interne'])).toBe(0);
  });
});
