import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 Arno (26/10/2026, 430) — LA MIGRATION 430 EST LIVRÉE NON APPLIQUÉE : le code tourne sans elle, et avec elle.
 *   · le suivi (Nouvelles gestions, Biens en gestion) lit la date d'effet CORRIGÉE seulement si la table existe ; sinon la date d'origine ;
 *   · le script `location:rentre-occupe` dit « disponible après la mise à jour » au lieu d'échouer, et n'écrit rien ;
 *   · le bail « en place », la réponse d'un bien, les baux en place : lus vides sans la 430 ; marquer refuse (`sans_schema`).
 * Base simulée : on éprouve le SQL par fragments et l'absence d'écriture, jamais la forme exacte d'une requête.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');
let colonnes = new Set<string>();
const appels: string[] = [];
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (t: string, c: string) => colonnes.has(`${t}.${c}`) }));
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => { appels.push(plat(sql)); return { rows: [] }; }),
  withTransaction: vi.fn(async () => { throw new Error('aucune transaction attendue'); }),
  closePool: vi.fn(async () => undefined),
}));
vi.mock('server-only', () => ({}));
vi.mock('node:fs', async (orig) => ({ ...(await orig<typeof import('node:fs')>()), writeFileSync: vi.fn(), mkdirSync: vi.fn() }));

const AVEC_403 = ['gestion_annuaire_lot.statut_bien', 'gestion_annuaire_lot.statut_bien_depuis'];
const AVEC_430 = ['gestion_annuaire_lot.entre_occupe', 'gestion_bail.en_place_prise_gestion', 'gestion_bien_statut_effet_corrige.effet_le'];
beforeEach(() => { appels.length = 0; });

describe('le suivi : la date d’effet corrigée seulement si la 430 est là', () => {
  it('SANS la 430 : la date d’origine des transitions, la table de corrections n’est jamais nommée', async () => {
    colonnes = new Set(AVEC_403);
    const { lireLignesGestion, lireGestion } = await import('./suivi/tableauBordRepo');
    await lireLignesGestion('2026-10-01', '2026-10-31');
    await lireGestion('2025-11-01');
    expect(appels.filter((s) => s.includes('gestion_bien_statut_transition')).length).toBe(2);
    for (const s of appels) expect(s).not.toContain('gestion_bien_statut_effet_corrige');
    expect(appels.find((s) => s.includes('LATERAL'))).toContain('WHERE t.effet_le BETWEEN $1 AND $2');
  });
  it('AVEC la 430 : la correction vivante prime (coalesce), pour le mois, le compteur et le loyer du bail', async () => {
    colonnes = new Set([...AVEC_403, ...AVEC_430]);
    const { lireLignesGestion, lireGestion } = await import('./suivi/tableauBordRepo');
    await lireLignesGestion('2026-10-01', '2026-10-31');
    await lireGestion('2025-11-01');
    const lignes = appels.find((s) => s.includes('LATERAL')) ?? '';
    expect(lignes).toContain('coalesce((SELECT c.effet_le FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = t.id AND c.retire_le IS NULL), t.effet_le)');
    expect(lignes).toContain('BETWEEN $1 AND $2');
    expect(appels.find((s) => s.includes('ORDER BY 4, t.id') && !s.includes('LATERAL'))).toContain('gestion_bien_statut_effet_corrige');
  });
});

describe('sans la 430 : rien n’échoue, rien n’est écrit', () => {
  beforeEach(() => { colonnes = new Set(AVEC_403); });
  it('le script : « disponible après la mise à jour », aucune lecture métier, aucune écriture', async () => {
    const { main, MOT_SANS_430 } = await import('../../scripts/rentre-occupe');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lignes = await main(['--bien=64', '--date-mandat=2026-10-15', '--bail=473', '--appliquer']);
    expect(lignes).toContain(MOT_SANS_430);
    expect(MOT_SANS_430).toMatch(/^Disponible après la mise à jour/);
    for (const s of appels) expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it('le dépôt : lectures vides, marquer refuse sans rien écrire', async () => {
    const r = await import('./rentreOccupeRepo');
    expect(await r.rentreOccupeDisponible()).toBe(false);
    expect(await r.rentreOccupeDuBien(64)).toBeNull();
    expect(await r.bauxEnPlace({ locataireId: 5 })).toEqual([]);
    expect(await r.bailEnPlace(473)).toBe(false);
    expect(await r.candidatsRentreOccupe(90)).toEqual([]);
    expect(await r.etatDuCas(64)).toBeNull();
    expect(await r.marquerBailEnPlace(473, { id: 3, libelle: 'a.jorel@sansvisavis.com' })).toEqual({ etat: 'sans_schema' });
    expect(await r.appliquerCas({ lotId: 64, dateMandat: '2026-10-15', bailId: 473 }, { id: null, libelle: 'script' })).toEqual({ etat: 'sans_schema' });
    expect(appels).toEqual([]);
  });
});

describe('avec la 430, le script en DRY-RUN n’écrit rien', () => {
  it('sans --appliquer : lectures seules (aucun INSERT / UPDATE / DELETE, aucune transaction)', async () => {
    colonnes = new Set([...AVEC_403, ...AVEC_430]);
    const { main } = await import('../../scripts/rentre-occupe');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lignes = await main(['--bien=64', '--date-mandat=2026-10-15', '--bail=473']);
    expect(lignes[0]).toContain('DRY-RUN (aucune écriture)');
    expect(appels.length).toBeGreaterThan(0);
    for (const s of appels) expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});
