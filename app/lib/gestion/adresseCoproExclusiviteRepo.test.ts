import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (26/11/2026, 12h50, point 2) — le conflit d'adresse entre deux copropriétés : la lecture, et le déplacement (journalisé des deux côtés). */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], porteurs: [] as Record<string, unknown>[], ligne: true, fiche: null as unknown }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT c.id::text AS copro')) return { rows: h.porteurs };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_adresse')) return { rows: h.ligne ? [{ id: '55' }] : [] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('./coproprieteRepo', () => ({ ficheCopropriete: async () => h.fiche }));
const rg = vi.hoisted(() => ({ appels: [] as unknown[][] }));
vi.mock('./regroupementCoproprietesRepo', () => ({ noterRetraitDAdressesRegroupees: async (_q: unknown, ...a: unknown[]) => { rg.appels.push(a); return []; } }));
import { conflitDeLAdresse, deplacerAdresse } from './adresseCoproExclusiviteRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const PORTEUR = (o: Record<string, unknown>) => ({ copro: '9', cle_copro: '38 rue baudin', libelle_copro: '38 rue Baudin', nom: '_TEST Copro Baudin', ligne: '55',
  cle: '40 bis rue baudin courbevoie', libelle: '40 bis Rue Baudin COURBEVOIE', code_postal: '92400', commune: 'Courbevoie', ban_id: null, ...o });
const AUTRE = { cle: '38 rue baudin', syndic: { id: 4, nom: 'Cabinet B', ville: 'Lyon' },
  digicodes: [{ cle: '40 bis rue baudin courbevoie', commun: { digicode: true, code: '4040' }, batiments: [{ libelle: 'A', digicode: true, code: 'A40' }] }],
  biens: [{ id: 12, numero: 'W12', adresse: '40 bis rue Baudin', cle: '40 bis rue baudin courbevoie' }] };
beforeEach(() => { h.sql = []; h.porteurs = []; h.ligne = true; h.fiche = AUTRE; rg.appels = []; });

describe('la lecture du conflit', () => {
  it('« 40bis rue Baudin Courbevoie » = « 40 bis Rue Baudin COURBEVOIE » d’une AUTRE copropriété (code postal compatible) : le conflit, ce qui partirait, ses biens', async () => {
    h.porteurs = [PORTEUR({})];
    const c = await conflitDeLAdresse(q as never, { coproId: 7, coproCle: '137 rue gerhard' }, { libelle: '40bis rue Baudin Courbevoie', codePostal: '92400' });
    expect(c).toEqual({ cle: '40 bis rue baudin courbevoie', ecrite: '40 bis Rue Baudin COURBEVOIE, 92400',
      copropriete: { id: 9, cle: '38 rue baudin', libelle: '38 rue Baudin', nom: '_TEST Copro Baudin', syndic: 'Cabinet B / Lyon' }, principale: false,
      biens: ['n° W12 (40 bis rue Baudin)'], digicodes: ['digicode copropriété : code 4040', 'bâtiment / cage A : code A40'] });
    // celle-ci est exclue de la recherche (par son identifiant et par sa clé)
    expect(h.sql[0].p).toEqual([7, '137 rue gerhard']);
    expect(h.sql[0].s).toContain('WHERE a.retire_le IS NULL');
  });
  it('un autre code postal : pas de conflit ; la même adresse officielle (BAN) : conflit ; l’adresse principale de l’autre : « principale »', async () => {
    h.porteurs = [PORTEUR({})];
    expect(await conflitDeLAdresse(q as never, { coproId: 7, coproCle: 'x' }, { libelle: '40 bis rue Baudin Courbevoie', codePostal: '75011' })).toBeNull();
    h.porteurs = [PORTEUR({ libelle: '40 bis r Baudin', cle: '40 bis r baudin', ban_id: '92026_0420_00040_bis' })];
    expect((await conflitDeLAdresse(q as never, { coproId: 7, coproCle: 'x' }, { libelle: '40 bis rue Baudin', codePostal: '92400', banId: '92026_0420_00040_bis' }))?.cle).toBe('40 bis r baudin');
    h.porteurs = [PORTEUR({ ligne: null })];
    expect((await conflitDeLAdresse(q as never, { coproId: 7, coproCle: 'x' }, { libelle: '40 bis rue Baudin Courbevoie', codePostal: '92400' }))?.principale).toBe(true);
    h.porteurs = [];
    expect(await conflitDeLAdresse(q as never, { coproId: null, coproCle: 'x' }, { libelle: '40 bis rue Baudin Courbevoie' })).toBeNull();
  });
});

describe('le déplacement confirmé', () => {
  const C = { cle: '40 bis rue baudin courbevoie', ecrite: '40 bis Rue Baudin, 92400 Courbevoie', copropriete: { id: 9, cle: '38 rue baudin', libelle: '38 rue Baudin', nom: '_TEST Copro Baudin', syndic: 'Cabinet B / Lyon' },
    principale: false, biens: ['n° W12 (40 bis rue Baudin)'], digicodes: ['digicode copropriété : code 4040'] };
  it('retirée de l’autre (jamais effacée), regroupement prévenu, syndic retiré de ses biens, bâtiments repris, les DEUX historiques le notent', async () => {
    await deplacerAdresse(q as never, C, { id: '7', libelle: '_TEST Copro Rattachement' }, AUTEUR);
    const e = h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
    expect(e[0]).toEqual({ s: 'UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', p: ['55', AUTEUR.libelle] });
    expect(rg.appels).toEqual([[['55'], 'depuis la fiche copropriété (déplacée vers _TEST Copro Rattachement)', AUTEUR]]);
    expect(e.filter((x) => x.s.includes("'syndic_retire'")).map((x) => x.p[0])).toEqual([12]);
    expect(e.find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment'))?.p).toEqual(['7', 9, 2, AUTEUR.libelle, '40 bis rue baudin courbevoie']);
    const cedee = e.find((x) => x.s.includes("'adresse_cedee'"))!; const reprise = e.find((x) => x.s.includes("'adresse_reprise'"))!;
    expect([cedee.p[0], cedee.p[2]]).toEqual([9, 'Adresse retirée de la copropriété : 40 bis Rue Baudin, 92400 Courbevoie, rattachée à la copropriété _TEST Copro Rattachement — digicodes et bâtiments partis avec elle : digicode copropriété : code 4040']);
    expect([reprise.p[0], reprise.p[2]]).toEqual(['7', 'Adresse reprise de la copropriété _TEST Copro Baudin (syndic Cabinet B / Lyon) : 40 bis Rue Baudin, 92400 Courbevoie — digicodes et bâtiments partis avec elle : digicode copropriété : code 4040']);
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('déjà partie entre-temps : rien n’est écrit', async () => {
    h.ligne = false;
    await deplacerAdresse(q as never, C, { id: '7', libelle: 'X' }, AUTEUR);
    expect(h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s))).toEqual([]);
  });
});
