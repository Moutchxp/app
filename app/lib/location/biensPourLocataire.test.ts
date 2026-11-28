import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * « Nouveau locataire », étape 2 (Arno, 19/10/2026) : le bien se trouve par son ADRESSE OU par le NOM DU PROPRIÉTAIRE, accents et casse ignorés ; chaque
 * résultat dit l'adresse, le type, l'étage et le propriétaire. Base simulée.
 * 🔴🔴 (Arno, 28/11/2026, 15h56) « Libre » = la règle du titre « Location (Lots vacants : N …) », une seule source de vérité : un bien = une ligne (ses
 * annexes rattachées dessous, chacune sélectionnable), une annexe détachée = sa propre ligne, vacant le jour de la sortie, un préavis ne libère rien, et
 * « N biens libres » = exactement le total du titre. CE QUE CES ÉPREUVES DISAIENT AVANT : une ligne par lot, « déjà loué » = une occupation sans sortie,
 * « ORDER BY loue, … LIMIT 20 ».
 */
const appels: { sql: string; params: unknown[] }[] = [];
let lignes: Record<string, unknown>[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: sql.includes('FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire') ? lignes : [] }; }),
  withTransaction: vi.fn(),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const v = vi.hoisted(() => ({ lots: [] as import('./lotsVacants').LotPourVacance[] }));
vi.mock('./lotsVacantsRepo', () => ({ lireLotsPourVacance: async () => v.lots }));

import { biensPourLocataire } from './portefeuilleRepo';
import { biensVacants, detailVacants, type LotPourVacance } from './lotsVacants';

const JOUR = '2026-11-28';
const MAINTENANT = new Date('2026-11-28T10:00:00Z');
const ligne = (id: number, adresse: string, extra: Record<string, unknown> = {}) => ({ id: String(id), adresse, adresse_normalisee: adresse.toLowerCase(), commune: 'Puteaux',
  proprietaire: 'DUPONT Jean', annexe: null, correspond: true, statut: 'en_gestion', etage: null, type_logement: null, nature: 'Appartement', type_bien: 'T3', ...extra });
const lot = (id: number, extra: Partial<LotPourVacance> = {}): LotPourVacance => ({ id, parentId: null, detachee: false, regroupement: null, occupations: [], ...extra });
/** le total du titre, calculé comme compterLotsVacants (lotsVacantsRepo) sur les mêmes lots */
const totalDuTitre = () => detailVacants(biensVacants(v.lots, JOUR)).total;

beforeEach(() => {
  appels.length = 0;
  lignes = [ligne(7, '4 rue Fictive', { etage: '3' })];
  v.lots = [lot(7)];
});

