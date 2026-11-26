import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (26/11/2026, 12h50, point 1) — « Retirer cette adresse » et « Définir comme adresse principale » : immédiats, journalisés, rien n'est effacé. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], ligne: null as Record<string, unknown> | null, copro: null as Record<string, unknown> | null, fiche: null as unknown }));
const rb = vi.hoisted(() => ({ refus: null as unknown }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (rb.refus !== null && s.startsWith('UPDATE gestion_copropriete SET cle_immeuble')) throw rb.refus;
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_adresse')) return { rows: h.ligne ? [h.ligne] : [] };
  if (s.startsWith('SELECT cle_immeuble AS cle, libelle, code_postal, commune, ban_id FROM gestion_copropriete')) return { rows: h.copro ? [h.copro] : [] };
  if (s.startsWith('SELECT id::text, libelle, code_postal, commune, ban_id, sorte, regroupement_id::text FROM gestion_copropriete_adresse')) return { rows: h.ligne ? [h.ligne] : [] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./coproprieteRepo', () => ({ ficheCopropriete: async () => h.fiche }));
const rg = vi.hoisted(() => ({ appels: [] as unknown[][] }));
vi.mock('./regroupementCoproprietesRepo', () => ({ noterRetraitDAdressesRegroupees: async (_q: unknown, ...a: unknown[]) => { rg.appels.push(a); return []; } }));
import { definirAdressePrincipale, retirerAdresseCopro } from './adresseCoproGestesRepo';
import { MOTIF_PRINCIPALE_NON_RETIRABLE, resumeAdresse, texteRetraitAdresse } from './adresseCoproGestes';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const FICHE = () => ({ cle: '137 rue gerhard', declaree: true, id: 7, libelle: '137 rue Gérhard', codePostal: '92800', commune: 'Puteaux',
  adresses: [{ cle: '137 rue gerhard', libelle: '137 rue Gérhard', codePostal: '92800', commune: 'Puteaux', principale: true },
    { cle: '17 rue voltaire', libelle: '17 rue Voltaire', codePostal: '92800', commune: 'Puteaux', principale: false }],
  digicodes: [{ cle: '17 rue voltaire', voie: '17 rue Voltaire', codePostal: '92800', commune: 'Puteaux', commun: { digicode: true, code: '1701' },
    batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A17' }, { cle: 'cage b', libelle: 'CAGE B', digicode: false, code: null }] }],
  biens: [{ id: 5, numero: 'W5', adresse: '17 rue Voltaire', copropriete: true, cle: '17 rue voltaire' }, { id: 6, numero: 'W6', adresse: '137 rue Gérhard', copropriete: true, cle: '137 rue gerhard' }],
  syndic: { id: 3, nom: 'Cabinet A', ville: 'Puteaux', depuis: '2026-01-01' } });
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.ligne = { id: '40' }; h.copro = null; h.fiche = FICHE(); rg.appels = []; });

describe('« Retirer cette adresse »', () => {
  it('l’adresse principale : refus (« Choisissez d’abord une autre adresse principale »), rien n’est écrit', async () => {
    expect(await retirerAdresseCopro({ immeuble: '137 rue Gérhard', adresseCle: '137 Rue Gérhard' }, AUTEUR)).toEqual({ ok: false, motif: MOTIF_PRINCIPALE_NON_RETIRABLE });
    expect(ecritures()).toEqual([]);
  });
  it('une adresse secondaire : retirée (retire_le, jamais effacée), le regroupement prévenu, le syndic retiré de SES biens, l’historique dit tout', async () => {
    const r = await retirerAdresseCopro({ immeuble: '137 rue Gérhard', adresseCle: '17 rue Voltaire' }, AUTEUR);
    expect(r.ok).toBe(true);
    const e = ecritures();
    expect(e[0].s).toBe('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1');
    expect(rg.appels).toEqual([[['40'], 'depuis la fiche copropriété (« Retirer cette adresse »)', AUTEUR]]);
    expect(e.filter((x) => x.s.includes("'syndic_retire'")).map((x) => x.p[0])).toEqual([5]); // le bien de CETTE adresse seulement
    const j = e.find((x) => x.s.includes("'adresse_retiree'"))!;
    expect(j.p.slice(0, 2)).toEqual([7, '17 rue voltaire']);
    expect(j.p[2]).toBe('Adresse retirée de la copropriété : 17 rue Voltaire, 92800 Puteaux — digicodes et bâtiments partis avec elle : digicode copropriété : code 1701 · '
      + 'bâtiment / cage A : code A17 · bâtiment / cage CAGE B : pas de digicode — biens du portefeuille à cette adresse : n° W5 (17 rue Voltaire)');
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('une adresse qui n’est pas (ou plus) de la copropriété : refus ; une fiche non enregistrée : refus', async () => {
    expect((await retirerAdresseCopro({ immeuble: '137 rue Gérhard', adresseCle: '99 rue ailleurs' }, AUTEUR)).ok).toBe(false);
    h.ligne = null;
    expect(await retirerAdresseCopro({ immeuble: '137 rue Gérhard', adresseCle: '17 rue voltaire' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('rechargez la fiche') });
    h.fiche = { ...FICHE(), declaree: false, id: null };
    expect((await retirerAdresseCopro({ immeuble: '137 rue Gérhard', adresseCle: '17 rue voltaire' }, AUTEUR)).ok).toBe(false);
  });
});

describe('« Définir comme adresse principale »', () => {
  it('la secondaire devient la principale, l’ancienne principale devient une adresse ; journalisé ; dans cet ordre (index uniques)', async () => {
    h.copro = { cle: '137 rue gerhard', libelle: '137 rue Gérhard', code_postal: '92800', commune: 'Puteaux', ban_id: 'B137' };
    h.ligne = { id: '40', libelle: '17 rue Voltaire', code_postal: '92800', commune: 'Puteaux', ban_id: 'B17', sorte: 'adresse', regroupement_id: null };
    expect((await definirAdressePrincipale({ immeuble: '137 rue Gérhard', adresseCle: '17 rue Voltaire' }, AUTEUR)).ok).toBe(true);
    const e = ecritures();
    expect(e.map((x) => x.s.slice(0, 45))).toEqual(['UPDATE gestion_copropriete_adresse SET retire', 'UPDATE gestion_copropriete SET cle_immeuble =',
      'INSERT INTO gestion_copropriete_adresse (copr', 'INSERT INTO gestion_journal (entite, entite_i']);
    expect(e[1].p).toEqual([7, '17 rue voltaire', '17 rue Voltaire', '92800', 'Puteaux', 'B17']);
    expect(e[2].p).toEqual([7, '137 rue gerhard', '137 rue Gérhard', '92800', 'Puteaux', 2, AUTEUR.libelle, 'B137']);
    expect(e[3].p[3]).toBe('Adresse principale : 17 rue Voltaire, 92800 Puteaux (avant : 137 rue Gérhard, 92800 Puteaux, qui reste une adresse de la copropriété)');
  });
  it('🔴 520 : la BASE refuse (la nouvelle principale est devenue l’adresse d’une autre copropriété) : le message clair, pas d’erreur technique', async () => {
    h.copro = { cle: '137 rue gerhard', libelle: '137 rue Gérhard', code_postal: '92800', commune: 'Puteaux', ban_id: 'B137' };
    h.ligne = { id: '40', libelle: '17 rue Voltaire', code_postal: '92800', commune: 'Puteaux', ban_id: 'B17', sorte: 'adresse', regroupement_id: null };
    rb.refus = Object.assign(new Error('Cette adresse appartient déjà à la copropriété _TEST Voisine : « 17 rue Voltaire ». Rien n’est enregistré.'),
      { code: '23505', constraint: 'gestion_copropriete_adresse_exclusive' });
    try {
      expect(await definirAdressePrincipale({ immeuble: '137 rue Gérhard', adresseCle: '17 rue Voltaire' }, AUTEUR))
        .toEqual({ ok: false, motif: 'Cette adresse appartient déjà à la copropriété _TEST Voisine : « 17 rue Voltaire ». Rien n’est enregistré.' });
    } finally { rb.refus = null; }
  });
  it('déjà principale, une écriture d’origine, une adresse de regroupement : refus, rien n’est écrit', async () => {
    expect((await definirAdressePrincipale({ immeuble: '137 rue Gérhard', adresseCle: '137 rue gerhard' }, AUTEUR)).ok).toBe(false);
    h.copro = { cle: '137 rue gerhard', libelle: '137 rue Gérhard', code_postal: '92800', commune: 'Puteaux', ban_id: null };
    h.ligne = { id: '40', libelle: '17 rue Voltaire', code_postal: null, commune: null, ban_id: null, sorte: 'ecriture', regroupement_id: null };
    expect((await definirAdressePrincipale({ immeuble: '137 rue Gérhard', adresseCle: '17 rue voltaire' }, AUTEUR)).ok).toBe(false);
    h.ligne = { ...h.ligne, sorte: 'adresse', regroupement_id: '9' };
    expect((await definirAdressePrincipale({ immeuble: '137 rue Gérhard', adresseCle: '17 rue voltaire' }, AUTEUR)).ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
});

describe('le résumé de ce qui part avec l’adresse (pur)', () => {
  it('sans digicode ni bien : dit tel quel', () => {
    const r = resumeAdresse({ commun: { digicode: null, code: null }, batiments: [] }, []);
    expect(r).toEqual({ digicodes: [], biens: [] });
    expect(texteRetraitAdresse({ libelle: '3 rue X', codePostal: null, commune: null }, r)).toBe('Adresse retirée de la copropriété : 3 rue X — aucun digicode ni bâtiment à cette adresse — aucun bien du portefeuille à cette adresse');
  });
});
