import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg (client.ts) — aucune vraie connexion en test ; on assère le SQL et les params.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
// Mock du hachage : déterministe et instantané (pas d'argon2 réel dans ces tests unitaires).
vi.mock('./motDePasse', () => ({
  hacher: (clair: string) => Promise.resolve(`HASH:${clair}`),
}));

import { creerCompte, reinitialiserMotDePasse, secours, trouverCompte, ErreurCompte } from './comptes';

/** Ligne compte minimale renvoyée par trouverCompte. */
function ligne(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 42,
    identifiant: 'arno',
    mot_de_passe: 'HASH:ancien',
    role: 'collaborateur',
    actif: false,
    perm_pilotage: false,
    perm_cartes_annee: false,
    perm_statistiques: false,
    perm_internautes: false,
    perm_curation: false,
    perm_banc_test: false,
    derniere_connexion_a: null,
    cree_a: '2026-01-01',
    ...over,
  };
}

/** Toutes les requêtes émises (texte SQL). */
function sqlsEmis(): string[] {
  return queryMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('trouverCompte (recherche insensible à la casse)', () => {
  it('compare lower(identifiant) = lower($1) — l’index lower() de 014 sert la casse (critère d)', async () => {
    queryMock.mockResolvedValue({ rows: [ligne()] });
    await trouverCompte('A.Jorel@SansVisAVis.COM');
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('lower(identifiant) = lower($1)');
    expect((queryMock.mock.calls[0][1] as unknown[])[0]).toBe('A.Jorel@SansVisAVis.COM'); // saisie transmise telle quelle
  });
});

describe('creerCompte', () => {
  it('refuse un identifiant déjà pris (insensible à la casse) et n’INSÈRE rien', async () => {
    queryMock.mockResolvedValueOnce({ rows: [ligne()] }); // trouverCompte → existe
    await expect(creerCompte('ARNO', 'administrateur', 'x')).rejects.toBeInstanceOf(ErreurCompte);
    expect(sqlsEmis().some((s) => s.includes('INSERT INTO admin_utilisateur'))).toBe(false);
  });

  it('crée quand absent : INSERT compte + journal, hash passé (jamais le clair)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // trouverCompte → absent
      .mockResolvedValueOnce({ rows: [{ id: 1, identifiant: 'arno', role: 'administrateur', actif: true }] });
    const c = await creerCompte('arno', 'administrateur', 'secret');
    expect(c).toMatchObject({ identifiant: 'arno', role: 'administrateur', actif: true });
    const insert = queryMock.mock.calls[1];
    expect(String(insert[0])).toContain('INSERT INTO admin_utilisateur');
    expect(String(insert[0])).toContain('admin_utilisateur_log');
    const params = insert[1] as unknown[];
    expect(params).toContain('HASH:secret'); // le hash, pas 'secret'
    expect(params).not.toContain('secret');
  });
});

describe('reinitialiserMotDePasse', () => {
  it('met à jour le mot de passe et journalise', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno', role: 'collaborateur', actif: true }] });
    const c = await reinitialiserMotDePasse('arno', 'nouveau');
    expect(c.identifiant).toBe('arno');
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('UPDATE admin_utilisateur SET mot_de_passe');
    expect(sql).toContain('reinitialisation_mot_de_passe');
    expect((queryMock.mock.calls[0][1] as unknown[])[1]).toBe('HASH:nouveau');
  });

  it('compte introuvable (0 ligne) → ErreurCompte', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(reinitialiserMotDePasse('fantome', 'x')).rejects.toBeInstanceOf(ErreurCompte);
  });
});

describe('secours (idempotent)', () => {
  it('compte absent → création en administrateur actif', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // trouverCompte → absent
      .mockResolvedValueOnce({ rows: [{ id: 9, identifiant: 'arno', role: 'administrateur', actif: true }] });
    const r = await secours('arno', 'mdp');
    expect(r.action).toBe('creation');
    expect(r).toMatchObject({ role: 'administrateur', actif: true });
  });

  it('compte existant (désactivé) → réactivation en administrateur, toutes perms', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ligne({ actif: false, role: 'collaborateur' })] }) // trouverCompte
      .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno', role: 'administrateur', actif: true }] });
    const r = await secours('arno', 'mdp');
    expect(r.action).toBe('reactivation');
    const sql = String(queryMock.mock.calls[1][0]);
    expect(sql).toContain('actif = true');
    expect(sql).toContain("role = 'administrateur'");
    expect(sql).toContain('perm_curation = true');
  });

  it('DEUX exécutions successives → même état final (administrateur actif) — idempotence (f)', async () => {
    for (let i = 0; i < 2; i++) {
      queryMock.mockReset();
      queryMock
        .mockResolvedValueOnce({ rows: [ligne({ actif: true, role: 'administrateur' })] })
        .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno', role: 'administrateur', actif: true }] });
      const r = await secours('arno', 'mdp');
      expect(r).toMatchObject({ action: 'reactivation', role: 'administrateur', actif: true });
    }
  });

  it('n’émet AUCUN DELETE/DROP/TRUNCATE', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ligne()] })
      .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno', role: 'administrateur', actif: true }] });
    await secours('arno', 'mdp');
    const tout = sqlsEmis().join(' ').toUpperCase();
    expect(tout).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/);
  });
});
