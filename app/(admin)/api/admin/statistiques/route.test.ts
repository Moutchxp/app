import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn() }));
vi.mock('../../../../lib/analytics/lecture/metriques', () => ({ statistiques: vi.fn() }));

import * as route from './route';
import { exigerCompteActif } from '../../../../lib/admin/garde';
import { statistiques } from '../../../../lib/analytics/lecture/metriques';

const garde = exigerCompteActif as unknown as ReturnType<typeof vi.fn>;
const stats = statistiques as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => new Request(`http://test/api/admin/statistiques${qs}`);
const OK = '?debut=2026-01-01&fin=2026-01-31&grain=jour';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/admin/statistiques — permission serveur', () => {
  it('sans perm_statistiques → 403 (le refus de exigerCompteActif est renvoyé tel quel)', async () => {
    garde.mockResolvedValueOnce(Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 }));
    const res = await route.GET(req(OK));
    expect(res.status).toBe(403);
    expect(stats).not.toHaveBeenCalled(); // aucune lecture si non autorisé
  });

  it('avec perm (null) + fenêtre valide → 200 et statistiques appelées (sans commune → 2e arg null)', async () => {
    garde.mockResolvedValueOnce(null);
    stats.mockResolvedValueOnce({ ok: true, fenetre: { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' }, k: 11 });
    const res = await route.GET(req(OK));
    expect(res.status).toBe(200);
    expect(stats).toHaveBeenCalledWith({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' }, null);
  });
});

describe('GET — filtre commune (Lot 6)', () => {
  it('commune INSEE valide → transmise à la lecture (scope k-safe côté serveur)', async () => {
    garde.mockResolvedValueOnce(null);
    stats.mockResolvedValueOnce({ ok: true });
    const res = await route.GET(req(`${OK}&commune=92004`));
    expect(res.status).toBe(200);
    expect(stats).toHaveBeenCalledWith({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' }, '92004');
  });

  it('commune malformée → 400, sans lecture (jamais devinée ni injectée)', async () => {
    garde.mockResolvedValue(null);
    for (const bad of ['abc', '9200', '9200456', '92004; DROP', '']) {
      const res = await route.GET(req(`${OK}&commune=${encodeURIComponent(bad)}`));
      expect(res.status).toBe(400);
    }
    expect(stats).not.toHaveBeenCalled();
  });
});

describe('GET — filtrage carte CLIENT-only (Chantier B, post-revue adverse)', () => {
  it('les params de filtre géo (verdict/score/departement) sont IGNORÉS côté serveur → 200, jamais transmis à la lecture', async () => {
    // Le filtrage carte est client (anti-différenciation) : le serveur ne connaît que fenêtre + commune. Des query
    // params de filtre superflus sont ignorés (pas d'erreur, pas de vue serveur filtrée).
    garde.mockResolvedValueOnce(null);
    stats.mockResolvedValueOnce({ ok: true });
    const res = await route.GET(req(`${OK}&verdict=SANS_VIS_A_VIS&score=eleve&departement=92`));
    expect(res.status).toBe(200);
    expect(stats).toHaveBeenCalledWith({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' }, null); // AUCUN 3e arg de filtre
  });
});

describe('GET — validation de la fenêtre', () => {
  it('fenêtre invalide → 400, sans lecture', async () => {
    garde.mockResolvedValue(null);
    for (const qs of ['?debut=hier&fin=2026-01-31&grain=jour', '?debut=2026-02-01&fin=2026-01-01&grain=jour', '?debut=2026-01-01&fin=2026-01-02&grain=heure']) {
      const res = await route.GET(req(qs));
      expect(res.status).toBe(400);
    }
    expect(stats).not.toHaveBeenCalled();
  });
});

describe('GET — erreur base maîtrisée', () => {
  it('statistiques throw → 503, jamais de fuite de détail', async () => {
    garde.mockResolvedValueOnce(null);
    stats.mockRejectedValueOnce(new Error('DB down'));
    const res = await route.GET(req(OK));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'statistiques indisponibles' });
  });
});

describe('LECTURE SEULE — seule la méthode GET est exportée', () => {
  it('aucune méthode mutante (POST/PUT/PATCH/DELETE) n’existe', () => {
    expect(typeof route.GET).toBe('function');
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((route as Record<string, unknown>)[m]).toBeUndefined();
    }
  });
});
