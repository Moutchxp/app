import { describe, expect, it, vi } from 'vitest';

/** LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — « Vérifié, pas d'erreur », avec l'auteur de la SESSION. */
const verifierConflit = vi.fn(async () => ({ ok: true }));
vi.mock('../../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 7, libelle: 'arno' })) }));
vi.mock('../../../../../../../../lib/gestion/syndicRepo', () => ({ verifierConflit: (...a: unknown[]) => verifierConflit(...(a as [])) }));

describe('/api/admin/gestion/coproprietes/conflits/[id]/verifier', () => {
  it('POST : identifiant valide ⇒ vérifié avec l’auteur de la session ; inconnu ⇒ 404 ; illisible ⇒ 422', async () => {
    const { POST } = await import('./route');
    const p = (id: string) => ({ params: Promise.resolve({ id }) });
    const r = await POST(new Request('http://localhost/x', { method: 'POST' }), p('5'));
    expect(await r.json()).toEqual({ ok: true });
    expect(verifierConflit).toHaveBeenCalledWith(5, { id: 7, libelle: 'arno' });
    verifierConflit.mockResolvedValueOnce({ ok: false, motif: 'non' } as never);
    expect((await POST(new Request('http://localhost/x', { method: 'POST' }), p('5'))).status).toBe(404);
    expect((await POST(new Request('http://localhost/x', { method: 'POST' }), p('abc'))).status).toBe(422);
  });
});
