import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn() }));
vi.mock('../../../../../lib/analytics/lecture/geo', () => ({ refCommunes: vi.fn() }));

import * as route from './route';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { refCommunes } from '../../../../../lib/analytics/lecture/geo';

const garde = exigerCompteActif as unknown as ReturnType<typeof vi.fn>;
const ref = refCommunes as unknown as ReturnType<typeof vi.fn>;
const req = () => new Request('http://test/api/admin/geo/communes');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/admin/geo/communes — référentiel cartographique (Lot 6)', () => {
  it('sans perm_statistiques → 403 ; le référentiel n’est JAMAIS dérivé', async () => {
    garde.mockResolvedValueOnce(Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 }));
    const res = await route.GET(req());
    expect(res.status).toBe(403);
    expect(ref).not.toHaveBeenCalled();
  });

  it('avec perm → 200 : renvoie le référentiel PUR (nom + centroïde), aucun compteur ni trafic', async () => {
    garde.mockResolvedValueOnce(null);
    ref.mockResolvedValueOnce({ '92004': { nom: 'Asnières-sur-Seine', centroid: [2.28, 48.91] } });
    const res = await route.GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, { nom: string; centroid: [number, number] }>;
    expect(body['92004']).toEqual({ nom: 'Asnières-sur-Seine', centroid: [2.28, 48.91] });
    // Corps = référentiel VERBATIM : aucune clé de compteur/visite/verdict (pure géo, hors k).
    for (const interdit of ['n', 'visites', 'verdict', 'total']) {
      expect(Object.keys(body['92004']).includes(interdit), `aucune clé « ${interdit} »`).toBe(false);
    }
  });

  it('dérivation en échec → 503 maîtrisé, jamais de fuite de détail', async () => {
    garde.mockResolvedValueOnce(null);
    ref.mockRejectedValueOnce(new Error('DB down'));
    const res = await route.GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'référentiel communes indisponible' });
  });

  it('LECTURE SEULE — seule GET exportée (aucune méthode mutante)', () => {
    expect(typeof route.GET).toBe('function');
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((route as Record<string, unknown>)[m]).toBeUndefined();
    }
  });
});
