import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const verifierMock = vi.fn();
const sessionMock = vi.fn();
const delegationMock = vi.fn();
const jetonSubjectMock = vi.fn();
const domainesMock = vi.fn();

vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
}));
vi.mock('../admin/session', () => ({
  NOM_COOKIE: 'svav_admin',
  verifierJeton: (...a: unknown[]) => verifierMock(...a),
  sessionDepuisPayload: (...a: unknown[]) => sessionMock(...a),
}));
vi.mock('./compteService', () => ({ delegationConfiguree: () => delegationMock() }));
vi.mock('./driveDelegue', () => ({ jetonPourSubject: (...a: unknown[]) => jetonSubjectMock(...a) }));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: () => domainesMock() }));

import { adresseDuCollaborateur, jetonPourRequete, messageAcces } from './jetonCollaborateur';

/** Une requête AVEC session. Aucune ne porte d'adresse : c'est justement ce que les tests vérifient. */
const requete = (url = 'http://x/api/admin/gestion/drive/dossiers'): Request =>
  new Request(url, { headers: { cookie: 'svav_admin=jeton-signe' } });

beforeEach(() => {
  for (const m of [queryMock, verifierMock, sessionMock, delegationMock, jetonSubjectMock, domainesMock]) m.mockReset();
  verifierMock.mockResolvedValue({ sub: '2' });
  sessionMock.mockReturnValue({ sub: 2, identifiant: 'a.jorel@sansvisavis.com', role: 'administrateur' });
  queryMock.mockResolvedValue({ rows: [{ identifiant: 'a.jorel@sansvisavis.com', actif: true }] });
  delegationMock.mockReturnValue(true);
  jetonSubjectMock.mockResolvedValue({ ok: true, jeton: 'ACCES' });
  domainesMock.mockResolvedValue('criterimmo.fr,sansvisavis.com');
});

describe('l’adresse au nom de laquelle on agit', () => {
  it('vient de la session, relue en base', async () => {
    expect(await adresseDuCollaborateur(requete())).toEqual({ etat: 'ok', adresse: 'a.jorel@sansvisavis.com' });
    // Relue en base, et par l'IDENTIFIANT du compte de session — jamais par autre chose.
    expect(queryMock.mock.calls[0][1]).toEqual([2]);
  });

  /**
   * 🔴 LE TEST QUI TIENT LA SERRURE DU LOT. La délégation au niveau du domaine est un pouvoir d'usurpation
   * d'identité sur tout le domaine : si une adresse venue du navigateur pouvait devenir le `subject`, n'importe qui
   * agirait au nom de n'importe qui. Les paramètres, le corps et les en-têtes sont IGNORÉS, et ils doivent le rester.
   */
  it('un paramètre d’URL qui souffle une autre adresse est IGNORÉ', async () => {
    const r = await adresseDuCollaborateur(
      requete('http://x/api/admin/gestion/drive/dossiers?subject=patron@sansvisavis.com&email=autre@criterimmo.fr'));
    expect(r).toEqual({ etat: 'ok', adresse: 'a.jorel@sansvisavis.com' });
  });

  it('un en-tête qui souffle une autre adresse est IGNORÉ', async () => {
    const req = new Request('http://x/y', {
      headers: { cookie: 'svav_admin=jeton-signe', 'x-subject': 'patron@sansvisavis.com', from: 'autre@criterimmo.fr' },
    });
    expect(await adresseDuCollaborateur(req)).toEqual({ etat: 'ok', adresse: 'a.jorel@sansvisavis.com' });
  });

  it('l’adresse est ramenée en minuscules — c’est elle qui sert de subject', async () => {
    queryMock.mockResolvedValue({ rows: [{ identifiant: 'A.Jorel@SansVisAVis.com', actif: true }] });
    expect(await adresseDuCollaborateur(requete())).toEqual({ etat: 'ok', adresse: 'a.jorel@sansvisavis.com' });
  });
});

