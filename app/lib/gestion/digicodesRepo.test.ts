import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (16/11/2026, chantier « Digicodes unifiés », lot 1) — le CHEMIN SERVEUR UNIQUE : refus avant toute écriture, ajout seul, jamais
 * d'écriture dans les anciennes tables. 🔒 Base simulée : aucune lecture ni écriture réelle.
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], lignes: [] as Record<string, unknown>[], immeubles: [] as Record<string, unknown>[],
  lots: [] as Record<string, unknown>[], copros: [] as Record<string, unknown>[], prochainId: 100 }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  h.sql.push({ s, p });
  if (s.startsWith('SELECT id::text, adresse_cle')) return { rows: h.lignes.filter((l) => (p[0] as string[]).includes(l.adresse_cle as string)) };
  if (s.startsWith('SELECT l.id::text, l.wippimmo_id')) return { rows: h.lots };
  if (s.startsWith('SELECT id::text, cle_adresse AS cle')) return { rows: h.immeubles };
  if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp')) return { rows: h.copros };
  if (s.startsWith('INSERT INTO gestion_digicode')) {
    const id = String(h.prochainId++);
    h.lignes.push({ id, adresse_cle: p[0], adresse_libelle: p[1], batiment_cle: p[2], batiment_libelle: p[3], digicode: p[4], code: p[5], applique_le: p[6], nature: p[7], origine: p[8],
      lot_id: p[9] === null ? null : String(p[9]), corrige_id: p[10] === null ? null : String(p[10]), annule_le: null, cree_le: '2026-11-16T10:00:00.000Z', cree_par_libelle: p[12] });
    return { rows: [{ id }] };
  }
  if (s.startsWith('SELECT l.copropriete_batiment_id::text AS id')) return { rows: [{ id: null, libelle: null }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble')) return { rows: [{ id: '7' }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_batiment')) return { rows: [{ id: '40' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../location/digicodeImmeubleRepo', () => ({ digicodeImmeubleDisponible: async () => true, digicodeBatimentDisponible: async () => true }));
import { digicodesDuBien, ecrireDigicode as ecrire, relierBienAuBatiment as relier } from './digicodesRepo';
import type { RequeteTx } from '../db/client';
const ecrireDigicode = (_q: unknown, ...a: Parameters<typeof ecrire> extends [unknown, ...infer R] ? R : never) => ecrire(q as unknown as RequeteTx, ...a);
const relierBienAuBatiment = (_q: unknown, ...a: Parameters<typeof relier> extends [unknown, ...infer R] ? R : never) => relier(q as unknown as RequeteTx, ...a);

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const MAINTENANT = new Date('2026-11-16T10:00:00.000Z');
const BASE = { adresseCle: '12 rue x', adresseLibelle: '12 rue X', batiment: null, origine: 'fiche_copropriete' as const };
const ligne = (o: Record<string, unknown>) => ({ id: String(h.prochainId++), adresse_cle: '12 rue x', adresse_libelle: '12 rue X', batiment_cle: '', batiment_libelle: null, digicode: true, code: 'A1',
  applique_le: '2026-11-01T10:00:00.000Z', nature: 'saisie', origine: 'fiche_copropriete', lot_id: null, corrige_id: null, annule_le: null, cree_le: '2026-11-01T10:00:00.000Z', cree_par_libelle: 'x', ...o });
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.lignes = []; h.immeubles = []; h.copros = []; h.lots = [{ id: '5', numero: 'W5', immeuble: '12 rue X', adresse: '12 rue X', code_postal: '75011', commune: 'Paris', batiment: null, escalier: null, lie: null, digicode: null, code: null }]; });

describe('🔴 les refus, AVANT toute écriture', () => {
  it('« saisie » d’un code déjà connu (base unique OU valeur d’avant) : refus — il faut « Corriger une erreur » ou « Modifier » ; la même valeur : rien', async () => {
    h.lignes = [ligne({})];
    expect(await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'B2' }, nature: 'saisie' }, AUTEUR, MAINTENANT)).toMatchObject({ ok: false, motif: expect.stringContaining('« Corriger une erreur »') });
    expect(await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'a1' }, nature: 'saisie' }, AUTEUR, MAINTENANT)).toEqual({ ok: true, change: false, id: null });
    h.lignes = []; h.immeubles = [{ id: '1', cle: '12 rue x|75011|paris', voie: '12 rue X', digicode: true, code: 'OLD', depuis: null }];
    expect((await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'B2' }, nature: 'saisie' }, AUTEUR, MAINTENANT)).ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('« correction » sans code en vigueur ; « changement » à une date passée, ou quand un changement est déjà prévu ; « arbitrage » sans divergence : refus', async () => {
    expect((await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'B2' }, nature: 'correction' }, AUTEUR, MAINTENANT)).ok).toBe(false);
    h.lignes = [ligne({})];
    expect(await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'B2' }, nature: 'changement', appliqueLe: '2026-11-15T10:00:00.000Z' }, AUTEUR, MAINTENANT))
      .toMatchObject({ ok: false, motif: expect.stringContaining('à venir') });
    h.lignes.push(ligne({ code: 'C3', nature: 'changement', applique_le: '2026-11-20T08:00:00.000Z' }));
    expect(await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'D4' }, nature: 'changement', appliqueLe: '2026-11-25T08:00:00.000Z' }, AUTEUR, MAINTENANT))
      .toMatchObject({ ok: false, motif: expect.stringContaining('déjà prévu') });
    expect((await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'A1' }, nature: 'arbitrage' }, AUTEUR, MAINTENANT)).ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('🔒 les anciennes tables ne sont JAMAIS écrites par ce chemin', async () => {
    await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'A1' }, nature: 'saisie', lotId: 5 }, AUTEUR, MAINTENANT);
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE).*(gestion_immeuble|digicode_code|SET digicode)/.test(x.s))).toBe(false);
  });
});

