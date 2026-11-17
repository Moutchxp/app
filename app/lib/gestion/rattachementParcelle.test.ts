import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété », lot 5) — « la proposition « Rattacher à la copropriété <nom> — <adresses> ? » à la saisie de
 * l'adresse d'un bien (« Nouveau bien », « Modifier le bien », fiche du bien Gestion), réponse « Non, c'est une autre copropriété » mémorisée pour cette
 * adresse ; le rattachement crée le bloc digicode (vide) de la nouvelle adresse. » 🔒 Base et cadastre simulés : rien n'est écrit en base réelle.
 */
const h = vi.hoisted(() => ({ dejaCopro: false, refusees: [] as string[], avec491: true, sql: [] as { s: string; p: unknown[] }[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT DISTINCT c.id::text, c.cle_immeuble AS cle, c.libelle, c.nom FROM gestion_copropriete c')) {
    const cles = p[0] as string[];
    if (cles.includes('5 rue test deux adresses')) return { rows: h.dejaCopro ? [{ id: '271', cle: '1 rue test deux adresses', libelle: '1 rue _TEST Deux Adresses', nom: '_TEST DEUX ADRESSES' }] : [] };
    return { rows: cles.some((c) => c === '1 rue test deux adresses' || c === '3 rue test deux adresses') ? [{ id: '271', cle: '1 rue test deux adresses', libelle: '1 rue _TEST Deux Adresses', nom: '_TEST DEUX ADRESSES' }] : [] };
  }
  if (s.startsWith('SELECT copropriete_id::text AS id FROM gestion_copropriete_rattachement_refus')) return { rows: h.refusees.map((id) => ({ id })) };
  if (s.startsWith('SELECT libelle, code_postal, commune FROM gestion_copropriete_adresse')) return { rows: [{ libelle: '3 rue _TEST Deux Adresses', code_postal: '92600', commune: 'Asnières-sur-Seine' }] };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec491 }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: ['920040000ZZ999'], adresses: [
  { cle: '1 rue test deux adresses', libelle: '1 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine', parcelle: '920040000ZZ999' },
  { cle: '3 rue test deux adresses', libelle: '3 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine', parcelle: '920040000ZZ999' }] }) }));
const { propositionsRattachement, rattacherAdresse, refuserRattachement } = await import('./rattachementParcelleRepo');
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const CINQ = { libelle: '5 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.dejaCopro = false; h.refusees = []; h.avec491 = true; h.sql = []; });

describe('🔴 la proposition, à la saisie de l’adresse d’un bien', () => {
  it('une adresse voisine sur la parcelle d’une copropriété : « Rattacher à la copropriété _TEST DEUX ADRESSES — 1 rue …, 3 rue … ? » ; LECTURE SEULE', async () => {
    expect(await propositionsRattachement(CINQ)).toEqual([{ coproprieteId: 271, cle: '1 rue test deux adresses', nom: '_TEST DEUX ADRESSES',
      adresses: ['1 rue _TEST Deux Adresses', '3 rue _TEST Deux Adresses'] }]);
    expect(ecritures()).toEqual([]);
  });
  it('une adresse qui appartient DÉJÀ à une copropriété : rien à proposer', async () => {
    h.dejaCopro = true;
    expect(await propositionsRattachement(CINQ)).toEqual([]);
  });
  it('🔴 « Non, c’est une autre copropriété » MÉMORISÉ pour cette adresse : la question ne revient plus', async () => {
    expect(await refuserRattachement({ coproprieteId: 271, adresse: CINQ.libelle, codePostal: '92600', commune: CINQ.commune }, AUTEUR)).toEqual({ ok: true, memorise: true });
    expect(ecritures().map((x) => x.p)).toEqual([['5 rue test deux adresses', 271, 2, 'a.jorel@sansvisavis.com']]);
    h.refusees = ['271'];
    expect(await propositionsRattachement(CINQ)).toEqual([]);
  });
  it('« Rattacher cette adresse » : l’adresse devient une adresse de la copropriété (la même écriture que la fiche Copropriété) — son bloc de digicodes (vide) avec elle', async () => {
    const r = await rattacherAdresse({ coproprieteId: 271, adresse: CINQ.libelle, codePostal: '92600', commune: CINQ.commune }, AUTEUR);
    expect(r).toEqual({ ok: true, message: '5 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine est désormais une adresse de la copropriété _TEST DEUX ADRESSES : son bloc de digicodes (vide) est créé.' });
    expect(ecritures().map((x) => [x.s.slice(0, 47), x.p])).toEqual([["INSERT INTO gestion_copropriete_adresse (coprop", [271, '5 rue test deux adresses', '5 rue _TEST Deux Adresses', '92600', 'Asnières-sur-Seine', 2, 'a.jorel@sansvisavis.com']]]);
  });
  it('une proposition qui n’est plus valable (une autre copropriété, ou adresse déjà rattachée) : refus, rien n’est écrit ; jamais automatiquement', async () => {
    expect((await rattacherAdresse({ coproprieteId: 999, adresse: CINQ.libelle, codePostal: '92600', commune: CINQ.commune }, AUTEUR)).ok).toBe(false);
    h.dejaCopro = true;
    expect((await rattacherAdresse({ coproprieteId: 271, adresse: CINQ.libelle, codePostal: '92600', commune: CINQ.commune }, AUTEUR)).ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('sans la 491 : « Non » n’est pas mémorisé (rien n’est écrit) — l’écran le dit', async () => {
    h.avec491 = false;
    expect(await refuserRattachement({ coproprieteId: 271, adresse: CINQ.libelle, codePostal: '92600', commune: CINQ.commune }, AUTEUR)).toEqual({ ok: true, memorise: false });
    expect(ecritures()).toEqual([]);
  });
});
