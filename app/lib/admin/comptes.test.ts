import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg (client.ts) — aucune vraie connexion en test ; on assère le SQL et les params.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  // withTransaction : exécute `fn` avec une fonction de requête routée vers queryMock (mêmes appels observables).
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
// Mock du hachage : déterministe et instantané (pas d'argon2 réel dans ces tests unitaires).
vi.mock('./motDePasse', () => ({
  hacher: (clair: string) => Promise.resolve(`HASH:${clair}`),
}));

import {
  creerCompte,
  reinitialiserMotDePasse,
  secours,
  trouverCompte,
  creerCompteAdministration,
  regenererMotDePasseTemporaire,
  reactiverCompte,
  desactiverCompte,
  modifierPermissions,
  promouvoirAdministrateur,
  ErreurCompte,
} from './comptes';

const PERMS_VIDE = { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false };

/** Ligne compte minimale renvoyée par trouverCompte. */
function ligne(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 42,
    identifiant: 'arno@x.fr',
    prenom: 'Arnaud',
    nom: 'Jorel',
    mot_de_passe: 'HASH:ancien',
    role: 'collaborateur',
    actif: false,
    doit_changer_mot_de_passe: false,
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

  it('le SELECT remonte les 3 nouvelles colonnes (prenom, nom, doit_changer_mot_de_passe) — M3-4', async () => {
    queryMock.mockResolvedValue({ rows: [ligne()] });
    await trouverCompte('arno@x.fr');
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('prenom');
    expect(sql).toContain(', nom,'); // token délimité : 'prenom' contient déjà 'nom', un toContain('nom') serait tautologique
    expect(sql).toContain('doit_changer_mot_de_passe');
  });
});

describe('creerCompte', () => {
  it('refuse prénom/nom vides (ou blancs seuls) AVANT tout INSERT — backstop du CHECK de 016', async () => {
    await expect(creerCompte('a@x.fr', 'administrateur', 'x', '   ', 'Jorel')).rejects.toBeInstanceOf(ErreurCompte);
    await expect(creerCompte('a@x.fr', 'administrateur', 'x', 'Arnaud', '')).rejects.toBeInstanceOf(ErreurCompte);
    expect(queryMock).not.toHaveBeenCalled(); // ni trouverCompte, ni INSERT
  });

  it('refuse un identifiant déjà pris (insensible à la casse) et n’INSÈRE rien', async () => {
    queryMock.mockResolvedValueOnce({ rows: [ligne()] }); // trouverCompte → existe
    await expect(creerCompte('ARNO@X.FR', 'administrateur', 'x', 'Arnaud', 'Jorel')).rejects.toBeInstanceOf(ErreurCompte);
    expect(sqlsEmis().some((s) => s.includes('INSERT INTO admin_utilisateur'))).toBe(false);
  });

  it('crée quand absent : INSERT compte (avec prenom/nom) + journal, hash passé (jamais le clair)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // trouverCompte → absent
      .mockResolvedValueOnce({ rows: [{ id: 1, identifiant: 'arno@x.fr', role: 'administrateur', actif: true }] });
    const c = await creerCompte('arno@x.fr', 'administrateur', 'secret', 'Arnaud', 'Jorel');
    expect(c).toMatchObject({ identifiant: 'arno@x.fr', role: 'administrateur', actif: true });
    const insert = queryMock.mock.calls[1];
    expect(String(insert[0])).toContain('INSERT INTO admin_utilisateur');
    expect(String(insert[0])).toContain('prenom, nom');
    expect(String(insert[0])).toContain('admin_utilisateur_log');
    const params = insert[1] as unknown[];
    expect(params).toContain('HASH:secret'); // le hash, pas 'secret'
    expect(params).not.toContain('secret');
    expect(params).toContain('Arnaud');
    expect(params).toContain('Jorel');
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

describe('secours (réactivation seule — M3-4)', () => {
  it('identifiant INCONNU → ErreurCompte, AUCUN INSERT, aucune création', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // trouverCompte → absent
    await expect(secours('inconnu@x.fr', 'mdp')).rejects.toBeInstanceOf(ErreurCompte);
    // Un seul appel (le SELECT de trouverCompte) ; jamais d'INSERT.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sqlsEmis().some((s) => s.includes('INSERT INTO admin_utilisateur'))).toBe(false);
  });

  it('compte existant (désactivé) → réactivation en administrateur, toutes perms, prenom/nom INTOUCHÉS', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ligne({ actif: false, role: 'collaborateur' })] }) // trouverCompte
      .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno@x.fr', role: 'administrateur', actif: true }] });
    const r = await secours('arno@x.fr', 'mdp');
    expect(r).toMatchObject({ role: 'administrateur', actif: true });
    const sql = String(queryMock.mock.calls[1][0]);
    expect(sql).toContain('actif = true');
    expect(sql).toContain("role = 'administrateur'");
    expect(sql).toContain('perm_curation = true');
    expect(sql).not.toContain('prenom'); // ne touche jamais l'identité
    expect(sql).not.toContain('nom =');
  });

  it('DEUX exécutions successives sur un compte existant → même état final (idempotence)', async () => {
    for (let i = 0; i < 2; i++) {
      queryMock.mockReset();
      queryMock
        .mockResolvedValueOnce({ rows: [ligne({ actif: true, role: 'administrateur' })] })
        .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno@x.fr', role: 'administrateur', actif: true }] });
      const r = await secours('arno@x.fr', 'mdp');
      expect(r).toMatchObject({ role: 'administrateur', actif: true });
      // Idempotence PROUVÉE : le SET est ABSOLU (ne lit aucune valeur préexistante) → rejouer converge.
      const sql = String(queryMock.mock.calls[1][0]);
      expect(sql).toContain('actif = true');
      expect(sql).toContain("role = 'administrateur'");
      expect(sql).toContain('perm_banc_test = true');
    }
  });

  it('n’émet AUCUN DELETE/DROP/TRUNCATE', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ligne()] })
      .mockResolvedValueOnce({ rows: [{ id: 42, identifiant: 'arno@x.fr', role: 'administrateur', actif: true }] });
    await secours('arno@x.fr', 'mdp');
    const tout = sqlsEmis().join(' ').toUpperCase();
    expect(tout).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/);
  });
});

