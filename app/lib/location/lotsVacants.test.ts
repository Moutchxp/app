import { describe, expect, it, vi } from 'vitest';
import { biensDesLots, biensVacants, detailVacants, libelleVacants, nombreEtType, occupationEnPlace, titreLocation, typeDuLotVacant, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 6) « Location (Nombre de lots vacants : 3) » ; 🔴🔴 RÈGLE (Arno, 28/11/2026, 11h43) : « le nombre de lots PRINCIPAUX
 * vacants, annexes incluses […] Si une annexe est détachée du lot principal (ex. parking détaché pour être loué à part), elle devient un lot à part
 * entière » : on compte des BIENS (lot principal + annexes rattachées = 1 ; annexe détachée = son propre bien).
 */
type O = LotPourVacance['occupations'];
const L = (id: number, o: { occupations?: O; parentId?: number; detachee?: boolean; regroupement?: { id: number; teteId: number }; categorie?: string } = {}): LotPourVacance =>
  ({ id, parentId: o.parentId ?? null, detachee: o.detachee ?? false, regroupement: o.regroupement ?? null, occupations: o.occupations ?? [],
     ...(o.categorie !== undefined ? { categorie: o.categorie } : {}) });
const LOUE: O = [{ entree: '2024-01-01', sortie: null }];
const J = '2026-11-28';
const vacants = (lots: LotPourVacance[], jour = J) => biensVacants(lots, jour).map((b) => b.teteId);

describe('la vacance d’un bien, à l’instant', () => {
  it('ENTRÉE d’un locataire : vacant la veille, occupé le jour même et après', () => {
    const lots = [L(1, { occupations: [{ entree: '2026-12-01', sortie: null }] })];
    expect(vacants(lots, '2026-11-30')).toEqual([1]);
    expect(vacants(lots, '2026-12-01')).toEqual([]);
    expect(vacants(lots, '2027-03-01')).toEqual([]);
  });
  it('SORTIE d’un locataire : occupé la veille de la sortie, vacant le jour de la sortie (un préavis ne libère rien)', () => {
    const lots = [L(2, { occupations: [{ entree: '2024-01-01', sortie: '2026-12-15' }] })];
    expect(vacants(lots, '2026-12-14')).toEqual([]);
    expect(vacants(lots, '2026-12-15')).toEqual([2]);
  });
  it('sortie puis nouvelle entrée : vacant entre les deux seulement ; une entrée inconnue vaut « en place »', () => {
    const lots = [L(3, { occupations: [{ entree: '2020-01-01', sortie: '2026-11-30' }, { entree: '2026-12-10', sortie: null }] })];
    expect(vacants(lots, '2026-12-05')).toEqual([3]);
    expect(vacants(lots, '2026-12-10')).toEqual([]);
    expect(occupationEnPlace({ entree: null, sortie: null }, J)).toBe(true);
  });
});

