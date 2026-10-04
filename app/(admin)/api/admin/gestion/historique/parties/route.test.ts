import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const auteurMock = vi.fn();
vi.mock('../../../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: (...a: unknown[]) => auteurMock(...a),
}));
const categoriesMock = vi.fn();
const cartesMock = vi.fn();
const poserCategorieMock = vi.fn();
const poserCarteMock = vi.fn();
vi.mock('../../../../../../lib/gestion/partieCategorieRepo', () => ({
  lireCategoriesDuBien: (...a: unknown[]) => categoriesMock(...a),
  lireCartesDuBien: (...a: unknown[]) => cartesMock(...a),
  poserCategorieAlaMain: (...a: unknown[]) => poserCategorieMock(...a),
  poserCarteAlaMain: (...a: unknown[]) => poserCarteMock(...a),
}));

import { GET, POST } from './route';

/**
 * LOT HISTORIQUE-BIEN-2 — LA PORTE D'ÉCRITURE DU BLOC « PARTIES ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ELLE SERT. Le bouton « + » d'une partie NON affectée : « une petite carte de création de contact
 * (nom, adresse mail pré-remplie, téléphone, et un choix de catégorie Propriétaire / Locataire / Tiers
 * indépendant) […] Valider range la partie dans le bon groupe en direct » (Arno, 04/10/2026).
 *
 * 🔴 CE QUE CE FICHIER PROTÈGE, ET QUE LES TESTS D'ÉCRAN NE PEUVENT PAS PROTÉGER : que le droit est exigé AVANT
 * toute écriture, que l'auteur vient de la SESSION et jamais du corps de la requête, qu'un tiers indépendant ne
 * reçoit AUCUNE carte, et qu'un échec de la carte ne défait pas le rangement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const poste = (corps: unknown): Request => new Request('http://local/api/admin/gestion/historique/parties', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

const BASE = { cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'locataire' };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  auteurMock.mockReset(); auteurMock.mockResolvedValue({ id: 3, libelle: 'a.jorel@sansvisavis.com' });
  categoriesMock.mockReset(); categoriesMock.mockResolvedValue([]);
  cartesMock.mockReset(); cartesMock.mockResolvedValue([]);
  poserCategorieMock.mockReset(); poserCategorieMock.mockResolvedValue({ ok: true, id: 1, nb: 1 });
  poserCarteMock.mockReset(); poserCarteMock.mockResolvedValue({ ok: true, id: 2, nb: 1 });
});

describe('🔒 le droit, et l’auteur', () => {
  it('🔒 exige le droit « gestion » AVANT toute écriture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(poste(BASE))).status).toBe(403);
    expect(poserCategorieMock).not.toHaveBeenCalled();
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 L'AUTEUR EST LU DANS LA SESSION, JAMAIS DANS LE CORPS. Un corps qui nommerait son auteur permettrait de
   * signer un rangement au nom d'un collègue — et un rangement manuel PRIME sur tous les autres.
   */
  it('🔴🔴 l’auteur vient de la session, et le corps ne peut pas le choisir', async () => {
    await POST(poste({ ...BASE, auteur: { id: 99, libelle: 'quelqu’un d’autre' } }));
    expect(poserCategorieMock.mock.calls[0][0].auteur).toEqual({ id: 3, libelle: 'a.jorel@sansvisavis.com' });
  });
});

describe('🔴 ce qu’elle refuse', () => {
  it('🔴 une cible qui n’est pas un bien', async () => {
    for (const cible of ['locataire-12', 'proprietaire-4', '', 'lot-']) {
      const r = await POST(poste({ ...BASE, cible }));
      expect(r.status).toBe(400);
    }
    expect(poserCategorieMock).not.toHaveBeenCalled();
  });

  it('🔴 aucune adresse', async () => {
    const r = await POST(poste({ ...BASE, adresse: '   ' }));
    expect(r.status).toBe(400);
    expect((await r.json()).motif).toContain('Aucune adresse');
  });

  /**
   * 🔴🔴 « NON AFFECTÉE » N'EST PAS UNE CATÉGORIE QU'ON POSE : c'est l'absence de rangement. L'accepter aurait
   * permis d'écrire « à répartir » à la main par-dessus une proposition — c'est-à-dire de figer un non-choix.
   */
  it('🔴🔴 une catégorie absente, inconnue, ou « a_repartir »', async () => {
    for (const categorie of [undefined, '', 'a_repartir', 'syndic', 42]) {
      const r = await POST(poste({ ...BASE, categorie }));
      expect(r.status).toBe(400);
      expect((await r.json()).motif).toContain('Choisissez une catégorie');
    }
    expect(poserCategorieMock).not.toHaveBeenCalled();
  });

  it('🔴 un corps qui n’est pas du JSON', async () => {
    const r = await POST(new Request('http://local/x', { method: 'POST', body: 'pas du json' }));
    expect(r.status).toBe(400);
  });
});

