import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (19/11/2026) — regrouper les copropriétés en double : refus avant toute écriture, adresses secondaires, réversible, jamais d'effacement. */
const h = vi.hoisted(() => ({
  sql: [] as { s: string; p: unknown[] }[], avec504: true, prises: [] as { cle: string }[], syndic: null as null | { nom: string; ville: string | null },
  ignorees: [] as { signature: string }[], regroupement: [] as Record<string, unknown>[], adressesDuRegroupement: [] as { id: string; cle: string; libelle: string }[],
  parcelles: new Map<string, string>(),
  lignes: [] as Record<string, unknown>[],
  lots: [
    { id: '1', immeuble: '54 avenue Puvis de Chavannes', adresse: '54 avenue Puvis de Chavannes' },
    { id: '2', immeuble: '54 Avneue Puvis de Chavannes', adresse: '54 Avenue Puvis de Chavannes' },
    { id: '3', immeuble: '54 avenue Puvis de Chavannes (HARY)', adresse: '54 avenue Puvis de Chavannes' },
    { id: '4', immeuble: '56 avenue Puvis de Chavannes', adresse: '56 avenue Puvis de Chavannes' },
  ],
}));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT DISTINCT signature FROM gestion_copropriete_doublon_ignore')) return { rows: h.ignorees };
  if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE cle_immeuble = ANY')) return { rows: h.prises };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1')) return { rows: [{ id: '70' }] };
  if (s.startsWith('INSERT INTO gestion_copropriete_regroupement')) return { rows: [{ id: '5' }] };
  if (s.startsWith('SELECT s.nom, s.ville FROM gestion_copropriete_syndic')) return { rows: h.syndic ? [h.syndic] : [] };
  if (s.startsWith('SELECT id::text, immeuble, adresse FROM gestion_annuaire_lot')) return { rows: h.lots };
  if (s.startsWith('SELECT r.copropriete_id::text AS copro')) return { rows: h.regroupement };
  if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE regroupement_id')) return { rows: h.adressesDuRegroupement };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec504 }));
vi.mock('./coproprieteRepo', () => ({ listerCoproprietes: async () => h.lignes }));
vi.mock('./parcelleRepo', () => ({ parcellesDesAdresses: async () => h.parcelles }));
import { cleImmeuble } from './syndics';
import { degrouper, ignorerProposition, MOTIF_SANS_504, propositionsDeLaListe, regrouper } from './regroupementCoproprietesRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ligne = (immeuble: string, nbBiens: number, o: Record<string, unknown> = {}) => ({ immeuble, cle: cleImmeuble(immeuble), nom: immeuble, adresses: [immeuble],
  syndic: null, nbBiens, hors: false, declaree: false, codePostal: '92400', commune: 'Courbevoie', ...o });
const P = '54 avenue Puvis de Chavannes';
const A = '54 Avneue Puvis de Chavannes';
const H = '54 avenue Puvis de Chavannes (HARY)';
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => {
  h.sql = []; h.avec504 = true; h.prises = []; h.syndic = null; h.ignorees = []; h.regroupement = []; h.adressesDuRegroupement = []; h.parcelles = new Map();
  h.lignes = [ligne(P, 39), ligne(A, 1), ligne(H, 4), ligne('56 avenue Puvis de Chavannes', 2)];
});

describe('les propositions de la liste', () => {
  it('les écritures du 54 sont proposées ensemble (le 56 non) ; une parcelle différente sépare ; « Ignorer » les retire', async () => {
    const [p] = await propositionsDeLaListe();
    expect(p.cles).toEqual([P, A, H].map(cleImmeuble).sort());
    expect(p.principale).toBe(cleImmeuble(P));
    expect(p.fiches.map((f) => f.immeuble).sort()).toEqual([P, A, H].sort());
    // la parcelle : lue pour l'écriture nettoyée (« (HARY) » → la même que P) ; « Avneue » sur une autre parcelle n'est plus proposée avec elles
    h.parcelles = new Map([[cleImmeuble(P), '92026000AB0001'], [cleImmeuble(A), '92026000AB0002']]);
    expect((await propositionsDeLaListe()).map((x) => x.cles)).toEqual([[P, H].map(cleImmeuble).sort()]);
    h.parcelles = new Map();
    h.ignorees = [{ signature: p.signature }];
    expect(await propositionsDeLaListe()).toEqual([]);
    expect(ecritures()).toEqual([]);
  });
});

