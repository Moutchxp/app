import { describe, expect, it, vi } from 'vitest';

/** LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE — la route de LECTURE des adresses d'une même parcelle. */
const adressesDeLaParcelle = vi.fn(async () => ({ parcelles: ['P'], adresses: [{ cle: '17 rue x', libelle: '17 Rue X', codePostal: '92400', commune: 'Courbevoie', parcelle: 'P' }] }));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../../lib/gestion/parcelleRepo', () => ({ adressesDeLaParcelle: (...a: unknown[]) => adressesDeLaParcelle(...(a as [])) }));

describe('/api/admin/gestion/coproprietes/parcelle', () => {
  it('GET ?a=[…] : les adresses relues et bornées ; JSON illisible : 422 ; base muette : 503', async () => {
    const { GET } = await import('./route');
    const a = encodeURIComponent(JSON.stringify([{ libelle: '15 rue X', codePostal: '92400', commune: 'Courbevoie', pirate: 1 }, 'n’importe quoi']));
    const r = await GET(new Request(`http://localhost/api/admin/gestion/coproprietes/parcelle?a=${a}`));
    expect((await r.json()).adresses[0].libelle).toBe('17 Rue X');
    expect(adressesDeLaParcelle).toHaveBeenCalledWith([{ libelle: '15 rue X', codePostal: '92400', commune: 'Courbevoie' }]);
    expect((await GET(new Request('http://localhost/api/admin/gestion/coproprietes/parcelle?a=%7B'))).status).toBe(422);
    adressesDeLaParcelle.mockRejectedValueOnce(new Error('panne'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await GET(new Request('http://localhost/api/admin/gestion/coproprietes/parcelle?a=%5B%5D'))).status).toBe(503);
  });
});
