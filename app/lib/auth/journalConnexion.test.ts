import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryAnalytics } = vi.hoisted(() => ({ queryAnalytics: vi.fn() }));
vi.mock('../analytics/pool', () => ({ queryAnalytics }));
vi.mock('server-only', () => ({}));

import { journaliserConnexion, lireRetentionMois, purgerJournalConnexions, lireJournalConnexions, RETENTION_MOIS } from './journalConnexion';

const absente = () => Object.assign(new Error('relation "admin_connexion_journal" does not exist'), { code: '42P01' });
beforeEach(() => { queryAnalytics.mockReset(); vi.restoreAllMocks(); });

describe('journaliserConnexion (point 8)', () => {
  it('une ligne : identifiant en minuscules, compte, résultat, empreinte d’adresse — paramètres liés', async () => {
    queryAnalytics.mockResolvedValue({ rows: [] });
    await journaliserConnexion({ identifiant: 'Arno@X.fr', compteId: 1, resultat: 'succes', ipEmpreinte: 'f'.repeat(64) });
    const [sql, params] = queryAnalytics.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO admin_connexion_journal (identifiant, compte_id, resultat, ip_empreinte)');
    expect(params).toEqual(['arno@x.fr', 1, 'succes', 'f'.repeat(64)]);
  });

  it('REPLI : migration 357 non appliquée (42P01) → aucune exception, UN seul avertissement', async () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {});
    queryAnalytics.mockRejectedValue(absente());
    await expect(journaliserConnexion({ identifiant: 'a', compteId: null, resultat: 'echec', ipEmpreinte: null })).resolves.toBeUndefined();
    await expect(purgerJournalConnexions()).resolves.toBeUndefined();
    expect(avert.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('toute autre erreur → avalée et journalisée, jamais remontée', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryAnalytics.mockRejectedValue(new Error('pool full'));
    await expect(journaliserConnexion({ identifiant: 'a', compteId: null, resultat: 'echec', ipEmpreinte: null })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });
});

describe('conservation 12 mois (réglable avec défaut et plage)', () => {
  it('défaut 12 ; dans la plage [1 ; 60] → appliquée ; hors plage, illisible ou base en panne → 12', async () => {
    expect(RETENTION_MOIS).toEqual({ defaut: 12, plage: [1, 60] });
    queryAnalytics.mockResolvedValueOnce({ rows: [] });
    expect(await lireRetentionMois()).toBe(12);
    queryAnalytics.mockResolvedValueOnce({ rows: [{ valeur: '24' }] });
    expect(await lireRetentionMois()).toBe(24);
    queryAnalytics.mockResolvedValueOnce({ rows: [{ valeur: '0' }] });
    expect(await lireRetentionMois()).toBe(12);
    queryAnalytics.mockResolvedValueOnce({ rows: [{ valeur: '120' }] });
    expect(await lireRetentionMois()).toBe(12);
    queryAnalytics.mockRejectedValueOnce(new Error('down'));
    expect(await lireRetentionMois()).toBe(12);
  });

  it('la purge efface ce qui est plus ancien que la conservation réglée', async () => {
    queryAnalytics.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await purgerJournalConnexions();
    const [sql, params] = queryAnalytics.mock.calls[1];
    expect(String(sql).replace(/\s+/g, ' ')).toContain('DELETE FROM admin_connexion_journal WHERE survenu_le < now() -');
    expect(params).toEqual([12]);
  });
});

describe('lireJournalConnexions', () => {
  it('les dernières lignes, plus récentes d’abord', async () => {
    queryAnalytics.mockResolvedValueOnce({ rows: [{ survenu_le: new Date('2026-10-15T08:00:00Z'), identifiant: 'a@x.fr', compte_id: 1, resultat: 'succes', ip_empreinte: null }] });
    const r = await lireJournalConnexions(200);
    expect(r).toEqual({ disponible: true, lignes: [{ survenuLe: '2026-10-15T08:00:00.000Z', identifiant: 'a@x.fr', compteId: 1, resultat: 'succes', ipEmpreinte: null }] });
    expect(String(queryAnalytics.mock.calls[0][0])).toContain('ORDER BY survenu_le DESC');
    expect(queryAnalytics.mock.calls[0][1]).toEqual([200]);
  });

  it('table absente → disponible: false (la carte le dit) ; autre erreur → remontée (la route rend 503)', async () => {
    queryAnalytics.mockRejectedValueOnce(absente());
    expect(await lireJournalConnexions(200)).toEqual({ disponible: false, lignes: [] });
    queryAnalytics.mockRejectedValueOnce(new Error('down'));
    await expect(lireJournalConnexions(200)).rejects.toThrow('down');
  });
});
