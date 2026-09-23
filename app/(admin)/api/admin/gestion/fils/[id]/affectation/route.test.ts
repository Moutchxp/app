import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const gestes = { affecter: vi.fn(), detacher: vi.fn(), preremplir: vi.fn() };
vi.mock('../../../../../../../lib/gestion/gestes', () => ({
  affecter: (...a: unknown[]) => gestes.affecter(...a),
  detacher: (...a: unknown[]) => gestes.detacher(...a),
  preremplir: (...a: unknown[]) => gestes.preremplir(...a),
}));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'arno' }) }));

import { DELETE, GET, POST } from './route';

/**
 * LOT 4b — la route des affectations. Deux verbes SYMÉTRIQUES : ce qui se fait d'un clic se défait d'un clic. Ce fichier
 * teste le CONTRAT (qui passe, quoi est transmis, ce qui est rendu) ; la garde a ses tests, le proxy les siens, les
 * gestes les leurs.
 */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps?: unknown) => new Request('http://local/x', {
  method: 'POST', ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
});

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  for (const f of Object.values(gestes)) f.mockReset();
  gestes.affecter.mockResolvedValue({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
  gestes.detacher.mockResolvedValue({ ok: true, evenementId: 9 });
  gestes.preremplir.mockResolvedValue(null);
});

describe('la garde d’écriture, sur les TROIS verbes', () => {
  it('exige un compte actif ayant le droit « gestion »', async () => {
    for (const appel of [() => GET(req(), ctx('5')), () => POST(req({ evenementId: 9 }), ctx('5')), () => DELETE(req(), ctx('5'))]) {
      gardeMock.mockClear();
      await appel();
      expect(gardeMock.mock.calls[0][1]).toBe('gestion');
    }
  });

  it('refusée → la réponse du refus est rendue telle quelle, et AUCUN geste n’est exécuté', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(req({ evenementId: 9 }), ctx('5'))).status).toBe(403);
    expect((await DELETE(req(), ctx('5'))).status).toBe(403);
    expect(gestes.affecter).not.toHaveBeenCalled();
    expect(gestes.detacher).not.toHaveBeenCalled();
  });
});

describe('rattacher', () => {
  it('à un événement existant → transmet l’identifiant, et rend la référence', async () => {
    const res = await POST(req({ evenementId: 9 }), ctx('5'));
    expect(gestes.affecter.mock.calls[0][0]).toBe(5);
    expect(gestes.affecter.mock.calls[0][1]).toEqual({ evenementId: 9, nouveau: undefined });
    expect(await res.json()).toEqual({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
  });

  it('à un NOUVEL événement → transmet les champs saisis', async () => {
    await POST(req({ nouveau: { objet: 'Fuite', demandeurNom: 'Mme M.' } }), ctx('5'));
    expect(gestes.affecter.mock.calls[0][1]).toMatchObject({ nouveau: { objet: 'Fuite', demandeurNom: 'Mme M.' } });
  });

  it('l’auteur du geste est transmis — un journal sans auteur ne servirait à rien', async () => {
    await POST(req({ evenementId: 9 }), ctx('5'));
    expect(gestes.affecter.mock.calls[0][2]).toEqual({ id: 1, libelle: 'arno' });
  });

  it('identifiant d’échange absurde → refus PROPRE, jamais un NaN jusqu’à la base', async () => {
    for (const mauvais of ['abc', '-1', '0', '1.5']) {
      const res = await POST(req({ evenementId: 9 }), ctx(mauvais));
      expect(res.status).toBe(400);
    }
    expect(gestes.affecter).not.toHaveBeenCalled();
  });

  it('corps illisible → 422, sans toucher à la base', async () => {
    const res = await POST(new Request('http://local/x', { method: 'POST', body: 'pas du json' }), ctx('5'));
    expect(res.status).toBe(422);
    expect(gestes.affecter).not.toHaveBeenCalled();
  });

  it('refus métier (déjà rattaché, cible inconnue) → 409 avec le motif LISIBLE', async () => {
    gestes.affecter.mockResolvedValue({ ok: false, motif: 'Cet échange est déjà rattaché à cet événement.' });
    const res = await POST(req({ evenementId: 9 }), ctx('5'));
    expect(res.status).toBe(409);
    expect((await res.json() as { erreur: string }).erreur).toContain('déjà rattaché');
  });

  it('panne → 503 explicite, jamais un faux succès', async () => {
    gestes.affecter.mockRejectedValue(new Error('base indisponible'));
    expect((await POST(req({ evenementId: 9 }), ctx('5'))).status).toBe(503);
  });
});

describe('détacher — la réversibilité est un verbe à part entière', () => {
  it('appelle le geste avec l’échange et l’auteur, et rend ok', async () => {
    const res = await DELETE(req(), ctx('5'));
    expect(gestes.detacher.mock.calls[0][0]).toBe(5);
    expect(gestes.detacher.mock.calls[0][1]).toEqual({ id: 1, libelle: 'arno' });
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rien à détacher → 409, jamais un succès trompeur', async () => {
    gestes.detacher.mockResolvedValue({ ok: false, motif: 'Cet échange n’est rattaché à aucun événement.' });
    expect((await DELETE(req(), ctx('5'))).status).toBe(409);
  });
});

describe('le pré-remplissage (GET)', () => {
  it('rend ce que l’échange contient', async () => {
    gestes.preremplir.mockResolvedValue({ objet: 'Fuite', demandeurNom: 'Mme M.', demandeurEmail: null, adresseLibre: null });
    const body = await (await GET(req(), ctx('5'))).json() as { propositions: unknown };
    expect(body.propositions).toMatchObject({ objet: 'Fuite' });
  });

  /**
   * LOT 4d — il ne rend PLUS la liste des événements. Le sélecteur est passé à la recherche partagée, qui cherche
   * aussi par expéditeur et borne ses résultats ; la liste tronquée à 50 qui vivait ici était inutilisable dès la
   * vingtième carte, et coûtait une requête à chaque ouverture du panneau.
   */
  it('ne rend plus de LISTE d’événements — la recherche partagée s’en charge', async () => {
    gestes.preremplir.mockResolvedValue(null);
    const body = await (await GET(req(), ctx('5'))).json() as { evenements?: unknown };
    expect(body.evenements).toBeUndefined();
  });
});
