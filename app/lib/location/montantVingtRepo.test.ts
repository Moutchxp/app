import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (25/11/2026, 22h06) — le montant des 20 % retenus : la dernière saisie (516) fait foi, sinon calculé sur le dépôt, sinon « à saisir ». */
const h = vi.hoisted(() => ({ query: vi.fn(), sql: [] as { s: string; p: unknown[] }[], stockes: [] as Record<string, unknown>[], depots: new Map<number, number | null>(), sorties: [] as Record<string, unknown>[] }));
vi.mock('../db/client', () => ({ query: h.query }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./conditionsEntreeRepo', () => ({
  conditionsParOccupation: async (ids: readonly number[]) => new Map(ids.filter((i) => h.depots.has(i)).map((i) => [i, { conditions: { sommes: { depotGarantie: h.depots.get(i) } } }])),
}));
const { montantsDesSorties, saisirMontantVingt, montantVingtSaisi } = await import('./montantVingtRepo');
const AUTEUR = { id: 1, libelle: 'Arno Test' };
const norm = (s: string) => s.replace(/\s+/g, ' ');
beforeEach(() => {
  h.sql = []; h.stockes = []; h.depots = new Map(); h.sorties = [];
  h.query.mockReset().mockImplementation(async (sql: string, p: unknown[] = []) => {
    const s = norm(sql); h.sql.push({ s, p });
    if (s.includes('FROM gestion_location_montant_vingt m')) return { rows: h.stockes };
    if (s.includes('s.occupation_ids::text[] AS occ FROM gestion_location_sortie_validee s WHERE s.id = ANY')) return { rows: h.sorties };
    if (s.includes('s.retenue_20 AS retenue')) return { rows: h.sorties.filter((x) => Number(x.id) === Number(p[0])).map((x) => ({ lot: '9', retenue: x.retenue ?? true, occ: x.occ })) };
    return { rows: [] };
  });
});

describe('montantsDesSorties', () => {
  it('la dernière saisie enregistrée fait foi ; sinon 20 % du dépôt connu (« calcule », rien n’est écrit) ; sinon `null` (« à saisir »)', async () => {
    h.sorties = [{ id: '1', occ: ['11'] }, { id: '2', occ: ['21', '22'] }, { id: '3', occ: ['31'] }];
    h.stockes = [{ sortie: '1', montant: '380.00', origine: 'saisi', depot: '2000.00' }];
    h.depots = new Map([[11, 200000], [21, null], [22, 165000]]);
    const m = await montantsDesSorties([1, 2, 3]);
    expect(m.get(1)).toEqual({ montant: 380, origine: 'saisi', depot: 2000 });
    expect(m.get(2)).toEqual({ montant: 330, origine: 'calcule', depot: 1650 });     // le dépôt d'un des colocataires
    expect(m.get(3)).toBeNull();
    expect(h.sql.find((x) => x.s.includes('FROM gestion_location_montant_vingt m'))!.s).toContain('DISTINCT ON (m.sortie_validee_id)');
    expect(h.sql.some((x) => /^INSERT|^UPDATE|^DELETE/.test(x.s))).toBe(false);
  });
});

describe('saisirMontantVingt (depuis la ligne)', () => {
  it('écrit une ligne (« saisi » si le dépôt est inconnu, « calcule » s’il vaut 20 % du dépôt) et l’inscrit à l’historique du bien', async () => {
    h.sorties = [{ id: '7', occ: ['71'] }];
    expect(await saisirMontantVingt({ sortieId: 7, montant: '412,50' }, AUTEUR)).toEqual({ etat: 'ok', data: { montant: 412.5, origine: 'saisi', depot: null } });
    const ins = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_montant_vingt'))!;
    expect(ins.p).toEqual([7, 412.5, 'saisi', null, 1, 'Arno Test']);
    const j = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.s).toContain("VALUES ('annuaire_lot', $1, 'location_montant_20'");
    expect(j.p[2]).toBe('montant des 20 % retenus (sortie validée 7) : 412,50 € (saisi à la main)');
    h.depots = new Map([[71, 200000]]);
    expect(await saisirMontantVingt({ sortieId: 7, montant: '400' }, AUTEUR)).toMatchObject({ etat: 'ok', data: { origine: 'calcule', depot: 2000 } });
  });
  it('refus : montant vide, nul ou illisible ; sortie inconnue ; sortie sans retenue — rien n’est écrit', async () => {
    h.sorties = [{ id: '7', occ: ['71'] }, { id: '8', occ: ['81'], retenue: false }];
    expect(await saisirMontantVingt({ sortieId: 7, montant: '' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montant' });
    expect(await saisirMontantVingt({ sortieId: 7, montant: '0' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montant' });
    expect(await saisirMontantVingt({ sortieId: 'x', montant: '10' }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(await saisirMontantVingt({ sortieId: 8, montant: '10' }, AUTEUR)).toMatchObject({ etat: 'refus', motif: expect.stringContaining('pas de retenue') });
    expect(h.sql.some((x) => x.s.startsWith('INSERT'))).toBe(false);
    expect(montantVingtSaisi('1 234,56 €')).toBe(1234.56);
  });
});