describe('Regrouper', () => {
  it('les autres écritures deviennent des adresses secondaires de la principale, marquées par le regroupement ; une ligne d’historique par bien qui la rejoint', async () => {
    h.syndic = { nom: 'Cabinet A', ville: 'Paris' };
    const r = await regrouper({ principale: P, cles: [P, A, H] }, AUTEUR);
    expect(r).toMatchObject({ ok: true, id: 5 });
    expect(r.ok && r.message).toBe(`Regroupé : « ${A} », « ${H} » deviennent des adresses de la copropriété ${P}, 92400 Courbevoie ; 5 biens la rejoignent, avec son syndic Cabinet A / Paris.`);
    const w = ecritures();
    expect(w[0].s).toMatch(/^INSERT INTO gestion_copropriete \(cle_immeuble/);
    expect(w[0].p.slice(0, 2)).toEqual([cleImmeuble(P), P]);
    expect(w[1].s).toMatch(/^INSERT INTO gestion_copropriete_regroupement/);
    expect(w[1].p).toEqual(['70', P, [A, H], 2, AUTEUR.libelle]);
    const adresses = w.filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'));
    expect(adresses.map((x) => [x.p[1], x.p[2], x.p[7]])).toEqual([[cleImmeuble(A), A, '5'], [cleImmeuble(H), H, '5']]);
    const journal = w.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));
    expect(journal.map((x) => [x.p[0], x.p[1]])).toEqual([['2', 'copropriete_regroupee'], ['3', 'copropriete_regroupee']]);
    expect(String(journal[0].p[4])).toContain('(syndic : Cabinet A / Paris)');
    // 🔴 les adresses des biens et les données WIPPIMMO ne sont jamais touchées ; rien n'est effacé
    expect(w.some((x) => /gestion_annuaire_lot|DELETE/.test(x.s))).toBe(false);
  });
  it('refus AVANT toute écriture : sans la 504, moins de deux fiches, principale hors cochées, fiche disparue, écriture déjà enregistrée ou déjà prise', async () => {
    h.avec504 = false;
    expect(await regrouper({ principale: P, cles: [P, A] }, AUTEUR)).toEqual({ ok: false, motif: MOTIF_SANS_504 });
    h.avec504 = true;
    expect(await regrouper({ principale: P, cles: [P] }, AUTEUR)).toMatchObject({ ok: false, motif: 'Cochez au moins deux fiches à regrouper.' });
    expect(await regrouper({ principale: H, cles: [P, A] }, AUTEUR)).toMatchObject({ ok: false });
    expect(await regrouper({ principale: P, cles: [P, '54 rue Inconnue'] }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/rechargez la page/) });
    h.lignes = [ligne(P, 39), ligne(A, 1, { declaree: true })];
    expect(await regrouper({ principale: P, cles: [P, A] }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/a déjà sa fiche enregistrée/) });
    h.lignes = [ligne(P, 39), ligne(A, 1)]; h.prises = [{ cle: cleImmeuble(A) }];
    expect(await regrouper({ principale: P, cles: [P, A] }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/déjà une copropriété ou l’adresse/) });
    expect(ecritures()).toEqual([]);
  });
});

describe('Dégrouper', () => {
  it('les adresses du regroupement sont RETIRÉES (jamais effacées), le regroupement clos ; l’historique de chaque bien, et le syndic retiré s’il y en a un', async () => {
    h.regroupement = [{ copro: '70', principale: P, cle: cleImmeuble(P), cp: '92400', commune: 'Courbevoie' }];
    h.adressesDuRegroupement = [{ id: '11', cle: cleImmeuble(A), libelle: A }, { id: '12', cle: cleImmeuble(H), libelle: H }];
    h.syndic = { nom: 'Cabinet A', ville: null };
    const r = await degrouper({ id: 5 }, AUTEUR);
    expect(r.ok && r.message).toBe(`Dégroupé : « ${A} », « ${H} » ne sont plus des adresses de la copropriété ${P}, 92400 Courbevoie ; elles redeviennent leurs propres fiches.`);
    const w = ecritures();
    expect(w[0]).toMatchObject({ s: expect.stringMatching(/^UPDATE gestion_copropriete_adresse SET retire_le = now\(\)/), p: [['11', '12'], AUTEUR.libelle] });
    expect(w[1].s).toMatch(/^UPDATE gestion_copropriete_regroupement SET degroupe_le = now\(\)/);
    expect(w.filter((x) => x.s.startsWith('INSERT INTO gestion_journal')).map((x) => [x.p[0], x.s.includes("'syndic_retire'") ? 'syndic_retire' : x.p[1]]))
      .toEqual([['2', 'copropriete_degroupee'], ['2', 'syndic_retire'], ['3', 'copropriete_degroupee'], ['3', 'syndic_retire']]);
    expect(w.some((x) => /DELETE|gestion_annuaire_lot/.test(x.s))).toBe(false);
  });
  it('un regroupement inconnu ou déjà dégroupé : refus, rien d’écrit', async () => {
    expect(await degrouper({ id: 5 }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/déjà été dégroupé/) });
    expect(await degrouper({ id: 'x' }, AUTEUR)).toEqual({ ok: false, motif: 'Regroupement non désigné.' });
    expect(ecritures()).toEqual([]);
  });
});

describe('Ignorer', () => {
  it('mémorise la signature (clés triées), qui et quand', async () => {
    expect(await ignorerProposition({ cles: [H, P] }, AUTEUR)).toEqual({ ok: true });
    const [w] = ecritures();
    expect(w.s).toMatch(/^INSERT INTO gestion_copropriete_doublon_ignore/);
    expect(w.p).toEqual([[cleImmeuble(P), cleImmeuble(H)].sort().join(' | '), [cleImmeuble(P), cleImmeuble(H)].sort(), 2, AUTEUR.libelle]);
    expect(await ignorerProposition({ cles: [P] }, AUTEUR)).toEqual({ ok: false, motif: 'Proposition non désignée.' });
  });
});
