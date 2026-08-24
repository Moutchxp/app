import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AffectationEtat } from './affectationRepo';

/**
 * FUS-3e — valider (injection via preseanceAltitude, refige de la LiDAR COURANTE relue), refuser (motif obligatoire), retour LiDAR,
 * garde de cardinalité, et l'événement append-only. `db/client` et `affectationRepo.lireAffectation` mockés ; preseanceAltitude est
 * le VRAI module (on n'en réécrit pas la logique — la garde anti-inversion vit dans son propre test).
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = {
    aff: null as AffectationEtat | null,
    lidar: 42 as number | null,            // batiment.altitude_maximale_toit COURANT (relu)
    altRow: null as null | { altitude_ngf: number; altitude_origine: 'lidar' | 'permis'; altitude_lidar_refige: number | null },
    retourCleabs: [] as string[],
    etatDossier: 'arbitrage_demande',
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/SELECT id FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: [{ id: 99 }] };
    if (/SELECT altitude_ngf[\s\S]*FROM permis_polygone_altitude WHERE cleabs/i.test(sql)) return { rows: state.altRow ? [state.altRow] : [] };
    if (/altitude_maximale_toit AS alt FROM batiment/i.test(sql)) return { rows: [{ alt: state.lidar }] };
    if (/SELECT etat FROM permis_rattachement WHERE id/i.test(sql)) return { rows: [{ etat: state.etatDossier }] };
    if (/SELECT ppa\.cleabs FROM permis_polygone_altitude/i.test(sql)) return { rows: state.retourCleabs.map((c) => ({ cleabs: c })) };
    return { rows: [], rowCount: 1 };
  };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));
vi.mock('./affectationRepo', () => ({ lireAffectation: async () => H.state.aff }));

import { validerRattachement, refuserRattachement, retourLidar } from './actionsRattachement';

const aff = (over: Partial<AffectationEtat> = {}): AffectationEtat => ({
  empreinteFigee: true, motif: null, colonneManquante: false,
  schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: null },
  polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
  corps: [
    { id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] },
    { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: ['BAT_B'] },
  ], ...over,
});

const upserts = () => H.calls.filter((c) => /INSERT INTO permis_polygone_altitude/i.test(c.sql));
const events = () => H.calls.filter((c) => /INSERT INTO permis_rattachement_evenement/i.test(c.sql));
const majDossier = () => H.calls.filter((c) => /UPDATE permis_rattachement SET etat/i.test(c.sql));

beforeEach(() => { H.calls.length = 0; H.state.aff = aff(); H.state.lidar = 42; H.state.altRow = null; H.state.retourCleabs = []; H.state.etatDossier = 'arbitrage_demande'; });

describe('validerRattachement', () => {
  it('injecte l’altitude de sommet (origine permis) pour chaque corps affecté, en REFIGEANT la LiDAR COURANTE relue', async () => {
    const r = await validerRattachement(11434, 'admin:decision');
    expect(r.ok).toBe(true);
    expect(r.nbInjectes).toBe(2);
    // la LiDAR courante a bien été RELUE en base (pas le snapshot)
    expect(H.calls.some((c) => /altitude_maximale_toit AS alt FROM batiment/i.test(c.sql))).toBe(true);
    // upsert : altitude = sommet permis, origine 'permis', refige = LiDAR courante (42)
    const u = upserts();
    expect(u).toHaveLength(2);
    expect(u[0].params).toEqual(expect.arrayContaining([88.9, 'permis', 42])); // corps 2D1 → BAT_A
    expect(u[1].params).toEqual(expect.arrayContaining([87.1, 'permis', 42]));
    // dossier → valide + événement de validation
    expect(majDossier()).toHaveLength(1);
    expect(events().some((e) => /'validation'/i.test(e.sql) || (e.params).includes('validation'))).toBe(true);
  });

  it('GARDE cardinalité : un corps sans polygone → besoinConfirmation SANS rien écrire ; avec motif → valide + motif tracé', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: [] }] });
    const sansMotif = await validerRattachement(11434, 'admin:decision');
    expect(sansMotif).toMatchObject({ ok: false, besoinConfirmation: true });
    expect(upserts()).toHaveLength(0); // rien écrit tant que non confirmé
    H.calls.length = 0;
    const avecMotif = await validerRattachement(11434, 'admin:decision', 'bâtiments accolés : 2D2 sans polygone propre');
    expect(avecMotif.ok).toBe(true);
    const valEvt = events().find((e) => (e.params).includes('validation'));
    expect(JSON.stringify(valEvt?.params)).toContain('bâtiments accolés'); // motif écrit au dossier (événement)
  });

  it('un corps sans altitude n’injecte rien mais la validation aboutit', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: null, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: ['BAT_B'] }] });
    const r = await validerRattachement(11434, 'admin:decision');
    expect(r.ok).toBe(true);
    expect(r.nbInjectes).toBe(1); // seul 2D2 (altitude connue) est injecté
  });

  it('GARDE R4 : un bâtiment portant PLUS D’UN polygone → REFUS NET, message explicite, AUCUNE injection', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A', 'BAT_B'] }] });
    const r = await validerRattachement(11434, 'admin:decision');
    expect(r.ok).toBe(false);
    expect((r as { motif: string }).motif).toContain('plusieurs polygones'); // message métier
    expect((r as { motif: string }).motif).toMatch(/faux obstacle|une altitude par polygone/i);
    expect(upserts()).toHaveLength(0);   // rien injecté
    expect(majDossier()).toHaveLength(0); // dossier NON validé
  });
});

describe('refuserRattachement', () => {
  it('motif vide → refusé ; motif fourni → dossier refuse + événement', async () => {
    expect(await refuserRattachement(11434, 'admin:decision', '  ')).toMatchObject({ ok: false });
    H.calls.length = 0;
    const r = await refuserRattachement(11434, 'admin:decision', 'parcelle candidate erronée');
    expect(r.ok).toBe(true);
    expect(H.calls.some((c) => /SET etat = 'refuse'/i.test(c.sql))).toBe(true);
    expect(events().some((e) => (e.params).includes('refus'))).toBe(true);
    expect(upserts()).toHaveLength(0); // aucune altitude touchée
  });
});

describe('retourLidar', () => {
  it('restaure la LiDAR refigée et remet origine lidar, avec événement', async () => {
    H.state.retourCleabs = ['BAT_A'];
    H.state.altRow = { altitude_ngf: 88.9, altitude_origine: 'permis', altitude_lidar_refige: 42 };
    const r = await retourLidar(11434, 'admin:decision');
    expect(r.ok).toBe(true);
    expect(r.nbRestaures).toBe(1);
    const u = upserts();
    expect(u[0].params).toEqual(expect.arrayContaining([42, 'lidar'])); // altitude restaurée = refige, origine lidar
    expect(events().some((e) => (e.params).includes('retour_altitude'))).toBe(true);
  });

  it('rien de refigé → aucune restauration', async () => {
    H.state.retourCleabs = ['BAT_A'];
    H.state.altRow = { altitude_ngf: 42, altitude_origine: 'lidar', altitude_lidar_refige: null };
    const r = await retourLidar(11434, 'admin:decision');
    expect(r.nbRestaures).toBe(0);
    expect(upserts()).toHaveLength(0);
  });
});
