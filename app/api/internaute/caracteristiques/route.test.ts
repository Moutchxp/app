import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 🔴 LOT REPRISE-CARACTERISTIQUES — GET /api/internaute/caracteristiques : la reprise d'un internaute CONNECTÉ, scopée par
 * l'id de SESSION (jamais un id lu dans la requête) ; non connecté → { connecte: false } ; erreur → champs vides.
 */
const { exigerInternaute, query } = vi.hoisted(() => ({ exigerInternaute: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../lib/db/client', () => ({ query }));

import { GET } from './route';

const req = (q: string) => new Request(`http://localhost/api/internaute/caracteristiques?${q}&internaute=uuid-autre`);
const ligne = (ban: string | null, adresse: string, typeBien: string, le: string) => ({
  payload: { typeBien, surface: '60', nbPieces: 3, epoque: 'Inconnu', terrasse: false, balcon: true, jardin: false, ...(ban ? { cleAdresseBan: ban } : {}) },
  adresse_normalisee: adresse, cree_a: new Date(le),
});

describe('GET /api/internaute/caracteristiques', () => {
  beforeEach(() => { exigerInternaute.mockReset(); query.mockReset(); });

  it('connecté : la demande la plus récente À LA MÊME ADRESSE, lue pour l’id de SESSION', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-session' });
    query.mockResolvedValue({ rows: [
      ligne('BAN-B', '3 avenue B', 'Maison', '2026-10-17T07:00:00Z'),
      ligne('BAN-A', '12 rue A', 'Duplex', '2026-10-16T07:00:00Z'),
      ligne(null, '12, Rue A', 'Appartement', '2026-10-15T07:00:00Z'),
    ] });
    const res = await GET(req('ban=BAN-A&adresse=12%20rue%20A'));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const d = await res.json();
    expect(d).toMatchObject({ connecte: true, reprise: { caracteristiques: { typeBien: 'Duplex' }, le: '2026-10-16T07:00:00.000Z' } });
    expect(query.mock.calls[0][1]).toEqual(['uuid-session']); // jamais « uuid-autre » de la requête
  });

  it('🔴 internaute différent : seules SES demandes sont lues → aucune à cette adresse → champs vides', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-autre-personne' });
    query.mockResolvedValue({ rows: [] }); // la base ne rend que les projets de l'id lié
    expect(await (await GET(req('ban=BAN-A&adresse=12%20rue%20A'))).json()).toEqual({ connecte: true, reprise: null });
    expect(query.mock.calls[0][1]).toEqual(['uuid-autre-personne']);
  });

  it('non connecté → { connecte: false }, aucune lecture', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({}, { status: 401 }) });
    expect(await (await GET(req('ban=BAN-A'))).json()).toEqual({ connecte: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('erreur de lecture → connecté, reprise nulle (champs vides)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-session' });
    query.mockRejectedValue(new Error('db down'));
    expect(await (await GET(req('ban=BAN-A'))).json()).toEqual({ connecte: true, reprise: null });
  });
});
