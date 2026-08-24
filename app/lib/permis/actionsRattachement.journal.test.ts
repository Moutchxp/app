import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AffectationEtat } from './affectationRepo';

/**
 * FUS-3f — alimentation du REGISTRE append-only par les actions (injection, retour LiDAR, écrasement, import BD TOPO), registre
 * ACTIF (to_regclass renvoie la table). `db/client` et `affectationRepo` mockés ; preseanceAltitude est le VRAI module.
 * Le fichier FUS-3e (actionsRattachement.test.ts) couvre déjà le cas registre INACTIF (aucune écriture de journal).
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = {
    aff: null as AffectationEtat | null,
    lidar: 42 as number | null,
    altRow: null as null | { altitude_ngf: number; altitude_origine: 'lidar' | 'permis'; altitude_lidar_refige: number | null },
    derniere: null as null | { origine: 'lidar' | 'permis'; altitude_ngf: number },
    retourCleabs: [] as string[],
    dossierAlt: 11434 as number | null,
    etatDossier: 'valide',
    importRows: [] as { cleabs: string; alt: number | null }[],
    editionMillesime: null as string | null, // BDT-2 : null = table bdtopo_edition absente (→ 'inconnu')
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/to_regclass\('public\.permis_altitude_journal'\)/i.test(sql)) return { rows: [{ t: 'permis_altitude_journal' }] };
    if (/to_regclass\('public\.bdtopo_edition'\)/i.test(sql)) return { rows: [{ t: state.editionMillesime != null ? 'bdtopo_edition' : null }] };
    if (/SELECT millesime FROM bdtopo_edition WHERE courante/i.test(sql)) return { rows: state.editionMillesime != null ? [{ millesime: state.editionMillesime }] : [] };
    if (/SELECT id FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: [{ id: 99 }] };
    if (/SELECT altitude_ngf[\s\S]*FROM permis_polygone_altitude WHERE cleabs/i.test(sql)) return { rows: state.altRow ? [state.altRow] : [] };
    if (/SELECT dossier_id FROM permis_polygone_altitude WHERE cleabs/i.test(sql)) return { rows: [{ dossier_id: state.dossierAlt }] };
    if (/altitude_maximale_toit AS alt FROM batiment/i.test(sql)) return { rows: [{ alt: state.lidar }] };
    if (/SELECT origine, altitude_ngf FROM permis_altitude_journal WHERE cleabs/i.test(sql)) return { rows: state.derniere ? [state.derniere] : [] };
    if (/date_modification AS d FROM batiment WHERE cleabs/i.test(sql)) return { rows: [{ d: '2026-03-20' }] };
    if (/SELECT etat FROM permis_rattachement WHERE id/i.test(sql)) return { rows: [{ etat: state.etatDossier }] };
    if (/SELECT ppa\.cleabs FROM permis_polygone_altitude/i.test(sql)) return { rows: state.retourCleabs.map((c) => ({ cleabs: c })) };
    if (/SELECT DISTINCT b\.cleabs, b\.altitude_maximale_toit AS alt[\s\S]*FROM batiment b[\s\S]*permis_empreinte/i.test(sql)) return { rows: state.importRows };
    return { rows: [], rowCount: 1 };
  };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));
vi.mock('./affectationRepo', () => ({ lireAffectation: async () => H.state.aff }));

import { validerRattachement, retourLidar, enregistrerMesureLidar, importBdTopoSuivis } from './actionsRattachement';

const aff = (over: Partial<AffectationEtat> = {}): AffectationEtat => ({
  empreinteFigee: true, motif: null, colonneManquante: false,
  schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: null },
  polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }],
  corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }], ...over,
});

const journal = () => H.calls.filter((c) => /INSERT INTO permis_altitude_journal/i.test(c.sql));
const events = () => H.calls.filter((c) => /INSERT INTO permis_rattachement_evenement/i.test(c.sql));

beforeEach(() => {
  H.calls.length = 0;
  Object.assign(H.state, { aff: aff(), lidar: 42, altRow: null, derniere: null, retourCleabs: [], dossierAlt: 11434, etatDossier: 'valide', importRows: [], editionMillesime: null });
});

describe('injection → registre', () => {
  it('registre vide pour le cleabs : écrit une ligne de DÉPART lidar (millésime « inconnu ») PUIS la ligne d’injection permis', async () => {
    const r = await validerRattachement(11434, 'admin:decision');
    expect(r.ok).toBe(true);
    const j = journal();
    expect(j).toHaveLength(2);
    // 1) ligne de départ lidar : altitude 42, origine 'lidar', cause 'import', millésime 'inconnu' (jamais supposé), date objet réelle
    expect(j[0].params.slice(0, 4)).toEqual(['BAT_A', 42, 'lidar', 'import']);
    expect(j[0].params).toContain('inconnu');
    expect(j[0].params).toContain('2026-03-20');
    // 2) ligne d’injection permis : altitude 88.9, origine 'permis', cause 'injection'
    expect(j[1].params.slice(0, 4)).toEqual(['BAT_A', 88.9, 'permis', 'injection']);
  });

  it('registre déjà amorcé (une dernière ligne existe) : PAS de doublon de départ, seulement la ligne d’injection', async () => {
    H.state.derniere = { origine: 'lidar', altitude_ngf: 42 };
    await validerRattachement(11434, 'admin:decision');
    const j = journal();
    expect(j).toHaveLength(1);
    expect(j[0].params[3]).toBe('injection');
  });

  it('BDT-2 : édition BD TOPO courante stampée → la ligne de départ porte le millésime (fini « inconnu »)', async () => {
    H.state.editionMillesime = '2026-03-15';
    await validerRattachement(11434, 'admin:decision');
    const j = journal();
    expect(j[0].params.slice(0, 4)).toEqual(['BAT_A', 42, 'lidar', 'import']); // toujours la ligne de départ lidar
    expect(j[0].params).toContain('2026-03-15'); // millésime réel injecté
    expect(j[0].params).not.toContain('inconnu'); // plus de littéral supposé
  });
});

describe('retour LiDAR → registre', () => {
  it('écrit une ligne cause retour_arriere, origine lidar, altitude = refige restaurée', async () => {
    H.state.retourCleabs = ['BAT_A'];
    H.state.altRow = { altitude_ngf: 88.9, altitude_origine: 'permis', altitude_lidar_refige: 42 };
    const r = await retourLidar(11434, 'admin:decision');
    expect(r.nbRestaures).toBe(1);
    const j = journal();
    expect(j).toHaveLength(1);
    expect(j[0].params.slice(0, 4)).toEqual(['BAT_A', 42, 'lidar', 'retour_arriere']);
  });
});

describe('enregistrerMesureLidar (écrasement manuel)', () => {
  it('refus si provenance incomplète, AVANT toute écriture', async () => {
    expect(await enregistrerMesureLidar('BAT_A', 90, { millesime: '', source: 'lidar_hd' }, 'cli')).toMatchObject({ ok: false });
    expect(await enregistrerMesureLidar('BAT_A', 90, { millesime: '2026-T2', source: '' }, 'cli')).toMatchObject({ ok: false });
    expect(journal()).toHaveLength(0);
  });

  it('écrase une altitude permis : ligne ecrasement_lidar (avec provenance) + dossier annulé par LiDAR', async () => {
    H.state.altRow = { altitude_ngf: 88.9, altitude_origine: 'permis', altitude_lidar_refige: 42 };
    const r = await enregistrerMesureLidar('BAT_A', 90, { millesime: '2026-T3', source: 'lidar_hd' }, 'cli');
    expect(r.ok).toBe(true);
    expect(r.nbEcrases).toBe(1);
    const j = journal();
    expect(j).toHaveLength(1);
    expect(j[0].params.slice(0, 4)).toEqual(['BAT_A', 90, 'lidar', 'ecrasement_lidar']);
    expect(j[0].params).toContain('2026-T3');   // millésime lié
    expect(j[0].params).toContain('lidar_hd');  // source liée
    // dossier passé à annule_par_lidar + événement
    expect(H.calls.some((c) => /SET etat = 'annule_par_lidar'/i.test(c.sql))).toBe(true);
    expect(events().some((e) => (e.params).includes('annulation_lidar'))).toBe(true);
  });
});

describe('importBdTopoSuivis (point d’entrée import, borné aux suivis)', () => {
  it('refus si provenance incomplète', async () => {
    expect(await importBdTopoSuivis({ millesime: '', source: 'bdtopo' }, 'cli')).toMatchObject({ ok: false });
  });

  it('traite les cleabs à altitude connue, IGNORE les altitudes NULL (attribut absent ≠ bâtiment rasé)', async () => {
    H.state.importRows = [{ cleabs: 'BAT_A', alt: 90 }, { cleabs: 'BAT_B', alt: null }];
    const r = await importBdTopoSuivis({ millesime: '2026-T3', source: 'bdtopo' }, 'cli');
    expect(r.ok).toBe(true);
    expect(r.nbTraites).toBe(1);
    const j = journal();
    expect(j).toHaveLength(1);
    expect(j[0].params.slice(0, 4)).toEqual(['BAT_A', 90, 'lidar', 'import']);
    expect(j[0].params).toContain('bdtopo');
  });
});
