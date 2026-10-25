import { describe, expect, it, vi } from 'vitest';
import { compteCommeGestion, motAnnexeLouee, regleAnnexesDe, stockGestion, type RegleAnnexes } from './annexesGestion';
import { gestionDepuisJanvier, gestionDuMois, natureBienCalculee, natureBienLoue, sectionGestion, tuilesAnnee, entreesGestionParMois, type ActiviteLue, type LigneGestion, type Transition } from './tableauBord';
import { planLiensAnnexes } from './liensAnnexes';

/**
 * 🔴 Arno (25/10/2026, migration 426) — « 1 lot principal = 1 gestion ; une annexe = 0, même louée séparément » — À PARTIR DE LA DATE DE
 * BASCULE seulement : avant, tout est compté exactement comme avant. Données fictives (lots 1 et 4 : principaux ; 2 et 3 : annexes de 1).
 */
vi.mock('server-only', () => ({}));
const regle: RegleAnnexes = { bascule: '2026-10-25', annexes: new Set([2, 3]) };
const ligne = (lotId: number, effetLe: string, entree = true, loyer: number | null = 1000): LigneGestion => ({
  lotId, libelle: `lot ${lotId}`, proprietaire: 'DUPONT', effetLe, avant: entree ? 'location_seule' : 'en_gestion', apres: entree ? 'en_gestion' : 'ancienne_gestion',
  loyerHc: loyer, provisions: 0, base: 'hc', tauxHt: loyer === null ? null : 5,
});
const transition = (lotId: number, effetLe: string, entree = true): Transition => ({ lotId, effetLe, avant: entree ? 'location_seule' : 'en_gestion', apres: entree ? 'en_gestion' : 'ancienne_gestion' });

describe('🔴 un mandat : 1 gestion par LOT PRINCIPAL (après la bascule)', () => {
  it('1 lot principal + 2 annexes = 1 gestion (les annexes restent montrées, non comptées ; les montants inchangés)', () => {
    const lignes = [ligne(1, '2026-11-03'), ligne(2, '2026-11-03', true, null), ligne(3, '2026-11-03', true, null)];
    const g = gestionDuMois(lignes, '2026-11', regle);
    expect([g.nouvelles.length, g.nbNouvelles]).toEqual([3, 1]);
    expect(g.gagneMensuel).toBe(50);
    expect(gestionDepuisJanvier(lignes, '2026-11', regle).entrees.nb).toBe(1);
    expect(tuilesAnnee([], { regles: [], apporteurs: [], retrocessions: [] }, 2026, '2026-11-30', 11, lignes, regle).gestion.nouvelles).toBe(1);
    const t = [transition(1, '2026-11-03'), transition(2, '2026-11-03'), transition(3, '2026-11-03')];
    expect(sectionGestion(t, stockGestion(103, t, regle), '2026-11', regle).at(-1)).toMatchObject({ entrees: 1, stock: 101 });
    expect(entreesGestionParMois(t, 2026, regle)[10]).toBe(1);
  });
  it('2 lots principaux dans le même mandat = 2 gestions', () => {
    expect(gestionDuMois([ligne(1, '2026-11-03'), ligne(4, '2026-11-03')], '2026-11', regle).nbNouvelles).toBe(2);
  });
  it('une sortie d’annexe ne retire rien ; une sortie de lot principal retire 1', () => {
    const lignes = [ligne(2, '2026-12-01', false, null), ligne(1, '2026-12-01', false)];
    expect(gestionDuMois(lignes, '2026-12', regle).nbPerdues).toBe(1);
    const t = [transition(2, '2026-12-01', false)];
    expect(stockGestion(100, t, regle)).toBe(101);
    expect(sectionGestion(t, stockGestion(100, t, regle), '2026-12', regle).at(-1)).toMatchObject({ sorties: 0, stock: 101 });
  });
});

describe('🔴 la date de bascule : rien du passé ne change', () => {
  it('un mouvement d’annexe daté du 24/10/2026 compte COMME AVANT ; le même daté du 25/10/2026 ne compte pas', () => {
    expect(compteCommeGestion(2, '2026-10-24', regle)).toBe(true);
    expect(compteCommeGestion(2, '2026-10-25', regle)).toBe(false);
    expect(gestionDuMois([ligne(2, '2026-10-24')], '2026-10', regle).nbNouvelles).toBe(1);
    expect(gestionDuMois([ligne(2, '2026-10-25')], '2026-10', regle).nbNouvelles).toBe(0);
    const t = [transition(2, '2026-10-24')];
    expect(stockGestion(365, t, regle)).toBe(365);
    expect(sectionGestion(t, 365, '2026-10', regle)).toEqual(sectionGestion(t, 365, '2026-10'));
  });
  it('sans bascule (migration absente) : exactement comme avant, annexes comprises', () => {
    const sans = regleAnnexesDe({ basculeAnnexes: null, annexes: [2, 3] });
    const lignes = [ligne(1, '2026-11-03'), ligne(2, '2026-11-03')];
    expect(gestionDuMois(lignes, '2026-11', sans).nbNouvelles).toBe(2);
    expect(gestionDuMois(lignes, '2026-11').nbNouvelles).toBe(2);
  });
});