describe('🔴🔴 Arno (28/11/2026, 11h43) — des BIENS : lot principal + annexes rattachées = 1 ; une annexe détachée = un lot à part entière', () => {
  // 10 = le logement, 11 = sa cave, 12 = son parking
  it('(a) logement + cave + parking RATTACHÉS, vacants → 1', () => {
    expect(vacants([L(10), L(11, { parentId: 10 }), L(12, { parentId: 10 })])).toEqual([10]);
  });
  it('(b) parking DÉTACHÉ vacant + logement et cave vacants → 2', () => {
    expect(vacants([L(10), L(11, { parentId: 10 }), L(12, { parentId: 10, detachee: true })])).toEqual([10, 12]);
  });
  it('(c) parking détaché LOUÉ + logement et cave vacants → 1', () => {
    expect(vacants([L(10), L(11, { parentId: 10 }), L(12, { parentId: 10, detachee: true, occupations: LOUE })])).toEqual([10]);
  });
  it('(d) parking détaché vacant + logement et cave OCCUPÉS → 1', () => {
    expect(vacants([L(10, { occupations: LOUE }), L(11, { parentId: 10, occupations: LOUE }), L(12, { parentId: 10, detachee: true })])).toEqual([12]);
  });
  it('une annexe rattachée ne compte jamais à part : ni si elle seule est vide, ni si son logement n’est plus du portefeuille', () => {
    expect(vacants([L(10, { occupations: LOUE }), L(11, { parentId: 10 })])).toEqual([]);
    expect(vacants([L(11, { parentId: 99 })])).toEqual([]);
  });
  it('une FICHE AUTONOME (regroupement ouvert : lot orphelin, scission) est son propre bien ; à plusieurs lots, elle compte pour un', () => {
    const lots = [L(10, { occupations: LOUE }), L(11, { parentId: 10, regroupement: { id: 5, teteId: 11 } }), L(12, { parentId: 10, regroupement: { id: 5, teteId: 11 } })];
    expect(vacants(lots)).toEqual([11]);
    expect(biensDesLots(lots).map((b) => [b.teteId, b.lots.map((l) => l.id)])).toEqual([[10, [10]], [11, [11, 12]]]);
    lots[2] = L(12, { parentId: 10, regroupement: { id: 5, teteId: 11 }, occupations: LOUE });
    expect(vacants(lots)).toEqual([]); // un lot de la fiche est loué : le bien n'est pas vacant
  });
  it('un lot indépendant (jamais rattaché, ex. un parking acheté seul) est un bien', () => {
    expect(vacants([L(20), L(21, { occupations: LOUE })])).toEqual([20]);
  });
});

