import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (20/11/2026, lot 6) — la file « Adresses à vérifier » : chaque geste tracé, journalisé, réversible ; refus avant toute écriture. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], lots: [] as Record<string, unknown>[], porteurs: [] as { id: string; cle: string }[],
  propre: null as null | { id: string; ban_id: string | null }, sec: null as null | Record<string, unknown>, copro: { cle: '15 rue cavallotti', ban_id: 'B15' } as Record<string, unknown>, op: null as null | Record<string, unknown> }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT lo.id::text, lo.immeuble')) return { rows: h.lots };
  if (s.startsWith('INSERT INTO gestion_adresse_operation (')) return { rows: [{ id: '7' }] };
  if (s.startsWith("SELECT plan->>'source' AS source")) return { rows: h.op ? [h.op] : [] };
  if (s.startsWith('SELECT id::text FROM gestion_lot_adresse_ban WHERE lot_id')) return { rows: [{ id: `r${p[0]}` }] };
  if (s.startsWith('SELECT DISTINCT c.id::text, c.cle_immeuble AS cle FROM gestion_copropriete c')) return { rows: h.porteurs };
  if (s.startsWith('SELECT id::text, ban_id FROM gestion_copropriete WHERE cle_immeuble')) return { rows: h.propre ? [h.propre] : [] };
  if (s.startsWith('SELECT id::text, copropriete_id::text AS copro, ban_id, sorte FROM gestion_copropriete_adresse')) return { rows: h.sec ? [h.sec] : [] };
  if (s.startsWith('INSERT INTO gestion_copropriete (')) return { rows: [{ id: '500' }] };
  if (s.startsWith('SELECT cle_immeuble AS cle, ban_id FROM gestion_copropriete WHERE id')) return { rows: [h.copro] };
  if (s.startsWith('INSERT INTO gestion_copropriete_adresse')) return { rows: [{ id: '90' }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND ban_id')) return { rows: [] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
const cand = (id: string, numero: number, nomVoie: string) => ({ id, numero, suffixe: null, nomVoie, insee: '75116', commune: 'Paris 16e Arrondissement', x: 1, y: 2 });
const ann = vi.hoisted(() => ({ appels: [] as number[] }));
vi.mock('./banRepo', () => ({
  rapprocherBien: async () => ({ statut: 'a_verifier', motif: 'Plage de numéros (33-35)', ban: { ...cand('75116_7300_00033', 33, 'Rue Pergolèse'), score: 1, libelle: '33 Rue Pergolèse', typeContradictoire: false }, codePostal: '75116',
    propositions: [{ ...cand('75116_7300_00033', 33, 'Rue Pergolèse'), score: 1, libelle: '33 Rue Pergolèse', typeContradictoire: false }] }),
  rapprocherAdresse: async (a: { texte: string }) => (a.texte.includes('Longchamp') ? { statut: 'certain', ban: { ...cand('92051_5560_00030', 30, 'Rue de Longchamp'), score: 1 } } : { statut: 'introuvable', ban: null, motif: 'Commune absente' }),
  adresseBanParId: async (id: string) => (id === 'inconnu' ? null : cand(id, Number(id.slice(-2)), 'Rue Pergolèse')),
  adressesDeLaPlage: async () => [cand('75116_7300_00033', 33, 'Rue Pergolèse'), cand('75116_7300_00034', 34, 'Rue Pergolèse'), cand('75116_7300_00035', 35, 'Rue Pergolèse')],
  enregistrerRapprochement: async (qq: typeof q, lot: number, r: { ban: { id: string } | null }, o: { statut: string; operationId: number }) => { await qq('INSERT INTO gestion_lot_adresse_ban …', [lot, r.ban?.id ?? null, o.statut, o.operationId]); return true; },
  parcelleDuPoint: async () => '75116000AB0001',
}));
vi.mock('./unificationApplicationRepo', async (orig) => ({ ...(await orig<object>()), annulerUnification: async (_q: unknown, id: number) => { ann.appels.push(id); return {}; } }));
import { annulerChoix, compteAVerifier, fileAVerifier, gesteFile } from './fileVerificationRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const lot = (id: string, immeuble: string, cp = '75116', commune = 'Paris', statut = 'a_verifier') => ({ id, immeuble, adresse: immeuble, code_postal: cp, commune, statut, motif: '' });
const cle = (immeuble: string, cp = '75116', commune = 'Paris') => JSON.stringify([immeuble, cp, commune]);
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.op = null; h.copro = { cle: '15 rue cavallotti', ban_id: 'B15' }; h.porteurs = []; h.propre = null; h.sec = null; ann.appels = [];
  h.lots = [lot('1', '33-35 rue Pergolèse 75116 Paris'), lot('2', '33-35 rue Pergolèse 75116 Paris'), lot('3', '15 rue Cavalotti', '75018', 'Paris')]; });