describe('🔴 une annexe louée séparément (après la bascule) : une relocation, jamais une nouvelle gestion', () => {
  const location = (o: Partial<ActiviteLue>): ActiviteLue => ({ id: 9, type: 'bail', dateSignature: '2026-11-10', libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN',
    honoProprietaireHt: 100, honoLocataireHt: 100, primeSaisie: null, mandatGestion: true, categoriePrime: 'parking', apporteurId: null, apporteurNom: null, apporteurTaux: null,
    commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null,
    assurance: null, parking: true, vacanceJours: null, rattachement: 'rattache', origineContact: 'internet', lotId: 2, bailId: 5, source: 'saisie', ...o } as ActiviteLue);
  const annexe = { parentId: 1, libelle: 'Appartement — 1 rue Fictive', principalEnGestion: true, mandat: 'MG-12' };
  it('lot principal en gestion → « Relocation gestion » ; sans gestion → « Relocation sans gestion » — même avec la prime (« Nouvelle gestion » cochée)', () => {
    expect(natureBienCalculee(location({ annexe })).nature).toBe('relocation');
    expect(natureBienCalculee(location({ annexe: { ...annexe, principalEnGestion: false } })).nature).toBe('client_hors_gestion');
    // Sans la marque d'annexe (avant la bascule, ou lot non relié) : la règle d'avant (ici « Nouvelle gestion »).
    expect(natureBienCalculee(location({})).nature).toBe('nouveau_gestion');
    expect(motAnnexeLouee(annexe)).toBe('Annexe de Appartement — 1 rue Fictive (gestion n° MG-12) — comptée en relocation');
  });
  it('le statut validé À LA MAIN l’emporte toujours', () => {
    expect(natureBienLoue(location({ annexe, natureManuelle: { nature: 'nouveau_gestion', par: 'Arnaud Jorel', le: '2026-11-12' } })).nature).toBe('nouveau_gestion');
  });
});

describe('🔴 la prime d’une annexe : à sa première entrée en gestion, refusée ensuite (une par bien, pour toute sa vie)', () => {
  it('la règle « prime déjà versée » regarde le lot de l’ANNEXE lui-même', async () => {
    vi.doMock('../../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
    vi.doMock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
    const { primeDejaVersee } = await import('./suiviRepo');
    const appels: unknown[][] = [];
    let lignes: { date_signature: string; bail: string }[] = [];
    const q = (async (_sql: string, params: unknown[]) => { appels.push(params); return { rows: lignes }; }) as unknown as Parameters<typeof primeDejaVersee>[0];
    expect(await primeDejaVersee(q, 2)).toBeNull();
    lignes = [{ date_signature: '2026-11-10', bail: 'MARTIN' }];
    expect(await primeDejaVersee(q, 2)).toEqual({ date: '2026-11-10', bail: 'MARTIN' });
    expect(appels.map((p) => p[0])).toEqual([2, 2]);
  });
});

describe('🔴 le script des liens : un seul lot principal (ou à la même adresse) → proposé ; ambigus et sans principal listés', () => {
  it('le plan', () => {
    const lot = (id: number, prop: number, nature: string, adresse = 'x', relie = false) => ({ id, proprietaireId: prop, nature, typeBien: null, categorie: null, adresse, relie });
    const plan = planLiensAnnexes([lot(1, 7, 'Appartement'), lot(2, 7, 'Parking'), lot(10, 8, 'Appartement', 'a'), lot(11, 8, 'Appartement', 'b'), lot(12, 8, 'Garage', 'a'),
      lot(20, 9, 'Appartement'), lot(21, 9, 'Appartement'), lot(22, 9, 'Box', 'z'), lot(30, 6, 'Parking'), lot(40, 5, 'Appartement'), lot(41, 5, 'Cave', 'x', true)]);
    expect(plan.map((d) => [d.annexe.id, d.sorte, d.sorte === 'proposer' ? d.parent.id : null])).toEqual([
      [2, 'proposer', 1], [12, 'proposer', 10], [22, 'ambigu', null], [30, 'sans_principal', null]]);
  });
});
