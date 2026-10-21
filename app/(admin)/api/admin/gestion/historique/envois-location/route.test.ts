import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const garde = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => garde(...a) }));
const envois = vi.fn();
vi.mock('../../../../../../lib/location/mailNouvelleLocationRepo', () => ({ envoisDuBien: (...a: unknown[]) => envois(...a) }));
const { GET } = await import('./route');

/** 🔴 Arno (21/10/2026) — les envois « Nouvelle location » d'un bien, pour son Historique : au droit Gestion, lecture seule. */
describe('/api/admin/gestion/historique/envois-location', () => {
  beforeEach(() => { garde.mockReset().mockResolvedValue(null); envois.mockReset().mockResolvedValue([{ id: 1 }]); });
  it('au droit « Gestion » : la liste du bien', async () => {
    const r = await GET(new Request('http://x/api/admin/gestion/historique/envois-location?lot=7'));
    expect(await r.json()).toEqual({ etat: 'ok', envois: [{ id: 1 }] });
    expect(garde.mock.calls[0][1]).toBe('gestion');
    expect(envois).toHaveBeenCalledWith(7);
  });
  it('sans le droit : refus, rien n’est lu ; un bien illisible : 400', async () => {
    garde.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://x/api/admin/gestion/historique/envois-location?lot=7'))).status).toBe(403);
    garde.mockResolvedValue(null);
    expect((await GET(new Request('http://x/api/admin/gestion/historique/envois-location?lot=abc'))).status).toBe(400);
    expect(envois).not.toHaveBeenCalled();
  });
});
