import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const gestes = { classerSansSuite: vi.fn(), rouvrir: vi.fn() };
vi.mock('../../../../../../../lib/gestion/gestes', () => ({
  classerSansSuite: (...a: unknown[]) => gestes.classerSansSuite(...a),
  rouvrir: (...a: unknown[]) => gestes.rouvrir(...a),
}));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'arno' }) }));

import { DELETE, POST } from './route';

/** LOT 4b — classer sans suite, et rouvrir. Le second existe pour que le premier ne soit pas une suppression déguisée. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps?: unknown) => new Request('http://local/x', {
  method: 'POST', ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
});

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  gestes.classerSansSuite.mockReset(); gestes.classerSansSuite.mockResolvedValue({ ok: true });
  gestes.rouvrir.mockReset(); gestes.rouvrir.mockResolvedValue({ ok: true });
});

describe('classer sans suite', () => {
  it('exige un compte actif ayant le droit « gestion »', async () => {
    await POST(req({}), ctx('5'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('le motif est FACULTATIF — exiger une justification ferait qu’on n’écarterait plus rien', async () => {
    await POST(new Request('http://local/x', { method: 'POST' }), ctx('5')); // aucun corps du tout
    expect(gestes.classerSansSuite.mock.calls[0]).toEqual([5, { id: 1, libelle: 'arno' }, undefined]);
  });

  it('…mais il est transmis quand il est donné', async () => {
    await POST(req({ motif: 'facture pour information' }), ctx('5'));
    expect(gestes.classerSansSuite.mock.calls[0][2]).toBe('facture pour information');
  });

  it('déjà classé → 409 avec le motif lisible', async () => {
    gestes.classerSansSuite.mockResolvedValue({ ok: false, motif: 'Cet échange est déjà classé sans suite, ou n’existe pas.' });
    expect((await POST(req({}), ctx('5'))).status).toBe(409);
  });

  it('identifiant absurde → 400, sans toucher à la base', async () => {
    expect((await POST(req({}), ctx('abc'))).status).toBe(400);
    expect(gestes.classerSansSuite).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais un faux succès', async () => {
    gestes.classerSansSuite.mockRejectedValue(new Error('base indisponible'));
    expect((await POST(req({}), ctx('5'))).status).toBe(503);
  });
});

describe('rouvrir — la contrepartie, sans laquelle « classer » serait une suppression', () => {
  it('rouvre l’échange, avec son auteur', async () => {
    expect(await (await DELETE(req(), ctx('5'))).json()).toEqual({ ok: true });
    expect(gestes.rouvrir.mock.calls[0]).toEqual([5, { id: 1, libelle: 'arno' }]);
  });

  it('pas classé → 409', async () => {
    gestes.rouvrir.mockResolvedValue({ ok: false, motif: 'Cet échange n’est pas classé sans suite.' });
    expect((await DELETE(req(), ctx('5'))).status).toBe(409);
  });

  it('refus de la garde → aucun geste', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await DELETE(req(), ctx('5'))).status).toBe(403);
    expect(gestes.rouvrir).not.toHaveBeenCalled();
  });
});