describe('🔴🔴 ce qu’elle écrit', () => {
  it('🔴 le rangement part avec la clé du bien, l’adresse et la catégorie', async () => {
    await POST(poste({ ...BASE, nom: ' Sophie AXA ', telephone: ' 06 11 22 33 44 ' }));
    expect(poserCategorieMock.mock.calls[0][0]).toMatchObject({
      adresse: 'assureur@fictif.test', lotCle: '155', categorie: 'locataire',
    });
    /* ⚠️ LES BLANCS SONT COUPÉS : « Sophie AXA » et non « Sophie AXA » avec ses espaces. */
    expect(poserCarteMock.mock.calls[0][0]).toMatchObject({
      lotCle: '155', cote: 'locataire', adresse: 'assureur@fictif.test',
      nom: 'Sophie AXA', telephone: '06 11 22 33 44',
    });
  });

  /** 🔴 LE CÔTÉ DE LA CARTE VIENT DE `coteDeLaCategorie`, le juge du rangement — jamais d'un `if` écrit ici. */
  it('🔴 une catégorie « propriétaire » range la carte du côté propriétaire', async () => {
    await POST(poste({ ...BASE, categorie: 'proprietaire', nom: 'M. ROI' }));
    expect(poserCarteMock.mock.calls[0][0].cote).toBe('proprietaire');
  });

  /**
   * 🔴🔴 UN TIERS INDÉPENDANT NE REÇOIT AUCUNE CARTE. Règle du lot précédent, inchangée : il n'est pas un contact
   * de CE bien, il travaille pour nous sur beaucoup de biens. C'est `coteDeLaCategorie` qui rend `null`, et ce
   * `null` — pas une condition recopiée — qui empêche la carte.
   */
  it('🔴🔴 un tiers indépendant est rangé, et ne reçoit AUCUNE carte', async () => {
    const r = await POST(poste({ ...BASE, categorie: 'independant', nom: 'GDS PROPRETÉ' }));
    expect((await r.json()).etat).toBe('ok');
    expect(poserCategorieMock.mock.calls[0][0].categorie).toBe('independant');
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /** ⚠️ NOM ET TÉLÉPHONE SONT FACULTATIFS : une carte nue, à compléter, vaut mieux que pas de rangement. */
  it('⚠️ sans nom ni téléphone, la carte est posée quand même', async () => {
    await POST(poste(BASE));
    expect(poserCarteMock.mock.calls[0][0]).toMatchObject({ nom: null, telephone: null });
  });
});

describe('🔴🔴 ce qu’elle fait quand le dépôt refuse', () => {
  /** 🔴 UN REFUS DU RANGEMENT ARRÊTE TOUT : pas de carte pour une partie qu'on n'a pas su ranger. */
  it('🔴 rangement refusé ⇒ aucune carte, et le motif est rendu tel quel', async () => {
    poserCategorieMock.mockResolvedValue({ ok: false, motif: 'Adresse illisible.' });
    const r = await POST(poste(BASE));
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toBe('Adresse illisible.');
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 UN ÉCHEC DE LA **CARTE** NE DÉFAIT PAS LE RANGEMENT, et il est DIT. Les deux tables sont indépendantes,
   * et le rangement est ce qui compte : rendre une erreur sèche aurait laissé croire que rien n'a été fait alors
   * que la partie a bien changé de groupe — et l'on aurait recommencé, en double.
   */
  it('🔴🔴 carte refusée ⇒ le rangement tient, et le refus de la carte est rendu', async () => {
    poserCarteMock.mockResolvedValue({ ok: false, motif: 'Sans la migration 304, aucune carte.' });
    const r = await POST(poste(BASE));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.etat).toBe('ok');
    expect(d.carteRefusee).toBe('Sans la migration 304, aucune carte.');
  });

  /** ⚠️ UNE PANNE DE BASE EST UNE PANNE, et elle ne se lit pas « rangé ». */
  it('⚠️ la base ne répond pas ⇒ 503, et on le dit', async () => {
    poserCategorieMock.mockRejectedValue(new Error('pg down'));
    const r = await POST(poste(BASE));
    expect(r.status).toBe(503);
    expect((await r.json()).motif).toContain('n’a pas répondu');
  });
});

describe('⚠️ la lecture n’a pas bougé', () => {
  /** La route sert les deux : le GET du lot précédent reste ce qu'il était, au caractère près. */
  it('⚠️ le GET lit toujours les deux dépôts en parallèle', async () => {
    const r = await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-155'));
    expect(r.status).toBe(200);
    expect(categoriesMock.mock.calls[0][0]).toBe('155');
    expect(cartesMock.mock.calls[0][0]).toBe('155');
  });
});