describe('creerCompteAdministration (tuile — M3-4 Lot C)', () => {
  it('collaborateur : doit_changer_mot_de_passe=true, perms soumises, hash (jamais le clair), auteur_id journalisé', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // trouverCompte → absent
      .mockResolvedValueOnce({ rows: [{ id: 7, identifiant: 'lea@x.fr', role: 'collaborateur', actif: true }] });
    await creerCompteAdministration({
      identifiant: 'lea@x.fr', prenom: 'Léa', nom: 'M', role: 'collaborateur',
      perms: { ...PERMS_VIDE, curation: true }, motDePasseClair: 'TEMP-secret', auteurId: 3,
    });
    const [sql, params] = queryMock.mock.calls[1];
    expect(String(sql)).toContain('doit_changer_mot_de_passe');
    expect(String(sql)).toContain("VALUES ($1, $2, $3, $4, $5, true, true"); // actif=true, doit_changer=true
    expect(params).toContain('HASH:TEMP-secret');
    expect(params).not.toContain('TEMP-secret');
    expect(params).toContain(true); // perm curation soumise
    expect(params[params.length - 1]).toBe(3); // auteur_id = créateur
  });

  it('administrateur : toutes les perms forcées true (cases ignorées)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 8, identifiant: 'chef@x.fr', role: 'administrateur', actif: true }] });
    await creerCompteAdministration({
      identifiant: 'chef@x.fr', prenom: 'C', nom: 'H', role: 'administrateur',
      perms: PERMS_VIDE, motDePasseClair: 'x', auteurId: 3, // perms toutes false en entrée
    });
    const params = queryMock.mock.calls[1][1] as unknown[];
    // params[5..10] = les 6 perm_* → toutes true pour un administrateur
    expect(params.slice(5, 11)).toEqual([true, true, true, true, true, true]);
  });

  it('voie de secours (auteurId=null) → journal auteur_id NULL', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9, identifiant: 'x@x.fr', role: 'collaborateur', actif: true }] });
    await creerCompteAdministration({ identifiant: 'x@x.fr', prenom: 'X', nom: 'Y', role: 'collaborateur', perms: PERMS_VIDE, motDePasseClair: 'x', auteurId: null });
    const params = queryMock.mock.calls[1][1] as unknown[];
    expect(params[params.length - 1]).toBeNull();
  });

  it('identifiant déjà pris → ErreurCompte, aucun INSERT', async () => {
    queryMock.mockResolvedValueOnce({ rows: [ligne()] });
    await expect(creerCompteAdministration({ identifiant: 'arno@x.fr', prenom: 'A', nom: 'B', role: 'collaborateur', perms: PERMS_VIDE, motDePasseClair: 'x', auteurId: 1 }))
      .rejects.toBeInstanceOf(ErreurCompte);
    expect(sqlsEmis().some((s) => s.includes('INSERT INTO admin_utilisateur'))).toBe(false);
  });
});

