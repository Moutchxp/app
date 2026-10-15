import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryAnalytics } = vi.hoisted(() => ({ queryAnalytics: vi.fn() }));
vi.mock('./pool', () => ({ queryAnalytics }));
vi.mock('server-only', () => ({}));

import { journaliserAnalyseSansLidar, type AnalyseSansLidar } from './sansLidar';

const EV: AnalyseSansLidar = {
  adresse: '1 rue de l’Essai 78140 Vélizy-Villacoublay', lat: 48.78132268116829, lon: 2.2205969595575814,
  xL93: 642685.2785637568, yL93: 6853606.124672878, dalle: '0642_6854', communeInsee: '78640',
};

beforeEach(() => { queryAnalytics.mockReset(); vi.restoreAllMocks(); });

describe('journaliserAnalyseSansLidar — best-effort, jamais une erreur pour l’internaute', () => {
  it('écrit une ligne pas_de_lidar avec adresse, point, dalle et commune (paramètres liés)', async () => {
    queryAnalytics.mockResolvedValue({ rows: [], rowCount: 1 });
    await journaliserAnalyseSansLidar(EV);
    const [sql, params] = queryAnalytics.mock.calls[0];
    expect(String(sql).replace(/\s+/g, ' ')).toContain('INSERT INTO analyse_sans_lidar');
    expect(String(sql)).toContain("'pas_de_lidar'");
    expect(params.slice(1)).toEqual([EV.adresse, EV.lat, EV.lon, EV.xL93, EV.yL93, '0642_6854', '78640']);
    expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // jour civil de Paris
  });

  it('REPLI : table absente (migration 354 non appliquée, 42P01) → aucune exception, UN seul avertissement', async () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryAnalytics.mockRejectedValue(Object.assign(new Error('relation "analyse_sans_lidar" does not exist'), { code: '42P01' }));
    await expect(journaliserAnalyseSansLidar(EV)).resolves.toBeUndefined();
    await expect(journaliserAnalyseSansLidar(EV)).resolves.toBeUndefined();
    expect(avert).toHaveBeenCalledTimes(1);
    expect(String(avert.mock.calls[0][0])).toContain('migration 354 non appliquée');
    expect(err).not.toHaveBeenCalled();
  });

  it('toute autre erreur (pool saturé, contrainte) → avalée et journalisée en console, jamais remontée', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryAnalytics.mockRejectedValue(new Error('pool full'));
    await expect(journaliserAnalyseSansLidar(EV)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(1);
  });
});