describe('les écritures : une ligne AJOUTÉE, rien de modifié', () => {
  it('première saisie : appliquée tout de suite ; depuis un bien : une ligne au journal du bien', async () => {
    const r = await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: '57B83' }, nature: 'saisie', origine: 'fiche_bien', lotId: 5 }, AUTEUR, MAINTENANT);
    expect(r).toMatchObject({ ok: true, change: true });
    const ins = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_digicode'))!;
    expect(ins.p.slice(0, 9)).toEqual(['12 rue x', '12 rue X', '', null, true, '57B83', MAINTENANT.toISOString(), 'saisie', 'fiche_bien']);
    expect(ecritures().find((x) => x.s.includes("'digicode'"))?.p.slice(0, 3)).toEqual([5, 'non renseigné', 'oui · code 57B83']);
  });
  it('correction d’un code de la base unique : MÊME date d’application que la ligne corrigée, reliée à elle ; l’ancienne ligne reste', async () => {
    h.lignes = [ligne({ id: '9' })];
    await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'A7' }, nature: 'correction' }, AUTEUR, MAINTENANT);
    const ins = ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_digicode'));
    expect(ins.map((x) => [x.p[5], x.p[6], x.p[7], x.p[10]])).toEqual([['A7', '2026-11-01T10:00:00.000Z', 'correction', 9]]);
    expect(h.lignes).toHaveLength(2);
  });
  it('correction d’une valeur d’AVANT : elle entre d’abord dans la base unique (« reprise ») pour que l’historique dise avant → après', async () => {
    h.immeubles = [{ id: '1', cle: '12 rue x|75011|paris', voie: '12 rue X', digicode: true, code: 'OLD', depuis: '2026-10-01T00:00:00.000Z' }];
    await ecrireDigicode(q, { ...BASE, valeur: { digicode: true, code: 'NEW' }, nature: 'correction' }, AUTEUR, MAINTENANT);
    expect(ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_digicode')).map((x) => [x.p[5], x.p[7], x.p[8]])).toEqual([['OLD', 'reprise', 'reprise'], ['NEW', 'correction', 'fiche_copropriete']]);
  });
  it('changement à une date à venir ; un nouveau bâtiment entre au registre de la copropriété ; le lien sûr d’un bien vers son bâtiment', async () => {
    h.lignes = [ligne({ batiment_cle: 'b', batiment_libelle: 'B' })];
    const r = await ecrireDigicode(q, { ...BASE, batiment: 'Bât. B', valeur: { digicode: true, code: 'B2' }, nature: 'changement', appliqueLe: '2026-11-20T08:00:00.000Z',
      copropriete: { cle: '12 rue x', libelle: '12 rue X', codePostal: '75011', commune: 'Paris' } }, AUTEUR, MAINTENANT);
    expect(r.ok).toBe(true);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_digicode'))?.p.slice(2, 8)).toEqual(['b', 'B', true, 'B2', '2026-11-20T08:00:00.000Z', 'changement']);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment'))).toBe(true);
    h.sql = [];
    expect(await relierBienAuBatiment(q, 5, { cle: '12 rue x', libelle: '12 rue X', codePostal: '75011', commune: 'Paris' }, 'B', AUTEUR)).toMatchObject({ ok: true });
    expect(ecritures().find((x) => x.s.startsWith('UPDATE gestion_annuaire_lot SET copropriete_batiment_id'))?.p).toEqual([5, 40]);
  });
});

