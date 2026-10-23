import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, 413) — l'écriture de la règle d'un apporteur (mode, taux sur la gestion) : avec la migration 413, tout est
 * écrit ; sans elle, une règle « One shot — gestion 0 % » s'écrit comme avant, une autre est REFUSÉE (elle serait perdue). Base simulée.
 */
const { appels, colonnes } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[], colonnes: { avec413: true } }));
vi.mock('server-only', () => ({}));
vi.mock('../../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: [], rowCount: 1 }; }),
  withTransaction: vi.fn(),
}));
vi.mock('../sondeLocation', () => ({
  colonneExisteMemo: async (_t: string, c: string) => (c === 'taux_gestion_bien_ht' ? colonnes.avec413 : true),
}));
const { ajouterBaremeApporteur } = await import('./suiviRepo');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
beforeEach(() => { appels.length = 0; colonnes.avec413 = true; });

describe('🔴 la règle d’un apporteur, écrite', () => {
  it('avec la 413 : le mode et le taux sur la gestion partent avec la règle datée', async () => {
    expect(await ajouterBaremeApporteur(3, { mode: 'recurrent', taux: '10', tauxGestion: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    const ins = appels.find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    expect(ins.sql).toContain('mode, taux_gestion');
    expect(ins.params).toEqual([3, '2026-11-01', 0.1, 0, 'Arnaud Jorel', 'recurrent', 0.1]);
  });
  it('sans la 413 : « One shot — gestion 0 % » s’écrit comme avant ; « Récurrent » ou un taux sur la gestion est refusé', async () => {
    colonnes.avec413 = false;
    expect(await ajouterBaremeApporteur(3, { taux: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(appels.at(-1)!.sql).not.toContain('taux_gestion');
    appels.length = 0;
    const r = await ajouterBaremeApporteur(3, { mode: 'recurrent', taux: '10', tauxGestion: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
    expect(appels.some((a) => a.sql.includes('INSERT'))).toBe(false);
  });
});
