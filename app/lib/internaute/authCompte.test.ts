import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * CRÉATION DE COMPTE depuis le tunnel (Commit B) — `authCompte` est `server-only` + pool `pg`. On MOCKE `query` (routé
 * par SQL) et `poserMotDePasse` (capacité déjà prouvée dans authCredential.test.ts) pour PROUVER :
 *  (a) créer un compte n'émet AUCUNE écriture de consentement (aucun SQL `internaute_consentement`) — SEULE écriture =
 *      `poserMotDePasse` ;
 *  — la politique (< 12) est refusée AVANT tout accès base ;
 *  — un dossier introuvable / effacé, ou sans e-mail, est refusé sans poser de credential.
 * Aucune base réelle.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { poserMotDePasse } = vi.hoisted(() => ({ poserMotDePasse: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));
// Stand-in FIDÈLE de la politique (≥ 12) — évite d'importer argon2/DB réels ; poserMotDePasse est espionné.
vi.mock('./authCredential', () => ({
  poserMotDePasse,
  LONGUEUR_MIN: 12,
  politiqueMotDePasse: (clair: unknown) => {
    const ok = typeof clair === 'string' && clair.length >= 12;
    return { ok, erreurs: ok ? [] : ['Le mot de passe doit contenir au moins 12 caractères.'] };
  },
}));

import { creerCompteInternaute } from './authCompte';

const UN_MDP = 'motdepasse-solide-1'; // ≥ 12

describe('creerCompteInternaute — création de compte depuis le tunnel (Commit B)', () => {
  beforeEach(() => {
    query.mockReset();
    poserMotDePasse.mockReset().mockResolvedValue(undefined);
  });

  it('(a) succès → pose le credential et n’émet AUCUNE écriture de consentement', async () => {
    query.mockResolvedValue({ rows: [{ email: 'client@example.com' }] }); // dossier vivant avec e-mail
    const r = await creerCompteInternaute('uuid-1', UN_MDP);

    expect(r).toEqual({ ok: true });
    expect(poserMotDePasse).toHaveBeenCalledTimes(1);
    expect(poserMotDePasse).toHaveBeenCalledWith('uuid-1', UN_MDP);
    // AUCUN SQL de consentement : ni via query (seul un SELECT identité), et poserMotDePasse est la SEULE écriture.
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /consentement/i.test(s))).toBe(false);
    expect(sqls.every((s) => /^\s*SELECT/i.test(s))).toBe(true); // le flux ne fait qu'un SELECT + poserMotDePasse
  });

  it('mot de passe < 12 → refus AVANT tout accès base (aucune requête, aucun credential posé)', async () => {
    const r = await creerCompteInternaute('uuid-1', 'court');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe('mot_de_passe_invalide');
    expect(query).not.toHaveBeenCalled();
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  it('dossier introuvable ou effacé → refus, aucun credential posé', async () => {
    query.mockResolvedValue({ rows: [] }); // efface_a IS NULL non satisfait, ou id inconnu
    const r = await creerCompteInternaute('uuid-inconnu', UN_MDP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe('dossier_introuvable');
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  it('dossier sans e-mail (login impossible) → refus, aucun credential posé', async () => {
    query.mockResolvedValue({ rows: [{ email: null }] });
    const r = await creerCompteInternaute('uuid-1', UN_MDP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe('coordonnees_incompletes');
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });
});