describe('🔴🔴 (lot 2) la CLÉ UNIQUE : un code saisi dans la fiche Copropriété se lit sur chacun de ses biens', () => {
  const COPRO = { id: '7', cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', cp: '75011', commune: 'Paris' };
  const BIEN = { id: '5', numero: 'W5', immeuble: 'Résidence Les Tilleuls', adresse: '12 rue des Lilas', code_postal: '75011', commune: 'Paris', batiment: 'B', escalier: null, lie: null, digicode: null, code: null };
  it('CE QUI MANQUAIT : la fiche Copropriété écrivait sous son libellé, le bien lisait sous son adresse postale — désormais la même place', async () => {
    h.copros = [COPRO]; h.lots = [BIEN];
    h.immeubles = [{ id: '1', cle: 'residence les tilleuls|75011|paris', voie: 'Résidence Les Tilleuls', digicode: true, code: '4321', depuis: null }];
    const d = (await digicodesDuBien(5, MAINTENANT, q as never))!;
    expect([d.adresseCle, d.commun?.valeur.code, d.commun?.source, d.batiment?.libelle]).toEqual(['residence les tilleuls', '4321', 'ancien', 'B']);
  });
  it('un code de la base unique à la place de la copropriété : lu en vigueur, avec le changement prévu', async () => {
    h.copros = [COPRO]; h.lots = [BIEN];
    h.lignes = [ligne({ adresse_cle: 'residence les tilleuls', batiment_cle: 'b', batiment_libelle: 'B', code: 'B1' }),
      ligne({ adresse_cle: 'residence les tilleuls', batiment_cle: 'b', batiment_libelle: 'B', code: 'B2', nature: 'changement', applique_le: '2026-11-20T08:00:00.000Z' })];
    const d = (await digicodesDuBien(5, MAINTENANT, q as never))!;
    expect([d.codeBatiment?.valeur.code, d.codeBatiment?.source, d.aVenir.map((x) => [x.batiment, x.valeur.code, x.appliqueLe])]).toEqual(['B1', 'unifie', [['B', 'B2', '2026-11-20T08:00:00.000Z']]]);
    expect((await digicodesDuBien(5, new Date('2026-11-21T00:00:00.000Z'), q as never))?.codeBatiment?.valeur.code).toBe('B2');
  });
});