describe('regenererMotDePasseTemporaire (Lot C)', () => {
  it('repose doit_changer=true, journalise, hash passé', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, identifiant: 'lea@x.fr', role: 'collaborateur', actif: true }] });
    await regenererMotDePasseTemporaire(5, 'NOUV-temp', 3);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain('doit_changer_mot_de_passe = true');
    expect(String(sql)).toContain('reinitialisation_mot_de_passe');
    expect(params).toEqual([5, 'HASH:NOUV-temp', 3]);
  });
  it('compte inconnu (0 ligne) → ErreurCompte', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(regenererMotDePasseTemporaire(999, 'x', 1)).rejects.toBeInstanceOf(ErreurCompte);
  });
});

describe('desactiverCompte — dernier administrateur actif (sérialisé anti write-skew, Lot C)', () => {
  it('prend un verrou consultatif PUIS applique l’UPDATE conditionnel de comptage', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] }) // SELECT pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }); // UPDATE conditionnel
    const ok = await desactiverCompte(2, 3);
    expect(ok).toBe(true);
    // 1ʳᵉ requête = verrou de sérialisation (empêche le write-skew de deux désactivations concurrentes).
    expect(String(queryMock.mock.calls[0][0])).toContain('pg_advisory_xact_lock');
    const sql = String(queryMock.mock.calls[1][0]);
    expect(sql).toContain('UPDATE admin_utilisateur SET actif = false');
    expect(sql).toContain("role <> 'administrateur'"); // R-D : jamais un administrateur via l'UI
    expect(sql).toContain("NOT (role = 'administrateur'"); // filet dernier-admin (défense en profondeur)
    expect(sql).toContain('desactivation');
  });
  it('0 ligne modifiée (bloqué/absent/déjà inactif) → false', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] }) // verrou
      .mockResolvedValueOnce({ rows: [] }); // UPDATE ne modifie rien
    expect(await desactiverCompte(1, 3)).toBe(false);
  });
});

describe('reactiverCompte (Lot C)', () => {
  it('réactive (false→true) et journalise ; idempotent (déjà actif → false)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    expect(await reactiverCompte(4, 3)).toBe(true);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('SET actif = true');
    expect(sql).toContain("role <> 'administrateur'"); // R-D : l'UI ne réactive qu'un collaborateur
    expect(sql).toContain('reactivation');
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [] }); // déjà actif → aucune ligne
    expect(await reactiverCompte(4, 3)).toBe(false);
  });
});

describe('modifierPermissions — collaborateur seulement (Lot D)', () => {
  it('UPDATE conditionnel WHERE role=collaborateur + journal changement_permissions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const ok = await modifierPermissions(5, { ...PERMS_VIDE, curation: true }, 3);
    expect(ok).toBe(true);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain("WHERE id = $1 AND role = 'collaborateur'"); // jamais un administrateur
    expect(String(sql)).toContain('changement_permissions');
    expect(params).toContain(3); // auteur_id
    expect(params).toContain(true); // perm curation soumise
  });
  it('0 ligne (absent ou administrateur → perms implicites) → false', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await modifierPermissions(9, PERMS_VIDE, 3)).toBe(false);
  });
});

describe('promouvoirAdministrateur — collaborateur → administrateur (Lot D)', () => {
  it('force role=administrateur + les 6 perms true, WHERE role=collaborateur, journal changement_role', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 6 }] });
    const ok = await promouvoirAdministrateur(6, 3);
    expect(ok).toBe(true);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("SET role = 'administrateur'");
    expect(sql).toContain('perm_pilotage = true');
    expect(sql).toContain('perm_banc_test = true');
    expect(sql).toContain("WHERE id = $1 AND role = 'collaborateur'"); // idempotent + jamais de rétrogradation
    expect(sql).toContain('changement_role');
  });
  it('0 ligne (absent ou déjà administrateur) → false — aucune rétrogradation possible', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await promouvoirAdministrateur(1, 3)).toBe(false);
  });
});