describe('les refus, et ce qu’ils disent', () => {
  it('aucune session → on ne sait pas au nom de qui ouvrir', async () => {
    verifierMock.mockResolvedValue(null);
    const r = await adresseDuCollaborateur(new Request('http://x/y'));
    expect(r.etat).toBe('sans_adresse');
  });

  /** Voie de secours (mot de passe partagé) : aucune identité personnelle, donc aucun Drive personnel. */
  it('accès de secours → pas d’adresse professionnelle, et c’est dit sans dramatiser', async () => {
    sessionMock.mockReturnValue({ sub: null, identifiant: null, role: 'administrateur' });
    const r = await adresseDuCollaborateur(requete());
    expect(r.etat).toBe('sans_adresse');
    if (r.etat === 'sans_adresse') expect(r.motif).toContain('n’est rattaché à aucune adresse');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('compte désactivé entre-temps → refus (la base fait foi, pas la session)', async () => {
    queryMock.mockResolvedValue({ rows: [{ identifiant: 'a.jorel@sansvisavis.com', actif: false }] });
    expect((await adresseDuCollaborateur(requete())).etat).toBe('sans_adresse');
  });

  it('identifiant qui n’est pas une adresse → refus lisible', async () => {
    queryMock.mockResolvedValue({ rows: [{ identifiant: 'arnaud', actif: true }] });
    const r = await adresseDuCollaborateur(requete());
    expect(r.etat).toBe('sans_adresse');
    if (r.etat === 'sans_adresse') expect(r.motif).toContain('adresse professionnelle');
  });

  /** Le domaine est un RÉGLAGE (lot 5-PJ-C) : un identifiant hors entreprise ne part pas en délégation. */
  it('domaine hors entreprise → refusé, et le message DIT les domaines acceptés', async () => {
    queryMock.mockResolvedValue({ rows: [{ identifiant: 'moi@gmail.com', actif: true }] });
    const r = await adresseDuCollaborateur(requete());
    expect(r.etat).toBe('sans_adresse');
    if (r.etat === 'sans_adresse') {
      expect(r.motif).toContain('criterimmo.fr');
      expect(r.motif).toContain('sansvisavis.com');
    }
  });

  it('aucun domaine configuré → on ne bloque pas sur le domaine (Google tranchera)', async () => {
    domainesMock.mockResolvedValue('');
    expect((await adresseDuCollaborateur(requete())).etat).toBe('ok');
  });
});

describe('le jeton de la requête', () => {
  it('est demandé POUR l’adresse de session, et rend cette adresse pour le journal', async () => {
    const r = await jetonPourRequete(requete());
    expect(r).toEqual({ etat: 'ok', jeton: 'ACCES', compteGoogle: 'a.jorel@sansvisavis.com' });
    expect(jetonSubjectMock.mock.calls[0][0]).toBe('a.jorel@sansvisavis.com');
  });

  /** L'administrateur n'a pas fini : ce n'est pas la faute de l'utilisateur, et le message ne le lui reproche pas. */
  it('clé du compte de service absente → « pas encore configuré », sans appeler Google', async () => {
    delegationMock.mockReturnValue(false);
    const r = await jetonPourRequete(requete());
    expect(r.etat).toBe('refus');
    if (r.etat === 'refus') expect(r.acces.etat).toBe('non_configure');
    expect(jetonSubjectMock).not.toHaveBeenCalled();
  });

  it('délégation non déclarée côté Google → « pas encore configuré »', async () => {
    jetonSubjectMock.mockResolvedValue({ ok: false, cause: 'non_configure', motif: 'Drive pas encore configuré par l’administrateur.' });
    const r = await jetonPourRequete(requete());
    if (r.etat === 'refus') expect(r.acces.etat).toBe('non_configure');
  });

  it('compte inconnu ou suspendu dans l’organisation → « sans accès », avec le motif de Google', async () => {
    jetonSubjectMock.mockResolvedValue({ ok: false, cause: 'refus', motif: 'Votre adresse n’a pas d’accès Drive dans l’organisation.' });
    const r = await jetonPourRequete(requete());
    expect(r.etat).toBe('refus');
    if (r.etat === 'refus') {
      expect(r.acces.etat).toBe('sans_acces');
      expect(r.motif).toContain('pas d’accès Drive');
    }
  });

  it('adresse refusée en amont → on ne demande AUCUN jeton', async () => {
    queryMock.mockResolvedValue({ rows: [{ identifiant: 'moi@gmail.com', actif: true }] });
    await jetonPourRequete(requete());
    expect(jetonSubjectMock).not.toHaveBeenCalled();
  });
});

describe('les messages affichés', () => {
  it('chaque état a le sien, et aucun ne demande un geste à l’utilisateur', () => {
    expect(messageAcces({ etat: 'ok', adresse: 'a@b.fr' })).toContain('a@b.fr');
    expect(messageAcces({ etat: 'non_configure', motif: 'Drive pas encore configuré par l’administrateur.' }))
      .toBe('Drive pas encore configuré par l’administrateur.');
    expect(messageAcces({ etat: 'sans_acces', motif: 'Votre adresse n’a pas d’accès Drive dans l’organisation.' }))
      .toContain('pas d’accès Drive');
    // Plus aucun « Connecter mon Google Drive » : le lot 5-PJ-C2 a retiré ce parcours, sur décision d'Arno.
    for (const e of ['non_configure', 'sans_acces'] as const) {
      expect(messageAcces({ etat: e, motif: 'x' })).not.toContain('Connecter');
    }
  });
});
