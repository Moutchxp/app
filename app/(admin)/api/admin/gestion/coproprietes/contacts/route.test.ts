import { describe, expect, it, vi } from 'vitest';

/** LOT COPRO-CONTACTS-IMMEUBLE — la route de LECTURE du carnet d'un immeuble. */
const contactsDeLImmeuble = vi.fn(async () => [{ id: 1, categorie: 'gardien' }]);
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../../lib/gestion/contactsImmeubleRepo', () => ({ contactsDeLImmeuble: (...a: unknown[]) => contactsDeLImmeuble(...(a as [])) }));

describe('/api/admin/gestion/coproprietes/contacts', () => {
  it('GET ?immeuble= : le carnet ; sans immeuble : 422 ; base muette : 503', async () => {
    const { GET } = await import('./route');
    const r = await GET(new Request('http://localhost/api/admin/gestion/coproprietes/contacts?immeuble=12%20rue%20X'));
    expect(await r.json()).toEqual({ etat: 'ok', contacts: [{ id: 1, categorie: 'gardien' }] });
    expect(contactsDeLImmeuble).toHaveBeenCalledWith('12 rue X');
    expect((await GET(new Request('http://localhost/api/admin/gestion/coproprietes/contacts?immeuble=%20'))).status).toBe(422);
    contactsDeLImmeuble.mockRejectedValueOnce(new Error('panne'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await GET(new Request('http://localhost/api/admin/gestion/coproprietes/contacts?immeuble=x'))).status).toBe(503);
  });
});
