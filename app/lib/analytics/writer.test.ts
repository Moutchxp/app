import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock du POOL DÉDIÉ : aucune vraie connexion, aucun DATABASE_URL requis. On contrôle le comportement
// de `queryAnalytics` (résout / rejette / traîne) pour prouver que le writer ne remonte JAMAIS d'erreur.
const queryAnalyticsMock = vi.fn();
vi.mock('./pool', () => ({
  queryAnalytics: (...a: unknown[]) => queryAnalyticsMock(...a),
  poolAnalytics: {},
  fermerPoolAnalytics: vi.fn(),
}));

import { incrementerCompteur, jourParis, type EvenementCompteur } from './writer';
import { ECRITURE_TIMEOUT_MS } from './config';

const EV: EvenementCompteur = { nom: 'resultat', verdict: 'SANS_VIS_A_VIS', scoreTranche: 3, communeInsee: '92004' };

beforeEach(() => {
  queryAnalyticsMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('jourParis', () => {
  it('formate YYYY-MM-DD au fuseau Europe/Paris (aucune seconde)', () => {
    // 31 déc. 2025 23:30 UTC = 1er janv. 2026 00:30 à Paris → le jour parisien est 2026-01-01.
    expect(jourParis(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(jourParis())).toBe(true);
  });
});

describe('incrementerCompteur — UPSERT correct', () => {
  it('émet un INSERT … ON CONFLICT DO UPDATE n = n + 1 avec le jour Paris en 1er paramètre', async () => {
    queryAnalyticsMock.mockResolvedValue({ rows: [] });
    await incrementerCompteur(EV);
    expect(queryAnalyticsMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryAnalyticsMock.mock.calls[0] as [string, unknown[]];
    expect(/insert into analytics_compteur_jour/i.test(sql)).toBe(true);
    expect(/on conflict on constraint analytics_compteur_jour_dims_uniq/i.test(sql)).toBe(true);
    expect(/do update set n = analytics_compteur_jour\.n \+ 1/i.test(sql)).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(String(params[0]))).toBe(true); // jour_paris
    expect(params[1]).toBe('resultat'); // nom
    expect(params[2]).toBe('SANS_VIS_A_VIS'); // verdict
    expect(params[13]).toBe(undefined); // pas de 14e paramètre : `n` = 1 est en dur dans le VALUES
  });
});

describe("incrementerCompteur — NE THROW JAMAIS vers l'appelant (contrat de sûreté)", () => {
  it('une écriture qui REJETTE est avalée (résout void, log console)', async () => {
    queryAnalyticsMock.mockRejectedValue(new Error('base en panne'));
    await expect(incrementerCompteur(EV)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('un rejet SYNCHRONE de queryAnalytics est avalé', async () => {
    queryAnalyticsMock.mockImplementation(() => {
      throw new Error('throw synchrone');
    });
    await expect(incrementerCompteur(EV)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('une écriture qui TRAÎNE est ABANDONNÉE au timeout, sans bloquer', async () => {
    vi.useFakeTimers();
    queryAnalyticsMock.mockReturnValue(new Promise(() => {})); // ne se résout jamais
    const p = incrementerCompteur(EV);
    // Avance au-delà du timeout dur : la course rejette, le writer avale.
    await vi.advanceTimersByTimeAsync(ECRITURE_TIMEOUT_MS + 50);
    await expect(p).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
