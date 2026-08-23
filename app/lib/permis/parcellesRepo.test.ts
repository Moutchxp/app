import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N3-E — dépôt des parcelles. `db/client` mocké (routé par fragment SQL). On éprouve : la purge CIBLÉE 'extraite' (recompute
 * idempotent, jamais la saisie), l'INSERT ON CONFLICT DO NOTHING (invariant : une saisie occupant la clé n'est pas écrasée), et
 * que les paramètres LIÉS portent l'IDU/confiance/réserve/provenance décidés.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  type BatiRow = { cleabs: string | null; etages: number | null; alt: number | null; hauteur: number | null; dmod: string | null };
  type EmpRow = { a_geom: boolean; complete: boolean; motif: string | null } | null;
  type CapRow = { capture: boolean; nb: number | null; motif: string | null; mill: string | null } | null;
  const state = {
    insertRowCount: 1, total: 2, avec: 2, unionSurface: 2886.3, unionNb: 2, unionMill: '2026-06-01',
    // FUS-1b — état empreinte lu par figerBatiSnapshot, millésime couche bâti, bâtiments capturés, ligne résumé lue par lire…
    empRow: { a_geom: true, complete: true, motif: null } as EmpRow,
    batiMill: '2026-03-20' as string | null,           // proxy max(date_modification) — plus utilisé par le stampage depuis L8
    editionTable: 'bdtopo_edition' as string | null,   // L8 — to_regclass(bdtopo_edition) : null = migration 120 absente
    editionMill: '2026-06-15' as string | null,        // L8 — bdtopo_edition.courante : le millésime AUTORITÉ stampé
    batiRows: [
      { cleabs: 'BATIMENT0001', etages: 3, alt: 42.5, hauteur: 9, dmod: '2019-05-01' },
      { cleabs: 'BATIMENT0002', etages: null, alt: null, hauteur: null, dmod: '2024-02-01' },
    ] as BatiRow[],
    capRow: { capture: true, nb: 2, motif: null, mill: '2026-03-20' } as CapRow,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT\s+count\(\*\)::int\s+AS\s+total/i.test(sql)) return { rows: [{ total: state.total, avec: state.avec }], rowCount: 1 };
    if (/INSERT\s+INTO\s+permis_empreinte[\s\S]*RETURNING/i.test(sql)) return { rows: [{ surface: state.unionSurface, nb: state.unionNb, mill: state.unionMill }], rowCount: 1 };
    if (/INSERT\s+INTO\s+permis_parcelle/i.test(sql)) return { rows: [], rowCount: state.insertRowCount };
    // FUS-1b
    if (/SELECT[\s\S]*a_geom[\s\S]*FROM\s+permis_empreinte/i.test(sql)) return { rows: state.empRow ? [state.empRow] : [], rowCount: state.empRow ? 1 : 0 };
    if (/to_char\(max\(date_modification\)[\s\S]*FROM\s+batiment/i.test(sql)) return { rows: [{ mill: state.batiMill }], rowCount: 1 };
    if (/to_regclass\('public\.bdtopo_edition'\)/i.test(sql)) return { rows: [{ t: state.editionTable }], rowCount: 1 }; // L8 — registre présent ?
    if (/FROM\s+bdtopo_edition\s+WHERE\s+courante/i.test(sql)) return { rows: state.editionMill != null ? [{ millesime: state.editionMill }] : [], rowCount: state.editionMill != null ? 1 : 0 };
    if (/INSERT\s+INTO\s+permis_bati_snapshot[\s\S]*RETURNING/i.test(sql)) return { rows: state.batiRows, rowCount: state.batiRows.length };
    if (/INSERT\s+INTO\s+permis_bati_capture/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/SELECT\s+capture,\s*nb_batiments[\s\S]*FROM\s+permis_bati_capture/i.test(sql)) return { rows: state.capRow ? [state.capRow] : [], rowCount: state.capRow ? 1 : 0 };
    if (/SELECT\s+cleabs[\s\S]*FROM\s+permis_bati_snapshot/i.test(sql)) return { rows: state.batiRows, rowCount: state.batiRows.length };
    return { rows: [], rowCount: 0 };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireParcelles, figerEmpreinte, figerBatiSnapshot, lireBatiSnapshotPermis } from './parcellesRepo';
import type { ParcelleDecision } from './decisionParcelles';

const p = (over: Partial<ParcelleDecision> = {}): ParcelleDecision => ({
  prefixe: '000', section: 'DZ', numero: '09', superficieDeclareeM2: 2631.5, role: 'origine',
  idu: '75120000DZ0009', confiance: 'confirmee', reserve: null, provenance: 'Cerfa', ...over,
});
const inserts = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_parcelle/i.test(a.sql));
const deletes = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_parcelle/i.test(a.sql));

const snapshots = () => H.appels.filter((a) => /UPDATE\s+permis_parcelle[\s\S]*geom_snapshot/i.test(a.sql));
const empreintes = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_empreinte/i.test(a.sql));

