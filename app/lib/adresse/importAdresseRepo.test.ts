import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyserAdresse, deciderRapprochement, type CandidatBan } from './rapprochementBan';

/**
 * 🔴🔴 Arno (20/11/2026, lot 7b) — l'import WIPPIMMO par le module unique : certain → la copropriété de l'adresse officielle (jamais une nouvelle sur une
 * simple écriture) ; plage, commune absente → la file. Les adresses WIPPIMMO ne sont jamais écrites.
 */
const BAN54: CandidatBan = { id: '92026_7184_00054', numero: 54, suffixe: null, nomVoie: 'Avenue Puvis De Chavannes', insee: '92026', commune: 'Courbevoie', x: 1, y: 2 };
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], porteurs: [] as string[], deLEcriture: [] as string[], cleOff: null as null | { id: string; ban_id: string | null },
  cleCopro: '54 avenue puvis de chavannes 92400 courbevoie', reponses: {} as Record<string, unknown>, dispo: true }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT DISTINCT c.id::text FROM gestion_copropriete c')) return { rows: h.porteurs.map((id) => ({ id })) };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1 UNION')) return { rows: h.deLEcriture.map((id) => ({ id })) };
  if (s.startsWith('SELECT id::text, ban_id FROM gestion_copropriete WHERE cle_immeuble')) return { rows: h.cleOff ? [h.cleOff] : [] };
  if (s.startsWith('INSERT INTO gestion_copropriete (')) return { rows: [{ id: '900' }] };
  if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE id')) return { rows: [{ cle: p[0] === '900' ? '54 avenue puvis de chavannes' : h.cleCopro }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id')) return { rows: [] };
  return { rows: [] };
});
vi.mock('./adresseSaisieRepo', () => ({ formatUniqueDisponible: async () => h.dispo }));
const enr = vi.hoisted(() => ({ poses: [] as unknown[] }));
vi.mock('./banRepo', () => ({
  rapprocherBien: async (l: { adresse: string }) => h.reponses[l.adresse],
  enregistrerRapprochement: async (_q: unknown, lot: number, r: { statut: string; ban: { id: string } | null; motif: string }, o: { origine: string }) => {
    enr.poses.push({ lot, statut: r.statut, ban: r.ban?.id ?? null, origine: o.origine, motif: r.motif }); return true; },
}));
import { rapprocherLotsImportes } from './importAdresseRepo';

const certain = { statut: 'certain', motif: 'Adresse retrouvée', ban: { ...BAN54, score: 0.97, libelle: '54 Avenue Puvis De Chavannes', typeContradictoire: false }, score: 0.97,
  propositions: [], analyse: analyserAdresse('54 av. Puvis de Chavannes'), insee: '92026', codePostal: '92400', parcelle: null, texteSource: '54 av. Puvis de Chavannes' };
const lot = (id: number, adresse: string, cp = '92400', commune = 'COURBEVOIE') => ({ id, immeuble: adresse, adresse, codePostal: cp, commune });
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.porteurs = ['276']; h.deLEcriture = []; h.cleOff = null; h.dispo = true; enr.poses = [];
  h.reponses = { '54 av. Puvis de Chavannes': certain,
    '12-14 rue Lucien Jeannin': { ...certain, statut: 'a_verifier', motif: 'Plage de numéros (12-14) : à vérifier', ban: null },
    '1 rue du Préavis': { ...certain, statut: 'introuvable', motif: 'Commune absente de la Base Adresse locale.', ban: null } }; });

describe('la 7e variante du 54 avenue Puvis de Chavannes', () => {
  it('la vraie règle la retrouve avec certitude (« av. » = avenue)', () => {
    const r = deciderRapprochement(analyserAdresse('54 av. Puvis de Chavannes', 'COURBEVOIE'), [BAN54]);
    expect([r.statut, r.ban?.id]).toEqual(['certain', '92026_7184_00054']);
  });
  it('rejoint la MÊME copropriété (n° 276, qui porte l’adresse officielle) : son écriture y est ajoutée, AUCUNE copropriété créée ; journalisé', async () => {
    const b = await rapprocherLotsImportes(q as never, [lot(612, '54 av. Puvis de Chavannes')]);
    expect(b).toMatchObject({ certains: 1, rattaches: 1, coproprietesCreees: 0 });
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete ('))).toBe(false);
    const ajout = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))!;
    expect(ajout.p).toEqual(['276', '54 av puvis de chavannes', '54 av. Puvis de Chavannes', '92400', 'COURBEVOIE', null, 'import WIPPIMMO', '92026_7184_00054']);
    expect(ajout.s).toContain("'ecriture'");
    expect(enr.poses).toEqual([{ lot: 612, statut: 'certain', ban: '92026_7184_00054', origine: 'import_wippimmo', motif: 'Adresse retrouvée' }]);
    expect(ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_journal')).map((x) => x.p[0])).toEqual(['276', 612]);
    expect(ecritures().some((x) => /gestion_annuaire_lot|DELETE/.test(x.s))).toBe(false); // l'adresse WIPPIMMO n'est jamais écrite
  });
});