describe('la file', () => {
  it('une ligne par écriture, triée par nombre de biens ; le motif, les propositions avec leur ressemblance ; la plage et ses adresses officielles du MÊME CÔTÉ (33-35 : pas le 34) ; le compteur', async () => {
    const f = await fileAVerifier();
    expect(f.map((x) => [x.ecriture, x.lots])).toEqual([['33-35 rue Pergolèse 75116 Paris', [1, 2]], ['15 rue Cavalotti', [3]]]);
    expect(f[0].propositions).toEqual([{ banId: '75116_7300_00033', libelle: '33 rue Pergolèse, 75116 Paris 16e Arrondissement', score: 1 }]);
    expect(f[0].plage?.adresses.map((a) => a.banId)).toEqual(['75116_7300_00033', '75116_7300_00035']);
    expect(await compteAVerifier()).toBe(2);
  });
});

describe('les gestes', () => {
  it('a) valider : chaque bien reçoit un rapprochement « validé » (le précédent fermé, tracé), une ligne d’historique ; la copropriété de l’adresse reçoit l’écriture d’origine', async () => {
    h.lots = [lot('3', '15 rue Cavalotti', '75018', 'Paris')];
    h.porteurs = [{ id: '40', cle: '15 rue cavallotti' }];
    const r = await gesteFile({ geste: 'valider', cle: cle('15 rue Cavalotti', '75018'), banId: '75116_7300_00015' }, AUTEUR);
    expect(r).toMatchObject({ ok: true, operationId: 7 });
    const w = ecritures();
    expect(w[0].s).toMatch(/^INSERT INTO gestion_adresse_operation \(/);
    expect(JSON.parse(w[0].p[0] as string)).toMatchObject({ source: 'file_verification', geste: 'valider', ecriture: '15 rue Cavalotti', lots: [3] });
    expect(w.find((x) => x.s.startsWith('INSERT INTO gestion_lot_adresse_ban'))?.p).toEqual([3, '75116_7300_00015', 'valide', 7]);
    expect(w.filter((x) => x.s.startsWith('INSERT INTO gestion_adresse_operation_trace')).map((x) => x.p.slice(1, 4))).toEqual([['gestion_lot_adresse_ban', 'r3', 'fin'], ['gestion_copropriete_adresse', '90', null]]);
    expect(w.find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))?.p.slice(0, 3)).toEqual(['40', '15 rue cavalotti', '15 rue Cavalotti']);
    expect(w.filter((x) => x.s.startsWith('INSERT INTO gestion_journal')).map((x) => x.p[0])).toEqual(['3', '40']);
    expect(w.some((x) => /DELETE|gestion_annuaire_lot/.test(x.s))).toBe(false);
  });
  it('b) une autre adresse (l’auto-complétion unique) : rapprochée par le module ; non retrouvée avec certitude : refus, rien n’est écrit', async () => {
    h.lots = [lot('4', '30 rue Lonchamp', '92200', 'Neuilly-sur-Seine')];
    expect(await gesteFile({ geste: 'autre', cle: cle('30 rue Lonchamp', '92200', 'Neuilly-sur-Seine'), adresse: { voie: '30 Rue de Longchamp', codePostal: '92200', commune: 'Neuilly-sur-Seine' } }, AUTEUR)).toMatchObject({ ok: true });
    h.sql = [];
    expect(await gesteFile({ geste: 'autre', cle: cle('30 rue Lonchamp', '92200', 'Neuilly-sur-Seine'), adresse: { voie: '1 rue Nulle part', codePostal: '77000', commune: 'Melun' } }, AUTEUR)).toMatchObject({ ok: false });
    expect(ecritures()).toEqual([]);
  });
  it('c) plusieurs adresses (une plage) : sans copropriété, elle est créée ; chaque adresse officielle choisie en devient une adresse', async () => {
    h.copro = { cle: '33 35 rue pergolese 75116 paris', ban_id: '75116_7300_00033' };
    const r = await gesteFile({ geste: 'plusieurs', cle: cle('33-35 rue Pergolèse 75116 Paris'), banIds: ['75116_7300_00033', '75116_7300_00035'] }, AUTEUR);
    expect(r).toMatchObject({ ok: true, message: '« 33-35 rue Pergolèse 75116 Paris » (2 biens) : 33 rue Pergolèse, 75116 Paris 16e Arrondissement · 35 rue Pergolèse, 75116 Paris 16e Arrondissement.' });
    const w = ecritures();
    expect(w.find((x) => x.s.startsWith('INSERT INTO gestion_copropriete ('))?.p.slice(0, 2)).toEqual(['33 35 rue pergolese 75116 paris', '33-35 rue Pergolèse 75116 Paris']);
    expect(w.filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse')).map((x) => x.p[7])).toEqual(['75116_7300_00035']);
    expect(w.filter((x) => x.s.startsWith('INSERT INTO gestion_lot_adresse_ban'))).toHaveLength(2);
  });
  it('d) hors périmètre : la raison est obligatoire ; avec elle, un rapprochement « refusé » sans adresse, aucun rattachement', async () => {
    expect(await gesteFile({ geste: 'hors', cle: cle('15 rue Cavalotti', '75018'), raison: '  ' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/obligatoire/) });
    expect(ecritures()).toEqual([]);
    expect(await gesteFile({ geste: 'hors', cle: cle('15 rue Cavalotti', '75018'), raison: 'fiche d’essai' }, AUTEUR)).toMatchObject({ ok: true });
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_lot_adresse_ban'))?.p).toEqual([3, null, 'refuse', 7]);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete'))).toBe(false);
  });
  it('refus avant toute écriture : écriture déjà traitée ; deux copropriétés enregistrées pour la même adresse (la réunion n’est pas faite d’ici)', async () => {
    expect(await gesteFile({ geste: 'valider', cle: cle('nulle part'), banId: 'x' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/plus à vérifier/) });
    h.lots = [lot('3', '15 rue Cavalotti', '75018', 'Paris')]; h.porteurs = [{ id: '40', cle: 'a' }, { id: '41', cle: 'b' }];
    expect(await gesteFile({ geste: 'valider', cle: cle('15 rue Cavalotti', '75018'), banId: '75116_7300_00015' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringMatching(/AUTRE copropriété/) });
  });
});

describe('annuler ce choix', () => {
  it('la passe du choix est annulée (le module de passe : rapprochement rouvert, ajouts retirés) ; l’historique de chaque bien le dit', async () => {
    h.op = { source: 'file_verification', ecriture: '15 rue Cavalotti', lots: [3, 4] };
    expect(await annulerChoix(7, AUTEUR)).toEqual({ ok: true, message: 'Choix annulé : « 15 rue Cavalotti » revient dans la file.' });
    expect(ann.appels).toEqual([7]);
    expect(ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_journal')).map((x) => x.p[0])).toEqual([3, 4]);
  });
  it('un numéro qui n’est pas un choix de la file : refus, rien n’est annulé', async () => {
    h.op = { source: null, ecriture: null, lots: null };
    expect(await annulerChoix(2, AUTEUR)).toMatchObject({ ok: false });
    expect(ann.appels).toEqual([]);
  });
});
