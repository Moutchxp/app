import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — les routes de l'annuaire des syndics : la saisie est re-validée par le
 * serveur, l'auteur vient de la session, et la création comme la modification passent par la MÊME porte.
 */
const enregistrerSyndic = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 7, libelle: 'arno' })) }));
vi.mock('../../../../../lib/gestion/syndicRepo', () => ({
  syndicsDisponibles: vi.fn(async () => true),
  listerSyndics: vi.fn(async () => [
    { id: 1, nom: 'Citya', email: null, telephone: null, nbCoproprietes: 2, nbBiens: 5, cherchable: 'citya citya com' },
    { id: 2, nom: 'Foncia', email: null, telephone: null, nbCoproprietes: 1, nbBiens: 1, cherchable: 'foncia' },
  ]),
  enregistrerSyndic: (...a: unknown[]) => enregistrerSyndic(...a),
  ficheSyndic: vi.fn(async (id: number) => (id === 1 ? { id: 1, nom: 'Citya' } : null)),
  immeublesConnus: vi.fn(async () => []),
}));

const requete = (url: string, corps?: unknown, methode = 'POST'): Request =>
  new Request(`http://localhost${url}`, corps === undefined ? {} : { method: methode, body: JSON.stringify(corps) });

describe('/api/admin/gestion/syndics', () => {
  beforeEach(() => { enregistrerSyndic.mockReset(); enregistrerSyndic.mockResolvedValue({ ok: true, id: 11 }); });

  it('GET filtre par nom / domaine', async () => {
    const { GET } = await import('./route');
    const j = await (await GET(requete('/api/admin/gestion/syndics?q=citya.com'))).json();
    expect(j.syndics.map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it('POST sans nom : refusé (422), rien n\'est écrit', async () => {
    const { POST } = await import('./route');
    const r = await POST(requete('/api/admin/gestion/syndics', { nom: ' ' }));
    expect(r.status).toBe(422);
    expect(enregistrerSyndic).not.toHaveBeenCalled();
  });

  it('POST valide : création par la seule porte, avec l\'auteur de la SESSION', async () => {
    const { POST } = await import('./route');
    const r = await POST(requete('/api/admin/gestion/syndics', { nom: 'Cabinet TEST', immeubles: ['12 rue X'], auteur: 'pirate' }));
    expect(await r.json()).toEqual({ ok: true, id: 11 });
    expect(enregistrerSyndic.mock.calls[0][0]).toBeNull();
    expect(enregistrerSyndic.mock.calls[0][1]).toMatchObject({ nom: 'Cabinet TEST', immeubles: ['12 rue X'] });
    expect(enregistrerSyndic.mock.calls[0][2]).toEqual({ id: 7, libelle: 'arno' });
  });

  it('PUT /[id] : modification par la même porte ; GET /[id] inconnu → 404', async () => {
    const { PUT, GET } = await import('./[id]/route');
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    await PUT(requete('/api/admin/gestion/syndics/11', { nom: 'Cabinet TEST' }, 'PUT'), params('11'));
    expect(enregistrerSyndic.mock.calls[0][0]).toBe(11);
    expect((await GET(requete('/api/admin/gestion/syndics/5'), params('5'))).status).toBe(404);
    expect((await GET(requete('/api/admin/gestion/syndics/abc'), params('abc'))).status).toBe(422);
  });
});
