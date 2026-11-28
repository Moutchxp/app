import { describe, expect, it, vi } from 'vitest';
import { biensDesLots, biensVacants, occupationEnPlace, titreLocation, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 6) « Location (Nombre de lots vacants : 3) » ; 🔴🔴 RÈGLE (Arno, 28/11/2026, 11h43) : « le nombre de lots PRINCIPAUX
 * vacants, annexes incluses […] Si une annexe est détachée du lot principal (ex. parking détaché pour être loué à part), elle devient un lot à part
 * entière » : on compte des BIENS (lot principal + annexes rattachées = 1 ; annexe détachée = son propre bien).
 */
type O = LotPourVacance['occupations'];
const L = (id: number, o: { occupations?: O; parentId?: number; detachee?: boolean; regroupement?: { id: number; teteId: number } } = {}): LotPourVacance =>
  ({ id, parentId: o.parentId ?? null, detachee: o.detachee ?? false, regroupement: o.regroupement ?? null, occupations: o.occupations ?? [] });
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
  it('le titre : « Location (Nombre de lots vacants : 3) » ; lecture impossible : « Location »', () => {
    expect(titreLocation(3)).toBe('Location (Nombre de lots vacants : 3)');
    expect(titreLocation(0)).toBe('Location (Nombre de lots vacants : 0)');
    expect(titreLocation(null)).toBe('Location');
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
      { id: '1', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2026-12-01', sortie: null }] },
      { id: '2', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2020-01-01', sortie: '2026-11-20' }] },
      { id: '3', parent: '2', detachee: false, regroupement: null, occupations: null },
      { id: '4', parent: '2', detachee: true, regroupement: null, occupations: null },
      { id: '5', parent: null, detachee: false, regroupement: null, occupations: [{ entree: '2020-01-01', sortie: null }] }] }; } }));
    vi.doMock('./portefeuilleRepo', () => ({ sqlBienDuPortefeuille: async (a: string) => `${a}.statut_bien <> 'ancienne_gestion' AND ${a}.absent_le IS NULL AND ${a}.sorti_portefeuille_le IS NULL` }));
    vi.doMock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
    const { compterLotsVacants } = await import('./lotsVacantsRepo');
    // le 28/11/2026 à 12h (Paris) : 1 pas encore entré (vacant), 2 sorti avec sa cave 3 (UN bien vacant), 4 parking détaché (vacant), 5 loué
    expect(await compterLotsVacants(new Date('2026-11-28T11:00:00Z'))).toBe(3);
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
    expect(page).toContain("'.loc-titre-vacants{display:inline-block;font-size:.8rem;font-weight:400;color:var(--color-svv-muted);white-space:nowrap;vertical-align:baseline}'");
    expect(page).toContain('<style>{CSS_TITRE_VACANTS}</style>');
  });
});
