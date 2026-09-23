import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const gestes = { deplacerMessage: vi.fn(), remettreMessage: vi.fn() };
vi.mock('../../../../../../../lib/gestion/gestes', () => ({
  deplacerMessage: (...a: unknown[]) => gestes.deplacerMessage(...a),
  remettreMessage: (...a: unknown[]) => gestes.remettreMessage(...a),
}));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'arno' }) }));
const migration234 = vi.fn(async () => true);
vi.mock('../../../../../../../lib/gestion/schema', () => ({ deplacementsDeMailsDisponibles: () => migration234() }));

import { DELETE, POST } from './route';

/** LOT 4d-B2 — déplacer UN mail, et le remettre. Deux verbes symétriques : ce qui se fait d'un clic se défait d'un clic. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps?: unknown) => new Request('http://local/x', {
  method: 'POST', ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
});

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  migration234.mockResolvedValue(true);
  gestes.deplacerMessage.mockReset(); gestes.deplacerMessage.mockResolvedValue({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
  gestes.remettreMessage.mockReset(); gestes.remettreMessage.mockResolvedValue({ ok: true, evenementId: 9 });
});

describe('la garde, sur les deux verbes', () => {
  it('exige un compte actif ayant le droit « gestion »', async () => {
    for (const appel of [() => POST(req({ evenementId: 9 }), ctx('3')), () => DELETE(req(), ctx('3'))]) {
      gardeMock.mockClear();
      await appel();
      expect(gardeMock.mock.calls[0][1]).toBe('gestion');
    }
  });

  it('refusée → aucun geste', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(req({ evenementId: 9 }), ctx('3'))).status).toBe(403);
    expect((await DELETE(req(), ctx('3'))).status).toBe(403);
    expect(gestes.deplacerMessage).not.toHaveBeenCalled();
    expect(gestes.remettreMessage).not.toHaveBeenCalled();
  });
});

describe('déplacer', () => {
  it('transmet le message, la destination et l’auteur, et rend la référence', async () => {
    const res = await POST(req({ evenementId: 9 }), ctx('3'));
    expect(gestes.deplacerMessage.mock.calls[0]).toEqual([3, 9, { id: 1, libelle: 'arno' }]);
    expect(await res.json()).toEqual({ ok: true, reference: 'GES-2026-000009', evenementId: 9 });
  });

  it('sans destination → 400, sans toucher la base', async () => {
    for (const mauvais of [{}, { evenementId: 0 }, { evenementId: -1 }, { evenementId: 'neuf' }]) {
      expect((await POST(req(mauvais), ctx('3'))).status).toBe(400);
    }
    expect(gestes.deplacerMessage).not.toHaveBeenCalled();
  });

  it('identifiant de message absurde → 400', async () => {
    expect((await POST(req({ evenementId: 9 }), ctx('abc'))).status).toBe(400);
    expect(gestes.deplacerMessage).not.toHaveBeenCalled();
  });

  it('corps illisible → 422', async () => {
    const res = await POST(new Request('http://local/x', { method: 'POST', body: 'pas du json' }), ctx('3'));
    expect(res.status).toBe(422);
  });

  it('refus métier → 409 avec le motif lisible', async () => {
    gestes.deplacerMessage.mockResolvedValue({ ok: false, motif: 'Ce mail est déjà rattaché à cet événement.' });
    const res = await POST(req({ evenementId: 9 }), ctx('3'));
    expect(res.status).toBe(409);
    expect((await res.json() as { erreur: string }).erreur).toContain('déjà rattaché');
  });

  /**
   * Les migrations sont livrées NON APPLIQUÉES : entre la livraison et son application, ce geste n'existe pas encore
   * en base. Mieux vaut le DIRE que laisser une requête échouer sur une colonne absente.
   */
  it('migration 234 pas encore appliquée → 503 EXPLICITE, et aucun geste tenté', async () => {
    migration234.mockResolvedValue(false);
    const res = await POST(req({ evenementId: 9 }), ctx('3'));
    expect(res.status).toBe(503);
    expect((await res.json() as { erreur: string }).erreur).toContain('234');
    expect(gestes.deplacerMessage).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais un faux succès', async () => {
    gestes.deplacerMessage.mockRejectedValue(new Error('base indisponible'));
    expect((await POST(req({ evenementId: 9 }), ctx('3'))).status).toBe(503);
  });
});

describe('remettre dans son échange — la contrepartie', () => {
  it('appelle le geste avec le message et l’auteur', async () => {
    expect(await (await DELETE(req(), ctx('3'))).json()).toEqual({ ok: true });
    expect(gestes.remettreMessage.mock.calls[0]).toEqual([3, { id: 1, libelle: 'arno' }]);
  });

  it('mail qui n’a pas bougé → 409', async () => {
    gestes.remettreMessage.mockResolvedValue({ ok: false, motif: 'Ce mail n’a pas été déplacé.' });
    expect((await DELETE(req(), ctx('3'))).status).toBe(409);
  });

  it('migration pas appliquée → 503 explicite', async () => {
    migration234.mockResolvedValue(false);
    expect((await DELETE(req(), ctx('3'))).status).toBe(503);
    expect(gestes.remettreMessage).not.toHaveBeenCalled();
  });
});
