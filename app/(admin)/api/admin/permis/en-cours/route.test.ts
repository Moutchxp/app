import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T6-A — GET /api/admin/permis/en-cours : mince lecture qui DÉLÈGUE à la SOURCE UNIQUE `chargerDemandesSuivi`. On mocke la garde
 * + le chargeur : on teste le COMPORTEMENT de la route (garde admin, délégation, 503 non muet), pas la logique métier (testée dans
 * reponsesSuivi).
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/veille/reponsesSuivi', () => ({ chargerDemandesSuivi: vi.fn() }));

import { GET } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerDemandesSuivi } from '../../../../../lib/veille/reponsesSuivi';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const charger = chargerDemandesSuivi as unknown as ReturnType<typeof vi.fn>;
const req = () => new Request('http://test/api/admin/permis/en-cours');

beforeEach(() => { vi.clearAllMocks(); garde.mockResolvedValue({ auteurId: 5 }); });

describe('T6-A — GET /api/admin/permis/en-cours', () => {
  it('administrateur → 200, renvoie la donnée de la SOURCE UNIQUE (chargerDemandesSuivi)', async () => {
    charger.mockResolvedValueOnce({ demandes: [{ demandeId: 1 }], derniereOkLe: null, reglages: { fraicheurHeures: 48, alerteJours: 7 } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ demandes: [{ demandeId: 1 }], reglages: { alerteJours: 7 } });
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('non-administrateur → 403 renvoyé tel quel, aucune lecture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(charger).not.toHaveBeenCalled();
  });

  it('erreur de lecture → 503 (jamais un catch muet)', async () => {
    charger.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});
