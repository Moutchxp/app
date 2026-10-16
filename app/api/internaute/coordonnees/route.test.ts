import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GET /api/internaute/coordonnees — lecture SEULE des coordonnées connues de l'internaute CONNECTÉ. PROUVE : toujours 200,
 * non connecté → { connecte:false } sans aucune donnée, lecture scopée par l'id de SESSION, erreur → fail-closed, no-store.
 */
const { exigerInternaute, lireCoordonneesTunnel } = vi.hoisted(() => ({ exigerInternaute: vi.fn(), lireCoordonneesTunnel: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../lib/internaute/coordonneesTunnel', () => ({ lireCoordonneesTunnel }));

import { GET } from './route';

const req = () => new Request('http://localhost/api/internaute/coordonnees?id=uuid-autre');
const C = { prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: null, consentementsValables: [], derniereResidence: null };

describe('GET /api/internaute/coordonnees', () => {
  beforeEach(() => { exigerInternaute.mockReset(); lireCoordonneesTunnel.mockReset(); });

  it('connecté → 200, coordonnées lues pour l’id de SESSION (jamais celui de la requête), no-store', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-session' });
    lireCoordonneesTunnel.mockResolvedValue(C);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ connecte: true, ...C });
    expect(lireCoordonneesTunnel).toHaveBeenCalledWith('uuid-session');
  });

  it('non connecté → 200 { connecte: false }, aucune lecture', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({}, { status: 401 }) });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connecte: false });
    expect(lireCoordonneesTunnel).not.toHaveBeenCalled();
  });

  it('erreur de lecture → 200 { connecte: false } (le formulaire complet s’affiche, comme avant)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-session' });
    lireCoordonneesTunnel.mockRejectedValue(new Error('db down'));
    const res = await GET(req());
    expect(await res.json()).toEqual({ connecte: false });
  });
});