const batiInserts   = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_bati_snapshot/i.test(a.sql));
const batiDeletes   = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_bati_snapshot/i.test(a.sql));
const batiCaptures  = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_bati_capture/i.test(a.sql));

beforeEach(() => {
  H.appels.length = 0; H.state.insertRowCount = 1; H.state.total = 2; H.state.avec = 2; H.state.unionSurface = 2886.3; H.state.unionNb = 2; H.state.unionMill = '2026-06-01';
  H.state.empRow = { a_geom: true, complete: true, motif: null };
  H.state.batiMill = '2026-03-20';
  H.state.editionTable = 'bdtopo_edition'; H.state.editionMill = '2026-06-15';
  H.state.batiRows = [
    { cleabs: 'BATIMENT0001', etages: 3, alt: 42.5, hauteur: 9, dmod: '2019-05-01' },
    { cleabs: 'BATIMENT0002', etages: null, alt: null, hauteur: null, dmod: '2024-02-01' },
  ];
  H.state.capRow = { capture: true, nb: 2, motif: null, mill: '2026-03-20' };
});

describe('ecrireParcelles', () => {
  it('purge CIBLÉE origine=extraite (jamais la saisie), puis insère chaque parcelle avec ses paramètres liés', async () => {
    const r = await ecrireParcelles(1, [p(), p({ section: 'DZ', numero: '10', idu: '75120000DZ0010', superficieDeclareeM2: 255 })], 'auto');
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].sql).toMatch(/origine\s*=\s*'extraite'/i);      // ne touche jamais la saisie
    expect(inserts()).toHaveLength(2);
    expect(inserts()[0].sql).toMatch(/ON CONFLICT[\s\S]*DO NOTHING/i);  // invariant saisie
    expect(inserts()[0].params).toContain('75120000DZ0009');            // IDU lié
    expect(r).toEqual({ ecrites: 2, ignorees: 0 });
  });
  it('conflit (une saisie occupe la clé) → DO NOTHING → comptée « ignorée », jamais écrasée', async () => {
    H.state.insertRowCount = 0; // ON CONFLICT DO NOTHING → 0 ligne affectée
    const r = await ecrireParcelles(1, [p()], 'auto');
    expect(r).toEqual({ ecrites: 0, ignorees: 1 });
  });
});

describe('figerEmpreinte (FUS-1)', () => {
  it('toutes les parcelles rattachées → snapshot figé PUIS union calculée (complète, surface + millésime)', async () => {
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    // 1) le snapshot est copié depuis parcelle.geom (survit au réimport du cadastre)
    expect(snapshots()).toHaveLength(1);
    expect(snapshots()[0].sql).toMatch(/geom_snapshot\s*=\s*par\.geom/i);
    expect(snapshots()[0].sql).toMatch(/cadastre_millesime/i);       // millésime cadastral courant du dept
    // 2) union via ST_Union sur les snapshots, upsert complète
    const ins = empreintes();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).toMatch(/ST_Union\(geom_snapshot\)/i);
    expect(ins[0].sql).toMatch(/ON CONFLICT[\s\S]*dossier_id[\s\S]*DO UPDATE/i);
    expect(e).toEqual({ surfaceM2: 2886.3, nbParcelles: 2, complete: true, motif: null, millesime: '2026-06-01', aGeometrie: true });
  });

  it('UNE parcelle non rattachée → empreinte INCOMPLÈTE avec motif, JAMAIS d’union sur un sous-ensemble', async () => {
    H.state.total = 2; H.state.avec = 1; // 1 parcelle sans snapshot
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    const ins = empreintes();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).not.toMatch(/ST_Union/i);                     // pas d'union muette
    expect(ins[0].sql).toMatch(/complete\s*=\s*false/i);
    expect(e.complete).toBe(false);
    expect(e.motif).toContain('1 parcelle(s) d’origine non rattachée');
    expect(e.surfaceM2).toBeNull();
  });

  it('aucune parcelle d’origine → empreinte non calculable (motif), pas d’union', async () => {
    H.state.total = 0; H.state.avec = 0;
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    expect(empreintes()[0].sql).not.toMatch(/ST_Union/i);
    expect(e).toMatchObject({ complete: false, surfaceM2: null });
    expect(e.motif).toContain('aucune parcelle');
  });
});

