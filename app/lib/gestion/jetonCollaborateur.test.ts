import { describe, it, expect, vi, beforeEach } from 'vitest';

const schemaMock = vi.fn();
const coffreMock = vi.fn();
const auteurMock = vi.fn();
const compteMock = vi.fn();
const rafraichirMock = vi.fn();
const identifiantsMock = vi.fn();
const partageMock = vi.fn();
const noterMock = vi.fn();

vi.mock('./schema', () => ({ comptesGoogleDisponibles: () => schemaMock() }));
vi.mock('./coffre', () => ({ coffreConfigure: () => coffreMock() }));
vi.mock('./auteur', () => ({ auteurDeLaRequete: () => auteurMock() }));
vi.mock('./comptesGoogleRepo', () => ({
  lireCompteDe: (...a: unknown[]) => compteMock(...a),
  noterErreurCompte: (...a: unknown[]) => noterMock(...a),
  lireEmailDe: (...a: unknown[]) => compteMock(...a),
}));
vi.mock('./google', () => ({
  lireIdentifiants: () => identifiantsMock(),
  rafraichirJeton: (...a: unknown[]) => rafraichirMock(...a),
}));
vi.mock('./jetonAcces', () => ({ jetonAccesGestion: () => partageMock() }));

import { jetonPourRequete } from './jetonCollaborateur';

const REQ = new Request('http://x/y');

beforeEach(() => {
  for (const m of [schemaMock, coffreMock, auteurMock, compteMock, rafraichirMock, identifiantsMock, partageMock, noterMock]) m.mockReset();
  schemaMock.mockResolvedValue(true);
  coffreMock.mockReturnValue(true);
  auteurMock.mockResolvedValue({ id: 7, libelle: 'Arnaud Jorel' });
  identifiantsMock.mockReturnValue({ clientId: 'c', clientSecret: 's', source: 'drive' });
  compteMock.mockResolvedValue({ utilisateurId: 7, email: 'a.jorel@criterimmo.fr', refreshToken: '1//r', derniereErreur: null });
  rafraichirMock.mockResolvedValue({ ok: true, valeur: 'ACCES' });
  partageMock.mockResolvedValue({ etat: 'ok', jeton: 'PARTAGE' });
});

describe('le jeton employé', () => {
  /** 🔴 LE CŒUR DU LOT : c'est le jeton DU COLLABORATEUR qui sert, donc ce sont SES droits que Google applique. */
  it('collaborateur connecté → SON jeton, et SON adresse pour le journal', async () => {
    const r = await jetonPourRequete(REQ);
    expect(r).toEqual({ etat: 'ok', jeton: 'ACCES', compteGoogle: 'a.jorel@criterimmo.fr', source: 'collaborateur' });
  });

  /**
   * Tant que la migration 246 n'est pas appliquée, le comportement est EXACTEMENT celui d'avant : on ne retire
   * aucune fonction en attendant qu'Arno passe la migration.
   */
  it('migration absente → comportement d’AVANT, avec le compte partagé', async () => {
    schemaMock.mockResolvedValue(false);
    const r = await jetonPourRequete(REQ);
    expect(r).toMatchObject({ etat: 'ok', jeton: 'PARTAGE', source: 'compte_partage' });
    expect(compteMock).not.toHaveBeenCalled();
  });

  it('migration absente ET compte partagé injoignable → refus, sans prétendre', async () => {
    schemaMock.mockResolvedValue(false);
    partageMock.mockResolvedValue({ etat: 'non_connecte', motif: 'pas autorisé' });
    const r = await jetonPourRequete(REQ);
    expect(r.etat).toBe('refus');
  });
});

describe('les refus, et le geste qu’ils appellent', () => {
  /** On n'offre pas de relier un compte si l'on ne saurait pas relire le jeton demain. */
  it('coffre non configuré → on ne propose PAS de connexion', async () => {
    coffreMock.mockReturnValue(false);
    const r = await jetonPourRequete(REQ);
    expect(r.etat).toBe('refus');
    if (r.etat === 'refus') expect(r.etatCollaborateur.etat).toBe('coffre_absent');
  });

  it('aucun compte relié → « jamais connecté », donc un bouton de connexion', async () => {
    compteMock.mockResolvedValue(null);
    const r = await jetonPourRequete(REQ);
    if (r.etat === 'refus') expect(r.etatCollaborateur.etat).toBe('jamais');
  });

  /** Voie de secours (mot de passe partagé) : aucune identité personnelle, donc aucun compte Google personnel. */
  it('accès de secours (sans identité) → aucun compte personnel possible', async () => {
    auteurMock.mockResolvedValue({ id: null, libelle: 'accès de secours' });
    const r = await jetonPourRequete(REQ);
    if (r.etat === 'refus') expect(r.etatCollaborateur.etat).toBe('jamais');
  });

  /**
   * 🔴 « JAMAIS CONNECTÉ » ET « EXPIRÉ » NE SE RÉPARENT PAS PAREIL. Le second doit proposer de REFAIRE
   * l'autorisation, et le refus doit être NOTÉ pour que la fois suivante le dise tout de suite.
   */
  it('jeton refusé par Google → « à reconnecter », et le refus est NOTÉ', async () => {
    rafraichirMock.mockResolvedValue({ ok: false, motif: 'Jeton refusé par Google (invalid_grant).' });
    const r = await jetonPourRequete(REQ);
    expect(r.etat).toBe('refus');
    if (r.etat === 'refus') {
      expect(r.etatCollaborateur.etat).toBe('a_reconnecter');
      expect(r.etatCollaborateur).toMatchObject({ email: 'a.jorel@criterimmo.fr' });
    }
    expect(noterMock).toHaveBeenCalledWith(7, expect.stringContaining('invalid_grant'));
  });

  it('jeton illisible en base (clé changée) → « à reconnecter », sans appeler Google', async () => {
    compteMock.mockResolvedValue({ utilisateurId: 7, email: 'a@criterimmo.fr', refreshToken: '', derniereErreur: 'clé changée' });
    const r = await jetonPourRequete(REQ);
    if (r.etat === 'refus') expect(r.etatCollaborateur.etat).toBe('a_reconnecter');
    expect(rafraichirMock).not.toHaveBeenCalled();
  });

  it('Google injoignable → « à reconnecter », jamais une exception qui remonte à l’écran', async () => {
    rafraichirMock.mockRejectedValue(new Error('réseau'));
    const r = await jetonPourRequete(REQ);
    expect(r.etat).toBe('refus');
  });
});
