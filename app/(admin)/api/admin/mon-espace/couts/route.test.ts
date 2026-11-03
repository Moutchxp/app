import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 « LES COÛTS » (Arno, 03/11/2026, lot C1) — la VRAIE route GET /api/admin/mon-espace/couts, dépôts simulés : un compte qui n'est pas associé
 * (ou pas administrateur : `peutVoirCouts`, relu en base) reçoit 403 et AUCUNE donnée ; un associé reçoit la lecture de « Coûts globaux »
 * (`lireDonneesGlobal`, sans les compromis en cours) ; sans droit « Mon espace » : le refus de la garde.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), voir: vi.fn(), lire: vi.fn() }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/mon-espace/compteRepo', () => ({ peutVoirCouts: h.voir }));
vi.mock('../../../../../lib/transaction/donneesGlobal', () => ({ lireDonneesGlobal: h.lire }));
import { GET } from './route';

const lire = async () => { const r = await GET(new Request('http://local/api/admin/mon-espace/couts')); return { status: r.status, corps: await r.json() as Record<string, unknown> }; };
beforeEach(() => {
  h.garde.mockReset().mockResolvedValue({ auteurId: 4 });
  h.voir.mockReset().mockResolvedValue(true);
  h.lire.mockReset().mockResolvedValue({ ventes: ['…'] });
});

describe('🔴 /api/admin/mon-espace/couts', () => {
  it('un associé : les données de « Coûts globaux », pour le compte de la session, sans les compromis', async () => {
    const r = await lire();
    expect(r.status).toBe(200);
    expect(r.corps).toEqual({ etat: 'ok', data: { ventes: ['…'] } });
    expect(h.voir).toHaveBeenCalledWith(4);
    expect(h.lire).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), { compromis: false });
  });
  it('pas associé (ou pas administrateur) : 403, rien n’est lu', async () => {
    h.voir.mockResolvedValue(false);
    const r = await lire();
    expect(r.status).toBe(403);
    expect(r.corps.data).toBeUndefined();
    expect(h.lire).not.toHaveBeenCalled();
  });
  it('sans le droit « Mon espace » : le refus de la garde, rien n’est lu', async () => {
    h.garde.mockResolvedValue({ refus: Response.json({ erreur: 'REFUS' }, { status: 403 }) });
    expect((await lire()).status).toBe(403);
    expect(h.voir).not.toHaveBeenCalled();
    expect(h.lire).not.toHaveBeenCalled();
  });
});