describe('la lecture côté serveur', () => {
  it('les biens ACTIFS du portefeuille seulement, leur rattachement (lot principal, détachement, fiche autonome) et leurs occupations ; lecture seule', async () => {
    vi.resetModules();
    const sqls: string[] = [];
    vi.doMock('../db/client', () => ({ query: async (sql: string) => { sqls.push(sql.replace(/\s+/g, ' ')); return { rows: [
      { id: '1', nature: 'Appartement', type_bien: 'Type 2', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2026-12-01', sortie: null }] },
      { id: '2', categorie: 'logement', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2020-01-01', sortie: '2026-11-20' }] },
      { id: '3', parent: '2', detachee: false, regroupement: null, occupations: null },
      { id: '4', nature: 'Parking', parent: '2', detachee: true, regroupement: null, occupations: null },
      { id: '5', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2020-01-01', sortie: null }] }] }; } }));
    vi.doMock('./portefeuilleRepo', () => ({ sqlBienDuPortefeuille: async (a: string) => `${a}.statut_bien <> 'ancienne_gestion' AND ${a}.absent_le IS NULL AND ${a}.sorti_portefeuille_le IS NULL` }));
    vi.doMock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
    const { compterLotsVacants } = await import('./lotsVacantsRepo');
    // le 28/11/2026 à 12h (Paris) : 1 pas encore entré (vacant), 2 sorti avec sa cave 3 (UN bien vacant), 4 parking détaché (vacant), 5 loué
    expect(await compterLotsVacants(new Date('2026-11-28T11:00:00Z'))).toEqual({ total: 3, parType: [{ type: 'logement', n: 2 }, { type: 'parking', n: 1 }] });
    expect(sqls[0]).toContain('lo.categorie AS categorie, lo.nom_annexe AS nom_annexe, lo.nature, lo.type_bien');
    expect(sqls[0]).toContain("lo.statut_bien <> 'ancienne_gestion' AND lo.absent_le IS NULL AND lo.sorti_portefeuille_le IS NULL");
    expect(sqls[0]).toContain('FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id');
    expect(sqls[0]).toContain('lo.annexe_detachee_le IS NOT NULL');
    expect(sqls[0]).toContain('WHERE r.clos_le IS NULL AND lo.id = ANY (r.lot_ids)');
    expect(sqls[0]).toContain('o.absent_le IS NULL');
    expect(sqls.some((s) => /^\s*(INSERT|UPDATE|DELETE)/i.test(s))).toBe(false);
    vi.doUnmock('../db/client'); vi.doUnmock('./portefeuilleRepo'); vi.doUnmock('./sondeLocation');
  });
});

describe('🔴 Arno (28/11/2026, 00h45) — « Nombre de lots vacants » plus discret, pas en gras', () => {
  it('« Location » garde le style du titre ; la parenthèse : plus petite, poids normal, couleur secondaire du thème, d’un bloc (passe à la ligne entière)', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync('app/(admin)/admin/(protected)/location/page.tsx', 'utf8');
    expect(page).toContain('<>Location <span className="loc-titre-vacants"');
    // 🔴 (Arno, 28/11/2026, 11h47) même style discret ; le détail passe à la ligne proprement (au téléphone)
    expect(page).toContain("'.loc-titre-vacants{display:inline-block;max-width:100%;font-size:.8rem;font-weight:400;color:var(--color-svv-muted);white-space:normal;overflow-wrap:anywhere;vertical-align:baseline}'");
    expect(page).toContain('data-lots-vacants={vacants.total}');
    expect(page).toContain('<style>{CSS_TITRE_VACANTS + CSS_INTRO_VIDE}</style>');
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 11h47) — « Lots vacants : 15 dont 10 logements et 5 parkings » ; « faire aussi le décompte des caves si le cas se présente, ou
   d'autres annexes personnalisées » ══ */
describe('🔴🔴 11h47 — le détail par type', () => {
  const B = (teteId: number, t: Partial<LotPourVacance>) => ({ teteId, lots: [{ ...L(teteId), ...t }] });
  const LOG = { categorie: 'logement' }; const PK = { categorie: 'parking' }; const CV = { categorie: 'cave' };
  const rep = (n: number, t: Partial<LotPourVacance>, de = 0) => Array.from({ length: n }, (_, i) => B(de + i, t));
  it('l’exemple d’Arno : 10 logements (annexes rattachées incluses) et 5 parkings séparés → « Lots vacants : 15 dont 10 logements et 5 parkings »', () => {
    const d = detailVacants([...rep(10, LOG), ...rep(5, PK, 100)]);
    expect(libelleVacants(d)).toBe('Lots vacants : 15 dont 10 logements et 5 parkings');
    expect(titreLocation(d)).toBe('Location (Lots vacants : 15 dont 10 logements et 5 parkings)');
  });
  it('ordre : logements, parkings, caves, puis les autres par ordre alphabétique ; « , » et « et » avant le dernier ; un type à 0 n’est pas dit', () => {
    const d = detailVacants([...rep(2, CV), ...rep(1, { categorie: 'autre', nomAnnexe: 'Remise' }, 10), ...rep(3, PK, 20), ...rep(10, LOG, 30), ...rep(1, { categorie: 'box' }, 50)]);
    expect(libelleVacants(d)).toBe('Lots vacants : 17 dont 10 logements, 3 parkings, 2 caves, 1 box et 1 remise');
    expect(libelleVacants(detailVacants([...rep(10, LOG), ...rep(3, PK, 20), ...rep(2, CV, 40)]))).toBe('Lots vacants : 15 dont 10 logements, 3 parkings et 2 caves');
  });
  it('pluriels : 1 parking / 2 parkings ; libellé personnalisé + s, sauf s, x, z ; « local » → « locaux » (pluriel français correct)', () => {
    expect(nombreEtType(1, 'parking')).toBe('1 parking');
    expect(nombreEtType(2, 'parking')).toBe('2 parkings');
    expect(nombreEtType(2, 'remise')).toBe('2 remises');
    expect(nombreEtType(3, 'box')).toBe('3 box');
    expect(nombreEtType(2, 'local commercial')).toBe('2 locaux commerciaux');
    expect(nombreEtType(2, 'bureau')).toBe('2 bureaux');
    expect(nombreEtType(2, 'place de stationnement')).toBe('2 places de stationnement');
    expect(nombreEtType(2, 'lot à renseigner')).toBe('2 lots à renseigner');
  });
  it('type personnalisé : une annexe « Autre » sous son nom tel qu’enregistré, en minuscules ; un bien principal qui n’est pas un logement sous son propre type', () => {
    expect(typeDuLotVacant({ categorie: 'autre', nomAnnexe: 'Box fermé' })).toBe('box fermé');
    expect(typeDuLotVacant({ categorie: 'local' })).toBe('local commercial'); // 🔴 décision d'Arno (28/11/2026) : un seul type
    expect(typeDuLotVacant({ nature: 'Local commercial', typeBien: null })).toBe('local commercial');
    expect(typeDuLotVacant({ nature: 'Appartement meublé', typeBien: 'Studio' })).toBe('logement');
    expect(typeDuLotVacant({ nature: 'Maison', typeBien: 'Type 6' })).toBe('logement');
    expect(typeDuLotVacant({ nature: 'Parking', typeBien: 'Garage' })).toBe('parking');
    expect(typeDuLotVacant({ nature: 'Garage', typeBien: null })).toBe('parking');
    expect(typeDuLotVacant({ nature: 'Box', typeBien: 'Garage' })).toBe('box');
    expect(typeDuLotVacant({ nature: 'Cave', typeBien: null })).toBe('cave');
    expect(typeDuLotVacant({ nature: 'A renseigner', typeBien: 'Studio' })).toBe('logement');
    expect(typeDuLotVacant({ nature: 'A renseigner', typeBien: null })).toBe('lot à renseigner');
    expect(typeDuLotVacant({})).toBe('lot à renseigner');
    expect(libelleVacants(detailVacants([...rep(3, LOG), ...rep(2, { nature: 'Local commercial' }, 10)]))).toBe('Lots vacants : 5 dont 3 logements et 2 locaux commerciaux');
  });
  it('0 vacant : « Lots vacants : 0 » ; un seul type : sans « dont » (« Lots vacants : 10 logements », « Lots vacants : 1 logement ») ; lecture impossible : « Location »', () => {
    expect(titreLocation(detailVacants([]))).toBe('Location (Lots vacants : 0)');
    expect(libelleVacants(detailVacants(rep(10, LOG)))).toBe('Lots vacants : 10 logements');
    expect(libelleVacants(detailVacants(rep(1, LOG)))).toBe('Lots vacants : 1 logement');
    expect(libelleVacants(detailVacants(rep(2, PK)))).toBe('Lots vacants : 2 parkings');
    expect(titreLocation(null)).toBe('Location');
  });
  it('le type d’un bien est celui de son lot de TÊTE (un logement et sa cave rattachée : un logement)', () => {
    const lots = [L(10, { categorie: 'logement' }), L(11, { parentId: 10, categorie: 'cave' }), L(12, { parentId: 10, detachee: true, categorie: 'parking' })];
    expect(detailVacants(biensVacants(lots, J))).toEqual({ total: 2, parType: [{ type: 'logement', n: 1 }, { type: 'parking', n: 1 }] });
  });
});

/* 🔴🔴 Décision d'Arno (28/11/2026) — « regroupe « local » (catégorie Location) et « locaux commerciaux » (nature WIPPIMMO) sous un seul type « locaux
   commerciaux » dans le décompte des lots vacants (même règle partout, données inchangées) » */
describe('🔴 décision du 28/11/2026 — « local » et « local commercial » : un seul type', () => {
  const B = (teteId: number, t: Partial<LotPourVacance>) => ({ teteId, lots: [{ ...L(teteId), ...t }] });
  it('la recette : 1 « local » + 3 « Local commercial » → « 4 locaux commerciaux »', () => {
    const d = detailVacants([B(1, { categorie: 'logement' }), B(2, { categorie: 'local' }), ...[3, 4, 5].map((i) => B(i, { nature: 'Local commercial' }))]);
    expect(d.parType).toEqual([{ type: 'logement', n: 1 }, { type: 'local commercial', n: 4 }]);
    expect(libelleVacants(d)).toBe('Lots vacants : 5 dont 1 logement et 4 locaux commerciaux');
  });
  it('un seul « local » : « 1 local commercial »', () => {
    expect(libelleVacants(detailVacants([B(1, { categorie: 'local' })]))).toBe('Lots vacants : 1 local commercial');
  });
});