describe('biensPourLocataire — adresse OU nom du propriétaire', () => {
  it('« DÜpont » (accent, casse) : le mot normalisé est cherché dans l’adresse OU le nom normalisé du propriétaire, dans le portefeuille', async () => {
    const r = await biensPourLocataire('DÜpont', MAINTENANT);
    const q = appels.find((a) => a.sql.includes('FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire'))!;
    expect(q.params).toEqual([['dupont']]);
    expect(q.sql).toContain("(coalesce(lo.adresse_normalisee, '') LIKE '%' || ($1::text[])[1] || '%' OR coalesce(pr.nom_normalise, '') LIKE '%' || ($1::text[])[1] || '%')");
    // Arno (21/10/2026, 403) : le portefeuille se lit sur le STATUT du bien (en gestion ou location seule ; jamais l'ancienne gestion).
    expect(q.sql).toContain("lo.statut_bien <> 'ancienne_gestion' AND lo.absent_le IS NULL");
    // Arno (20/10/2026) : l'état est rendu À PART (l'écran l'écrit et le colore), plus dans le détail.
    expect(r.lignes).toEqual([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement T3 · 3e étage · propriétaire : DUPONT Jean', loue: false, enGestion: true }]);
  });
  it('plusieurs mots : chacun dans l’adresse OU le propriétaire (« Lilas Dupont »)', async () => {
    await biensPourLocataire('Lilas Dupont', MAINTENANT);
    const q = appels.find((a) => a.sql.includes('FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire'))!;
    expect(q.params).toEqual([['lilas', 'dupont']]);
    expect(q.sql).toContain("pr.nom_normalise, '') LIKE '%' || ($1::text[])[2] || '%')");
  });
  it('un bien est trouvé par n’importe lequel de ses lots (ici : son annexe rattachée répond, pas le lot principal)', async () => {
    lignes = [ligne(1, '1 rue A', { correspond: false }), ligne(2, '1 rue A', { annexe: 'Cave n° 3', correspond: true })];
    v.lots = [lot(1), lot(2, { parentId: 1 })];
    expect((await biensPourLocataire('cave', MAINTENANT)).lignes.map((l) => l.id)).toEqual([1]);
  });
});

describe('🔴🔴 « Libre » = la règle du titre « Lots vacants » (Arno, 28/11/2026, 15h56)', () => {
  beforeEach(() => {
    lignes = [ligne(1, '1 rue A'), ligne(2, '1 rue A', { annexe: 'Cave n° 3' }), ligne(3, '1 rue A', { annexe: 'Parking n° 12' }),
      ligne(4, '2 rue B'), ligne(5, '3 rue C'), ligne(6, '4 rue D'), ligne(8, '5 rue E', { annexe: 'Parking n° 7' })];
    v.lots = [
      lot(1), lot(2, { parentId: 1 }),                                                      // bien 1 vacant, sa cave rattachée
      lot(3, { parentId: 1, detachee: true }),                                              // parking DÉTACHÉ : son propre bien, vacant
      lot(4, { occupations: [{ entree: '2024-01-01', sortie: '2026-12-15' }] }),           // préavis : sortie FUTURE → loué
      lot(5, { occupations: [{ entree: '2024-01-01', sortie: JOUR }] }),                   // le jour de la sortie : libre
      lot(6, { occupations: [{ entree: '2024-01-01', sortie: null }] }),                   // loué
      lot(8, { parentId: 99 }),                                                             // annexe dont le lot principal n'est plus du portefeuille
    ];
  });
  it('« N biens libres » = EXACTEMENT le total du titre (même lecture, même règle)', async () => {
    const r = await biensPourLocataire('', MAINTENANT);
    expect(r.libres).toBe(totalDuTitre());
    expect(r.libres).toBe(3); // bien 1 (avec sa cave), le parking détaché 3, le bien 5 libre le jour de sa sortie
    // et toutes les lignes « Libre » d'un bien du titre y sont : une par bien
    expect(r.lignes.filter((l) => !l.loue && l.id !== 8).map((l) => l.id).sort()).toEqual([1, 3, 5]);
  });
  it('une annexe RATTACHÉE : pas de ligne à elle, dessous son bien, en petit, sélectionnable avec son propre état', async () => {
    const r = await biensPourLocataire('', MAINTENANT);
    expect(r.lignes.some((l) => l.id === 2)).toBe(false);
    expect(r.lignes.find((l) => l.id === 1)?.annexes).toEqual([{ id: 2, titre: 'Cave n° 3 — 1 rue A, Puteaux', detail: 'Appartement T3 · propriétaire : DUPONT Jean', loue: false, enGestion: true }]);
  });
  it('une annexe DÉTACHÉE vacante : sa propre ligne « Libre », sans annexe dessous, et elle compte au titre', async () => {
    const r = await biensPourLocataire('', MAINTENANT);
    const p = r.lignes.find((l) => l.id === 3);
    expect(p).toMatchObject({ titre: 'Parking n° 12 — 1 rue A, Puteaux', loue: false });
    expect(p?.annexes).toBeUndefined();
    expect(r.lignes.find((l) => l.id === 1)?.annexes?.map((a) => a.id)).toEqual([2]);
  });
  it('un PRÉAVIS ne libère rien (sortie future : « déjà loué ») ; le jour de la sortie, libre ; libres d’abord, puis loués', async () => {
    const r = await biensPourLocataire('', MAINTENANT);
    expect(r.lignes.find((l) => l.id === 4)?.loue).toBe(true);
    expect(r.lignes.find((l) => l.id === 5)?.loue).toBe(false);
    expect(r.lignes.find((l) => l.id === 6)?.loue).toBe(true);
    const etats = r.lignes.map((l) => l.loue);
    expect(etats).toEqual([...etats].sort((a, b) => Number(a) - Number(b)));
  });
  it('rien n’est retiré : une annexe dont le lot principal n’est plus du portefeuille reste listée seule (le titre ne la compte pas)', async () => {
    const r = await biensPourLocataire('', MAINTENANT);
    expect(r.lignes.find((l) => l.id === 8)).toMatchObject({ titre: 'Parking n° 7 — 5 rue E, Puteaux', loue: false });
  });
  it('TOUS les biens libres sont listés (plus de limite de 20) ; les biens loués, 20 au plus', async () => {
    lignes = Array.from({ length: 60 }, (_, i) => ligne(100 + i, `${i} rue X`));
    v.lots = Array.from({ length: 60 }, (_, i) => lot(100 + i, i < 30 ? {} : { occupations: [{ entree: null, sortie: null }] }));
    const r = await biensPourLocataire('', MAINTENANT);
    expect(r.libres).toBe(30);
    expect(r.lignes.filter((l) => !l.loue)).toHaveLength(30);
    expect(r.lignes.filter((l) => l.loue)).toHaveLength(20);
  });
});
