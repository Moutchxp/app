import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryAnalytics } = vi.hoisted(() => ({ queryAnalytics: vi.fn() }));
vi.mock('./pool', () => ({ queryAnalytics }));
vi.mock('server-only', () => ({}));

import { journaliserAnalyseSansLidar, type AnalyseSansLidar } from './sansLidar';

const EV: AnalyseSansLidar = { dalle: '0642_6854', communeInsee: '78640' };

beforeEach(() => { queryAnalytics.mockReset(); vi.restoreAllMocks(); });

describe('journaliserAnalyseSansLidar — best-effort, jamais une erreur pour l’internaute', () => {
  it('écrit une ligne pas_de_lidar avec SEULEMENT le jour, la dalle et la commune (paramètres liés)', async () => {
    queryAnalytics.mockResolvedValue({ rows: [], rowCount: 1 });
    await journaliserAnalyseSansLidar(EV);
    const [sql, params] = queryAnalytics.mock.calls[0];
    const texte = String(sql).replace(/\s+/g, ' ');
    expect(texte).toContain('INSERT INTO analyse_sans_lidar (jour_paris, motif, dalle, commune_insee)');
    expect(texte).toContain("'pas_de_lidar'");
    expect(params).toHaveLength(3);
    expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // jour civil de Paris, jamais l'heure
    expect(params.slice(1)).toEqual(['0642_6854', '78640']);
    // 🔒 décision d'Arno : ni adresse, ni point, ni heure
    expect(texte).not.toMatch(/adresse|lat|lon|x_l93|y_l93|survenu_le/);
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
