import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const garde = vi.fn();
vi.mock('../../../../../lib/location/garde', () => ({ exigerLocation: (r: Request) => garde(r) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
const apercu = vi.fn();
const envoyer = vi.fn();
const baux = vi.fn();
vi.mock('../../../../../lib/location/mailNouvelleLocationRepo', () => ({
  apercuNouvelleLocation: (...a: unknown[]) => apercu(...a), envoyerNouvelleLocation: (...a: unknown[]) => envoyer(...a),
  bauxEnCoursDuLocataire: (...a: unknown[]) => baux(...a),
}));
const { GET, POST } = await import('./route');

/** 🔴 Arno (21/10/2026) — la route du mail « Nouvelle location » : gardée, et SEUL le POST envoie. */
describe('/api/admin/location/nouvelle-location', () => {
  beforeEach(() => {
    garde.mockReset().mockResolvedValue({ auteurId: 2 });
    apercu.mockReset().mockResolvedValue({ bailId: 536, objet: 'o' });
    envoyer.mockReset().mockResolvedValue({ etat: 'ok', data: { n: 4 } });
    baux.mockReset().mockResolvedValue([]);
  });

  it('sans le droit Location : refus, rien n’est lu ni envoyé', async () => {
    garde.mockResolvedValue({ refus: new Response(null, { status: 403 }) });
    expect((await GET(new Request('http://x/api/admin/location/nouvelle-location?bail=536'))).status).toBe(403);
    expect((await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ bailId: 536, destinataires: [] }) }))).status).toBe(403);
    expect(apercu).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('GET ?bail= : l’aperçu, pour la personne connectée — AUCUN envoi', async () => {
    const r = await GET(new Request('http://x/api/admin/location/nouvelle-location?bail=536'));
    expect(await r.json()).toEqual({ etat: 'ok', data: { bailId: 536, objet: 'o' } });
    expect(apercu).toHaveBeenCalledWith(536, { id: 2, libelle: 'a.jorel@sansvisavis.com' });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('GET ?locataire= : ses baux en cours', async () => {
    await GET(new Request('http://x/api/admin/location/nouvelle-location?locataire=524'));
    expect(baux).toHaveBeenCalledWith(524);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('POST : envoie la liste CONFIRMÉE, au nom de la personne connectée (le journal dira qui)', async () => {
    const liste = [{ adresse: 'laura@monga.io', libelle: 'MONGA' }];
    const r = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ bailId: 536, destinataires: liste }) }));
    expect(await r.json()).toEqual({ etat: 'ok', data: { n: 4 } });
    expect(envoyer).toHaveBeenCalledWith(536, liste, { id: 2, libelle: 'a.jorel@sansvisavis.com' });
  });

  it('POST sans bail ou illisible : refus, rien n’est envoyé', async () => {
    expect((await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ destinataires: [] }) }))).status).toBe(400);
    expect((await POST(new Request('http://x', { method: 'POST', body: '{' }))).status).toBe(400);
    expect(envoyer).not.toHaveBeenCalled();
  });
});