describe('figerBatiSnapshot (FUS-1b)', () => {
  it('empreinte complète → photographie les bâtiments intersectant l’empreinte (index GiST + footprint 2D) et enregistre capture=true', async () => {
    const b = await figerBatiSnapshot(7, 'cerfa:parcelles');
    // recompute idempotent : purge des lignes bâti du permis AVANT toute capture
    expect(batiDeletes()).toHaveLength(1);
    // capture par intersection : `b.geom && pe.geom` (bbox → index GiST) puis ST_Intersects ; footprint figé en 2D
    const ins = batiInserts();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).toMatch(/b\.geom\s*&&\s*pe\.geom/i);        // prédicat indexable
    expect(ins[0].sql).toMatch(/ST_Intersects\(b\.geom,\s*pe\.geom\)/i);
    expect(ins[0].sql).toMatch(/ST_Force2D\(b\.geom\)/i);          // footprint 2D (le signal est le contour)
    // L9 — on fige AUSSI etat_de_l_objet + usage_1/usage_2 : colonnes cibles ET lecture BRUTE de la source (aucun défaut/COALESCE)
    expect(ins[0].sql).toMatch(/INSERT INTO permis_bati_snapshot[\s\S]*etat_de_l_objet[\s\S]*usage_1[\s\S]*usage_2/i);
    expect(ins[0].sql).toMatch(/b\.etat_de_l_objet/i);
    expect(ins[0].sql).toMatch(/b\.usage_1/i); expect(ins[0].sql).toMatch(/b\.usage_2/i);
    expect(ins[0].sql).not.toMatch(/COALESCE\([\s\S]*etat_de_l_objet/i); // NULL source → NULL figé (jamais une valeur inventée)
    // résumé : capture=true, nb=2, millésime = AUTORITÉ (registre bdtopo_edition.courante), plus le proxy max(date_modification)
    expect(batiCaptures()[0].sql).toMatch(/capture\s*=\s*true/i);
    expect(batiCaptures()[0].params).toContain('2026-06-15');       // L8 — source_millesime = registre, pas le proxy (2026-03-20)
    expect(batiCaptures()[0].params).not.toContain('2026-03-20');   // le proxy n'est plus stampé
    expect(b.capture).toBe(true);
    expect(b.nbBatiments).toBe(2);
    expect(b.sourceMillesime).toBe('2026-06-15');
    // étages/altitude opportunistes : présents pour l’un, NULL pour l’autre — jamais supposés
    expect(b.batiments[0]).toMatchObject({ cleabs: 'BATIMENT0001', nombreEtages: 3, altitudeMaxToit: 42.5 });
    expect(b.batiments[1]).toMatchObject({ cleabs: 'BATIMENT0002', nombreEtages: null, altitudeMaxToit: null });
  });

  it('L8 — registre absent/vide (MILLESIME_INCONNU) → source_millesime = NULL (honnête, jamais une date supposée)', async () => {
    H.state.editionTable = null; // migration 120 non appliquée
    const b = await figerBatiSnapshot(7, 'cerfa:parcelles');
    expect(b.sourceMillesime).toBeNull();
    expect(batiCaptures()[0].params).not.toContain('2026-03-20'); // surtout PAS le proxy en repli
  });

  it('empreinte complète mais 0 bâtiment → TERRAIN NU (capture=true, nb=0), information stockée', async () => {
    H.state.batiRows = [];
    const b = await figerBatiSnapshot(7, 'cerfa:parcelles');
    expect(batiInserts()).toHaveLength(1);                          // la requête tourne, elle ne ramène rien
    expect(batiCaptures()[0].sql).toMatch(/capture\s*=\s*true/i);
    expect(b).toMatchObject({ capture: true, nbBatiments: 0, motif: null, batiments: [] });
  });

  it('empreinte INCOMPLÈTE → rien photographié EN SILENCE : capture=false + motif, aucune capture de bâtiment', async () => {
    H.state.empRow = { a_geom: false, complete: false, motif: '1 parcelle(s) d’origine non rattachée(s)' };
    const b = await figerBatiSnapshot(7, 'cerfa:parcelles');
    expect(batiInserts()).toHaveLength(0);                          // JAMAIS de capture sur une empreinte incomplète
    expect(batiCaptures()[0].sql).toMatch(/false/i);
    expect(b.capture).toBe(false);
    expect(b.motif).toContain('1 parcelle');
    expect(b.batiments).toEqual([]);
  });

  it('empreinte jamais figée → capture=false avec motif explicite (jamais un vide muet)', async () => {
    H.state.empRow = null;
    const b = await figerBatiSnapshot(7, 'cerfa:parcelles');
    expect(batiInserts()).toHaveLength(0);
    expect(b.capture).toBe(false);
    expect(b.motif).toContain('empreinte non figée');
  });
});

describe('lireBatiSnapshotPermis (FUS-1b)', () => {
  it('assemble le résumé (capture) + le détail (bâtiments) et mappe les champs', async () => {
    const r = await lireBatiSnapshotPermis(7);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ capture: true, nbBatiments: 2, motif: null, sourceMillesime: '2026-03-20' });
    expect(r!.batiments).toHaveLength(2);
    expect(r!.batiments[0]).toMatchObject({ cleabs: 'BATIMENT0001', nombreEtages: 3, altitudeMaxToit: 42.5, dateModification: '2019-05-01' });
  });

  it('jamais capturé → null', async () => {
    H.state.capRow = null;
    expect(await lireBatiSnapshotPermis(7)).toBeNull();
  });
});
