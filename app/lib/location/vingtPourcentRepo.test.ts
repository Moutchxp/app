import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (23/11/2026) — « 20 % à restituer », la LECTURE sur une base SIMULÉE : les sorties validées avec retenue (jamais une sortie annulée
 * depuis), les AGO OFFICIELLES de la copropriété (jamais les projetées enregistrées à la sortie), l'arrêté des comptes, le calcul à la lecture.
 */
const appels: string[] = [];
let sorties: Record<string, unknown>[] = [];
const query = vi.fn(async (sql: string, _p?: unknown[]) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push(s);
  if (s.includes('AS j')) return { rows: [{ j: '2026-11-23' }] };
  if (s.includes('FROM gestion_location_sortie_validee')) return { rows: sorties };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (sql: string, p?: unknown[]) => query(sql, p) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./agCoproprieteRepo', () => ({
  contexteAgDuLot: vi.fn(async (lotId: number) => (lotId === 1
    ? { lotId, immeuble: { cle: 'a', libelle: 'A rue' }, copropriete: { id: 10, libelle: 'Copro A', cle: 'a' } }
    : { lotId, immeuble: { cle: 'b', libelle: 'B rue' }, copropriete: { id: 20, libelle: 'Copro B', cle: 'b' } })),
  entreesAg: vi.fn(async (c: { coproprieteId: number }) => (c.coproprieteId === 10
    ? [{ type: 'derniere', statut: 'officielle', date: '2026-03-25', nature: 'ago' }, { type: 'prochaine', statut: 'projetee', date: '2027-01-01', nature: 'ago' }]
    : [])),
}));
vi.mock('./arreteComptesRepo', () => ({ arretesDe: vi.fn(async () => new Map([[10, { jour: 31, mois: 12 }]])) }));
const { lireSuiviVingtPourcent } = await import('./vingtPourcentRepo');

beforeEach(() => {
  appels.length = 0;
  sorties = [
    { id: '5', lot_id: '1', date_sortie: '2026-11-15', valide_le: '2026-11-20', logement: '1 rue A', noms: ['DUPONT Alice'] },
    { id: '6', lot_id: '2', date_sortie: '2026-10-01', valide_le: '2026-10-02', logement: '2 rue B', noms: ['MARTIN Paul', 'MARTIN Léa'] },
  ];
});

describe('lireSuiviVingtPourcent', () => {
  it('seules les sorties AVEC retenue et toujours sorties (une sortie annulée n’y figure plus) ; lecture seule', async () => {
    await lireSuiviVingtPourcent();
    const s = appels.find((x) => x.includes('FROM gestion_location_sortie_validee'))!;
    expect(s).toContain('WHERE s.retenue_20');
    expect(s).toContain('AND o.sortie IS NULL');
    expect(appels.some((x) => /^(UPDATE|INSERT|DELETE)/.test(x))).toBe(false);
  });
  it('le calcul à la lecture : la projetée enregistrée à la sortie (01/01/2027) est IGNORÉE ; l’AGO qui compte = 25/03/2027 projetée', async () => {
    const r = await lireSuiviVingtPourcent();
    const a = r.lignes.find((l) => l.sortieId === 5)!;
    expect(a).toMatchObject({ locataires: ['DUPONT Alice'], copropriete: { id: 10, libelle: 'Copro A' }, arrete: { jour: 31, mois: 12 },
      suivi: { etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, limite: '2027-04-25' } });
  });
  it('« Dates manquantes » : la copropriété sans AGO ni arrêté, avec ses locataires ; la copropriété complète n’y est pas', async () => {
    const r = await lireSuiviVingtPourcent();
    expect(r.manquantes).toEqual([{ cle: 'copro-20', coproprieteId: 20, libelle: 'Copro B', immeuble: 'b', lotId: 2, manque: ['derniere_ago', 'arrete'], locataires: ['MARTIN Paul', 'MARTIN Léa'] }]);
    expect(r.lignes.find((l) => l.sortieId === 6)!.suivi).toEqual({ etat: 'sans_ago', exercice: null, mention: 'Dernière AGO inconnue' });
  });
  // 🔴 Arno (23/11/2026) — « cette date remonte dans la copropriété et redescend dans l'ensemble des biens concernés par les 20 % »
  it('l’arrêté, écrit UNE fois sur la copropriété, vaut pour TOUS ses locataires en attente (un autre bien, une autre sortie)', async () => {
    sorties = [
      { id: '5', lot_id: '1', date_sortie: '2026-11-15', valide_le: '2026-11-20', logement: '1 rue A', noms: ['DUPONT Alice'] },
      { id: '8', lot_id: '1', date_sortie: '2026-05-10', valide_le: '2026-05-12', logement: '1 rue A bis', noms: ['VOISIN Marc'] },
    ];
    const r = await lireSuiviVingtPourcent();
    expect(r.lignes.map((l) => [l.sortieId, l.arrete, l.suivi.etat === 'ok' ? l.suivi.exercice : null])).toEqual([
      [5, { jour: 31, mois: 12 }, '2026-12-31'], [8, { jour: 31, mois: 12 }, '2026-12-31']]);
    expect(r.manquantes).toEqual([]);
  });
});
