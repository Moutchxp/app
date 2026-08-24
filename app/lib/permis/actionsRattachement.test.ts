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

describe('validerRattachement (M3 — une cote par polygone)', () => {
  it('injecte LA COTE SAISIE de chaque polygone (origine permis), en REFIGEANT la LiDAR COURANTE relue', async () => {
    const r = await validerRattachement(11434, 'admin:decision', { BAT_A: 88.9, BAT_B: 87.1 });
    expect(r.ok).toBe(true);
    expect(r.nbInjectes).toBe(2);
    // la LiDAR courante a bien été RELUE en base (pas le snapshot)
    expect(H.calls.some((c) => /altitude_maximale_toit AS alt FROM batiment/i.test(c.sql))).toBe(true);
    // upsert : altitude = cote SAISIE du polygone, origine 'permis', refige = LiDAR courante (42)
    const u = upserts();
    expect(u).toHaveLength(2);
    expect(u[0].params).toEqual(expect.arrayContaining([88.9, 'permis', 42])); // BAT_A → sa cote
    expect(u[1].params).toEqual(expect.arrayContaining([87.1, 'permis', 42])); // BAT_B → sa cote
    expect(majDossier()).toHaveLength(1);
    expect(events().some((e) => /'validation'/i.test(e.sql) || (e.params).includes('validation'))).toBe(true);
  });

  it('DEUX cotes DIFFÉRENTES sur les deux polygones d’un MÊME bâtiment → écrites DISTINCTEMENT (R4 levée, aucun refus)', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A', 'BAT_B'] }] });
    const r = await validerRattachement(11434, 'admin:decision', { BAT_A: 90, BAT_B: 80 });
    expect(r.ok).toBe(true);           // plus de refus R4
    expect(r.nbInjectes).toBe(2);
    const u = upserts();
    expect(u[0].params).toEqual(expect.arrayContaining([90, 'permis'])); // socle haut
    expect(u[1].params).toEqual(expect.arrayContaining([80, 'permis'])); // socle bas — cote DISTINCTE, jamais recopiée
  });

  it('GARDE cardinalité : un bâtiment sans polygone → besoinConfirmation SANS rien écrire ; avec motif → valide + motif tracé', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: [] }] });
    const sansMotif = await validerRattachement(11434, 'admin:decision', { BAT_A: 88.9 });
    expect(sansMotif).toMatchObject({ ok: false, besoinConfirmation: true });
    expect(upserts()).toHaveLength(0); // rien écrit tant que non confirmé
    H.calls.length = 0;
    const avecMotif = await validerRattachement(11434, 'admin:decision', { BAT_A: 88.9 }, 'bâtiments accolés : 2D2 sans polygone propre');
    expect(avecMotif.ok).toBe(true);
    const valEvt = events().find((e) => (e.params).includes('validation'));
    expect(JSON.stringify(valEvt?.params)).toContain('bâtiments accolés'); // motif écrit au dossier (événement)
  });

  it('un polygone SANS cote saisie (champ vide → absent des cotes) n’est PAS injecté, la validation aboutit', async () => {
    H.state.aff = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: ['BAT_B'] }] });
    const r = await validerRattachement(11434, 'admin:decision', { BAT_B: 87.1 }); // BAT_A absent = non injecté
    expect(r.ok).toBe(true);
    expect(r.nbInjectes).toBe(1);
    expect(upserts()[0].params).toEqual(expect.arrayContaining([87.1, 'permis'])); // seul BAT_B
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
