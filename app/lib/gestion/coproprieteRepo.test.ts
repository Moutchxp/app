import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, 476) — la lecture de la fiche Copropriété (base simulée ; le vrai SQL a été rejoué sur la recette). */
const b = vi.hoisted(() => ({ avec476: true, sql: [] as string[], copro: null as Record<string, unknown> | null, adresses: [] as unknown[], lots: [] as unknown[],
  syndic: [] as unknown[], gestionnaires: [] as unknown[], registre: [] as unknown[], autres: [] as unknown[] }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async (t: string) => (t === 'gestion_copropriete' ? b.avec476 : true) }));
vi.mock('../location/digicodeImmeubleRepo', () => ({ digicodeImmeubleDisponible: async () => true, depuisCoproprieteDisponible: async () => true,
  lireDigicodesAdresse: async (a: { voie: string }) => ({ general: { digicode: true, code: a.voie.startsWith('12') ? '1234' : null, source: 'immeuble' }, parBatiment: true,
    batiments: a.voie.startsWith('12') ? [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', nbBiens: 1, mention: '' }] : [] }) }));
// 🔴 (16/11/2026, « Digicodes unifiés ») la base unique : absente pour les épreuves d'avant (lecture d'avant), présente pour la sienne
const u = vi.hoisted(() => ({ avec478: false, adresses: [] as unknown[] }));
vi.mock('./digicodesRepo', () => ({ digicodesUnifiesDisponibles: async () => u.avec478, digicodesDesAdresses: async (cles: string[]) => { u.adresses.push(cles); return cles.map((c) => ({
  adresseCle: c, nbBiens: 1, commun: { cle: '', libelle: null, code: c === 'residence les tilleuls' ? { valeur: { digicode: true, code: '5555' }, source: 'unifie' } : null, aVenir: [], historique: [] },
  batiments: c === 'residence les tilleuls' ? [{ cle: 'b', libelle: 'B', code: { valeur: { digicode: true, code: 'B9' }, source: 'ancien' }, aVenir: [], historique: [] }] : [] })); } }));
vi.mock('./contactsImmeubleRepo', () => ({ contactsDeLImmeuble: async () => [{ id: 1, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: null, coordonnees: [] }] }));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim(); b.sql.push(s);
    if (s.startsWith('SELECT cs.copropriete_id::text AS copro')) return { rows: b.syndic.map((x) => ({ ...(x as object), copro: '7' })) };
    if (s.includes('FROM gestion_copropriete c WHERE c.cle_immeuble = $1')) return { rows: b.copro ? [b.copro] : [] };
    if (s.includes('FROM gestion_copropriete_adresse WHERE copropriete_id = $1')) return { rows: b.adresses };
    if (s.includes('FROM gestion_annuaire_lot WHERE absent_le IS NULL')) return { rows: b.lots };
    if (s.includes('FROM gestion_copropriete_syndic cs JOIN gestion_syndic s')) return { rows: b.syndic };
    if (s.includes('FROM gestion_syndic_contact ct')) return { rows: b.gestionnaires };
    if (s.includes('FROM gestion_copropriete_batiment')) return { rows: b.registre };
    // la liste (lot 4)
    if (s.startsWith('SELECT immeuble, adresse, code_postal, commune, copropriete FROM gestion_annuaire_lot WHERE absent_le IS NULL')) return { rows: b.lots };
    if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle, code_postal, commune, nom, hors_copropriete AS hors FROM gestion_copropriete')) return { rows: b.copro ? [b.copro, ...b.autres] : b.autres };
    if (s.startsWith('SELECT copropriete_id::text AS copro, cle_immeuble AS cle')) return { rows: b.adresses.map((a) => ({ ...(a as object), copro: '7' })) };
    throw new Error(`requête inattendue : ${s.slice(0, 80)}`);
  },
}));
import { cleImmeubleDuBien, ficheCopropriete, listerCoproprietes } from './coproprieteRepo';

const LOT = (id: number, immeuble: string | null, adresse: string, copropriete: boolean | null = null) => ({ id: String(id), numero: `W${id}`, immeuble, adresse, code_postal: '75011', commune: 'Paris', copropriete });
beforeEach(() => {
  b.avec476 = true; b.sql = []; b.registre = []; b.autres = []; u.avec478 = false; u.adresses = [];
  b.copro = { id: '7', cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', code_postal: '75011', commune: 'Paris', nom: null, hors: false, nomenclature: null };
  b.adresses = [{ cle: '12 rue des lilas', libelle: '12 rue des Lilas', code_postal: '75011', commune: 'Paris' }];
  b.lots = [LOT(1, 'Résidence Les Tilleuls', '10 rue des Lilas', true), LOT(2, '12 rue des Lilas', '12 rue des Lilas', true), LOT(3, null, '12 rue des Lilas', null), LOT(4, 'Autre immeuble', '3 rue X', false)];
  b.syndic = [{ id: '2', nom: 'Cabinet A', ville: 'Paris', debut: '2026-01-01' }];
  b.gestionnaires = [{ id: '5', civilite: 'Mme', prenom: 'Claire', nom: 'Test', titre: 'Gestionnaire', coordonnees: [{ sorte: 'email', libelle: null, valeur: 'claire@exemple.test' }] }];
});

describe('la fiche Copropriété', () => {
  it('ses adresses (principale puis secondaires), ses biens (par « Immeuble », sinon par adresse), son syndic et ses gestionnaires, ses contacts', async () => {
    const f = (await ficheCopropriete('12 rue des Lilas'))!; // une adresse secondaire ramène à sa copropriété
    expect([f.cle, f.declaree, f.id, f.libelle]).toEqual(['residence les tilleuls', true, 7, 'Résidence Les Tilleuls']);
    expect(f.adresses.map((a) => [a.libelle, a.principale])).toEqual([['Résidence Les Tilleuls', true], ['12 rue des Lilas', false]]);
    expect(f.biens.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(f.syndic).toEqual({ id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' });
    expect(f.gestionnaires.map((g) => [g.prenom, g.coordonnees.length])).toEqual([['Claire', 1]]);
    expect(f.contacts.map((c) => c.categorie)).toEqual(['gardien']);
    expect(f.desaccord).toBe(false);
    expect(b.sql.some((x) => /UPDATE|INSERT|DELETE/.test(x))).toBe(false); // lecture seule
  });
  it('pas encore enregistrée : connue par ses biens (libellé, code postal, commune), sans syndic ; inconnue : rien', async () => {
    b.copro = null; b.adresses = [];
    const f = (await ficheCopropriete('Autre immeuble'))!;
    expect([f.declaree, f.id, f.libelle, f.codePostal, f.syndic, f.biens.length]).toEqual([false, null, 'Autre immeuble', '75011', null, 1]);
    expect(await ficheCopropriete('Nulle part')).toBeNull();
    expect(await ficheCopropriete('  ')).toBeNull();
  });
  it('« hors copropriété », nom et nomenclature lus avec la 476 ; des biens qui se contredisent : désaccord', async () => {
    b.copro = { ...b.copro!, nom: 'Les Tilleuls', hors: true, nomenclature: 'lettres' };
    b.lots = [...b.lots, LOT(5, 'Résidence Les Tilleuls', '10 rue des Lilas', false)];
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect([f.nom, f.horsCopropriete, f.nomenclature, f.desaccord, f.avec476]).toEqual(['Les Tilleuls', true, 'lettres', true, true]);
  });
  it('sans la 476 : la fiche se lit quand même (sans nom ni « hors copropriété »)', async () => {
    b.avec476 = false;
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect([f.nom, f.horsCopropriete, f.avec476]).toEqual([null, false, false]);
    expect(b.sql.find((x) => x.includes('FROM gestion_copropriete c'))).toContain('NULL::boolean AS hors');
  });
  it('la clé d’immeuble d’un bien : son « Immeuble », sinon son adresse', () => {
    expect(cleImmeubleDuBien({ immeuble: 'Résidence Les Tilleuls', adresse: '1 rue X' })).toBe(cleImmeubleDuBien({ immeuble: 'résidence  les tilleuls', adresse: null }));
    expect(cleImmeubleDuBien({ immeuble: ' ', adresse: '12 rue des Lilas' })).toBe(cleImmeubleDuBien({ immeuble: '12 rue des Lilas', adresse: null }));
  });
  it('🔴 (lot 3) les digicodes de chaque adresse, les bâtiments connus de TOUTE la copropriété (adresses, biens, registre), la règle effective', async () => {
    b.lots = [...b.lots, { ...LOT(6, 'Résidence Les Tilleuls', '10 rue des Lilas'), batiment: 'Bât. C' }];
    b.registre = [{ cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }];
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect(f.digicodes.map((d) => [d.voie, d.commun.code, d.batiments.map((x) => x.libelle)])).toEqual([['Résidence Les Tilleuls', null, []], ['12 rue des Lilas', '1234', ['A']]]);
    expect(f.batimentsConnus.map((x) => [x.libelle, x.sorte])).toEqual([['A', 'lettre'], ['C', 'lettre'], ['Côté cour', 'libre']]);
    expect([f.nomenclatureEffective, f.saisieDigicodes]).toEqual(['lettres', true]);
  });
  it('🔴🔴 (« Digicodes unifiés », lot 2) avec la 478 : le code EN VIGUEUR de chaque place, lu à la clé de la copropriété (celle de ses biens)', async () => {
    u.avec478 = true;
    const f = (await ficheCopropriete('Résidence Les Tilleuls'))!;
    expect(u.adresses).toEqual([['residence les tilleuls', '12 rue des lilas']]);
    expect(f.digicodes.map((d) => [d.cle, d.voie, d.commun.code, d.batiments.map((x) => [x.libelle, x.code])])).toEqual([
      ['residence les tilleuls', 'Résidence Les Tilleuls', '5555', [['B', 'B9']]], ['12 rue des lilas', '12 rue des Lilas', null, []]]);
    expect(f.batimentsConnus.map((x) => x.libelle)).toContain('B');
  });
});

describe('🔴 (lot 4) la liste « Copropriétés »', () => {
  it('TOUS les immeubles du portefeuille : une adresse secondaire rangée sous sa copropriété, une copropriété sans bien, un immeuble pas encore enregistré', async () => {
    b.autres = [{ id: '8', cle: 'copro sans bien', libelle: 'Copro sans bien', code_postal: null, commune: null, nom: 'Les Acacias', hors: true }];
    const l = await listerCoproprietes();
    expect(l.map((x) => [x.nom, x.nbBiens, x.declaree, x.hors, x.syndic?.nom ?? null])).toEqual([
      ['Autre immeuble', 1, false, true, null], // son seul bien est noté « pas en copropriété »
      ['Les Acacias', 0, true, true, null],
      ['Résidence Les Tilleuls', 3, true, false, 'Cabinet A'],
    ]);
    const t = l.find((x) => x.nom === 'Résidence Les Tilleuls')!;
    expect(t.adresses).toEqual(['Résidence Les Tilleuls, 75011 Paris', '12 rue des Lilas, 75011 Paris']);
    expect(t.immeuble).toBe('Résidence Les Tilleuls');
    expect(b.sql.some((x) => /UPDATE|INSERT|DELETE/.test(x))).toBe(false);
  });
});