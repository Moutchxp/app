import { describe, expect, it, vi } from 'vitest';
import { lotsVacants, occupationEnPlace, titreLocation, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 6) « Location (Nombre de lots vacants : 3) » — les lots actifs du portefeuille sans locataire en place à l'instant ;
 * une annexe rattachée à un logement ne compte pas à part ; une annexe louée seule compte.
 */
const L = (id: number, occupations: LotPourVacance['occupations'] = [], annexeRattachee = false): LotPourVacance => ({ id, annexeRattachee, occupations });

describe('la vacance d’un lot, à l’instant', () => {
  it('ENTRÉE d’un locataire : vacant la veille, occupé le jour même et après', () => {
    const lots = [L(1, [{ entree: '2026-12-01', sortie: null }])];
    expect(lotsVacants(lots, '2026-11-30').map((l) => l.id)).toEqual([1]);
    expect(lotsVacants(lots, '2026-12-01')).toEqual([]);
    expect(lotsVacants(lots, '2027-03-01')).toEqual([]);
  });
  it('SORTIE d’un locataire : occupé la veille de la sortie, vacant le jour de la sortie (un préavis ne libère rien)', () => {
    const lots = [L(2, [{ entree: '2024-01-01', sortie: '2026-12-15' }])];
    expect(lotsVacants(lots, '2026-12-14')).toEqual([]);
    expect(lotsVacants(lots, '2026-12-15').map((l) => l.id)).toEqual([2]);
  });
  it('sortie puis nouvelle entrée : vacant entre les deux seulement ; une entrée inconnue vaut « en place »', () => {
    const lots = [L(3, [{ entree: '2020-01-01', sortie: '2026-11-30' }, { entree: '2026-12-10', sortie: null }])];
    expect(lotsVacants(lots, '2026-12-05').map((l) => l.id)).toEqual([3]);
    expect(lotsVacants(lots, '2026-12-10')).toEqual([]);
    expect(occupationEnPlace({ entree: null, sortie: null }, '2026-11-28')).toBe(true);
  });
  it('une annexe RATTACHÉE à un logement ne compte pas à part ; une annexe louée SEULE (non rattachée) compte', () => {
    const lots = [L(10), L(11, [], true), L(12)];
    expect(lotsVacants(lots, '2026-11-28').map((l) => l.id)).toEqual([10, 12]);
  });
  it('le titre : « Location (Nombre de lots vacants : 3) » ; lecture impossible : « Location »', () => {
    expect(titreLocation(3)).toBe('Location (Nombre de lots vacants : 3)');
    expect(titreLocation(0)).toBe('Location (Nombre de lots vacants : 0)');
    expect(titreLocation(null)).toBe('Location');
  });
});

describe('la lecture côté serveur', () => {
  it('les biens ACTIFS du portefeuille seulement (en gestion ou location seule, présents, non sortis), leurs annexes et occupations ; la règle pure ; lecture seule', async () => {
    vi.resetModules();
    const sqls: string[] = [];
    vi.doMock('../db/client', () => ({ query: async (sql: string) => { sqls.push(sql.replace(/\s+/g, ' ')); return { rows: [
      { id: '1', annexe: false, occupations: [{ entree: '2026-12-01', sortie: null }] },
      { id: '2', annexe: false, occupations: [{ entree: '2020-01-01', sortie: '2026-11-20' }] },
      { id: '3', annexe: true, occupations: null },
      { id: '4', annexe: false, occupations: null }] }; } }));
    vi.doMock('./portefeuilleRepo', () => ({ sqlBienDuPortefeuille: async (a: string) => `${a}.statut_bien <> 'ancienne_gestion' AND ${a}.absent_le IS NULL AND ${a}.sorti_portefeuille_le IS NULL` }));
    vi.doMock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
    const { compterLotsVacants } = await import('./lotsVacantsRepo');
    // le 28/11/2026 à 12h (Paris) : 1 pas encore entré (vacant), 2 sorti (vacant), 3 annexe rattachée (non comptée), 4 sans occupation (vacant)
    expect(await compterLotsVacants(new Date('2026-11-28T11:00:00Z'))).toBe(3);
    expect(sqls[0]).toContain("lo.statut_bien <> 'ancienne_gestion' AND lo.absent_le IS NULL AND lo.sorti_portefeuille_le IS NULL");
    expect(sqls[0]).toContain('lo.annexe_detachee_le IS NULL');
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