describe('ce qui n’est pas certain va dans la file', () => {
  it('une plage de numéros : « à vérifier », aucune copropriété touchée', async () => {
    const b = await rapprocherLotsImportes(q as never, [lot(613, '12-14 rue Lucien Jeannin', '92250', 'LA GARENNE COLOMBES')]);
    expect(b).toMatchObject({ aVerifier: 1, rattaches: 0 });
    expect(enr.poses).toEqual([expect.objectContaining({ lot: 613, statut: 'a_verifier' })]);
    expect(ecritures().filter((x) => x.s.includes('gestion_copropriete'))).toEqual([]);
  });
  it('une commune absente de la Base Adresse : « introuvable », aucune copropriété touchée', async () => {
    const b = await rapprocherLotsImportes(q as never, [lot(614, '1 rue du Préavis', '00000', 'TEST')]);
    expect(b).toMatchObject({ introuvables: 1, rattaches: 0 });
    expect(enr.poses).toEqual([expect.objectContaining({ lot: 614, statut: 'introuvable' })]);
    expect(ecritures().filter((x) => x.s.includes('gestion_copropriete'))).toEqual([]);
  });
  it('une adresse officielle que DEUX copropriétés se disputent : rien n’est rattaché, le bien va dans la file', async () => {
    h.deLEcriture = ['301'];
    const b = await rapprocherLotsImportes(q as never, [lot(615, '54 av. Puvis de Chavannes')]);
    expect(b).toMatchObject({ aVerifier: 1, rattaches: 0 });
    expect(enr.poses).toEqual([expect.objectContaining({ lot: 615, statut: 'a_verifier', motif: expect.stringMatching(/plusieurs copropriétés/) })]);
    expect(ecritures().filter((x) => x.s.includes('gestion_copropriete'))).toEqual([]);
  });
});

describe('aucune copropriété ne porte encore l’adresse officielle', () => {
  it('elle est créée SUR L’ADRESSE OFFICIELLE (clé et identifiant BAN officiels), jamais sur l’écriture ; l’écriture en devient une écriture d’origine', async () => {
    h.porteurs = [];
    const b = await rapprocherLotsImportes(q as never, [lot(616, '54 av. Puvis de Chavannes')]);
    expect(b).toMatchObject({ rattaches: 1, coproprietesCreees: 1 });
    const cree = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete ('))!;
    expect(cree.p.slice(0, 4)).toEqual(['54 avenue puvis de chavannes', '54 Avenue Puvis De Chavannes', '92400', 'Courbevoie']);
    expect(cree.p[6]).toBe('92026_7184_00054');
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))!.p.slice(0, 3)).toEqual(['900', '54 av puvis de chavannes', '54 av. Puvis de Chavannes']);
  });
  it('sans la migration 505 : rien', async () => {
    h.dispo = false;
    expect(await rapprocherLotsImportes(q as never, [lot(617, '54 av. Puvis de Chavannes')])).toMatchObject({ rapproches: 0 });
    expect([h.sql, enr.poses]).toEqual([[], []]);
  });
});

describe('l’import l’emploie', () => {
  it('ecrireLots rapproche les biens créés ou dont l’adresse change, après les avoir écrits, dans la même transaction', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    const ecrire = src.slice(src.indexOf('async function ecrireLots('), src.indexOf('async function ecrireTauxHonos('));
    expect(ecrire).toContain("avant === undefined || ['immeuble', 'adresse', 'code_postal', 'commune']");
    expect(ecrire).toContain('await rapprocherLotsImportes(q, aRapprocher);');
  });
});
