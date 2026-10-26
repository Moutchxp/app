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
/** 🔴 431 — la bascule « entrée au 1er locataire » lue en base (absente : la règle ne joue pas). */
let basculeEntree: string | null = null;
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (t: string, c: string) => colonnes.has(`${t}.${c}`) }));
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => {
    appels.push(plat(sql));
    if (sql.includes("cle = 'bascule_entree_locataire'")) return { rows: basculeEntree === null ? [] : [{ v: basculeEntree }] };
    return { rows: [] };
  }),
  withTransaction: vi.fn(async () => { throw new Error('aucune transaction attendue'); }),
  closePool: vi.fn(async () => undefined),
}));
vi.mock('server-only', () => ({}));
vi.mock('node:fs', async (orig) => ({ ...(await orig<typeof import('node:fs')>()), writeFileSync: vi.fn(), mkdirSync: vi.fn() }));

const AVEC_403 = ['gestion_annuaire_lot.statut_bien', 'gestion_annuaire_lot.statut_bien_depuis'];
const AVEC_430 = ['gestion_annuaire_lot.entre_occupe', 'gestion_bail.en_place_prise_gestion', 'gestion_bien_statut_effet_corrige.effet_le'];
beforeEach(() => { appels.length = 0; basculeEntree = null; });

describe('le suivi : la date d’effet corrigée seulement si la 430 est là', () => {
  const lire = async () => {
    const { lireLignesGestion, lireGestion } = await import('./suivi/tableauBordRepo');
    await lireLignesGestion('2026-10-01', '2026-10-31');
    await lireGestion('2025-11-01');
    return { lignes: appels.find((s) => s.includes('LATERAL')) ?? '', transitions: appels.find((s) => s.includes('x.effet_le >= $1')) ?? '' };
  };
  it('SANS la 430 : la date d’origine des transitions, la table de corrections n’est jamais nommée', async () => {
    colonnes = new Set(AVEC_403);
    const { lignes, transitions } = await lire();
    for (const s of appels) expect(s).not.toContain('gestion_bien_statut_effet_corrige');
    expect(lignes).toContain('WHERE t.effet_le BETWEEN $1 AND $2');
    expect(transitions).toContain('t.effet_le AS effet_le');
  });
  it('AVEC la 430 : la correction vivante prime (coalesce), pour le mois, le compteur et le loyer du bail', async () => {
    colonnes = new Set([...AVEC_403, ...AVEC_430]);
    const { lignes, transitions } = await lire();
    const corrige = 'coalesce((SELECT c.effet_le FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = t.id AND c.retire_le IS NULL), t.effet_le)';
    expect(lignes).toContain(corrige);
    expect(transitions).toContain(corrige);
  });
});

describe('🔴 431 — décision B : un bien rentré vide entre dans le suivi au 1er locataire (SQL par fragments)', () => {
  it('SANS la bascule (431 absente) : la règle n’apparaît nulle part, aucune liste d’attente', async () => {
    colonnes = new Set([...AVEC_403, ...AVEC_430, 'gestion_location_parametre_date.valeur']);
    const { lireLignesGestion, lireGestionsEnAttente } = await import('./suivi/tableauBordRepo');
    await lireLignesGestion('2026-10-01', '2026-10-31');
    expect(await lireGestionsEnAttente('2026-10-01', '2026-10-31')).toEqual([]);
    for (const s of appels) expect(s).not.toContain('gestion_annuaire_occupation o WHERE o.lot_id = t.lot_id');
  });
  it('AVEC la bascule au 01/10/2026 : correction, puis occupé (430), puis 1er locataire jamais avant la bascule, sinon NULL (en attente)', async () => {
    colonnes = new Set([...AVEC_403, ...AVEC_430, 'gestion_location_parametre_date.valeur']);
    basculeEntree = '2026-10-01';
    const { lireLignesGestion, lireGestion, lireGestionsEnAttente } = await import('./suivi/tableauBordRepo');
    await lireLignesGestion('2026-10-01', '2026-10-31');
    const lignes = appels.find((s) => s.includes('LATERAL')) ?? '';
    expect(lignes).toContain("t.effet_le >= DATE '2026-10-01' AND NOT coalesce((SELECT lo.entre_occupe FROM gestion_annuaire_lot lo WHERE lo.id = t.lot_id), false)");
    expect(lignes).toContain("CASE WHEN z.m IS NULL THEN NULL ELSE greatest(DATE '2026-10-01', z.m) END");
    expect(lignes).toContain('(o.sortie IS NULL OR o.sortie >= t.effet_le)');
    expect(lignes).toContain('ELSE t.effet_le END');
    // Le stock ne compte pas les biens en attente (sinon les mois passés grossiraient d'eux).
    appels.length = 0;
    await lireGestion('2025-11-01');
    expect(appels.find((s) => s.includes("statut_bien = 'en_gestion'"))).toContain('WHERE d.effet IS NULL');
    appels.length = 0;
    await lireGestionsEnAttente('2026-10-01', '2026-10-31');
    expect(appels.find((s) => s.includes('IS NULL ORDER BY t.effet_le'))).toContain('WHERE t.effet_le BETWEEN $1 AND $2');
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
