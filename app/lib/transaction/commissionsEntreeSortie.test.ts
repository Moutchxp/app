import { describe, expect, it } from 'vitest';
import { honorairesDuCote, partDuCote, remunerationDuCote } from './commissions';
import { payeTtcDe, type LigneVente, type Vente } from './modele';
import { ventilationVente } from './partAgence';

/**
 * 🔴 Arno (06/11/2026) — LA RÉPARTITION « ENTRÉE ET SORTIE » (une seule partie pour le même négociateur des deux côtés) compte UNE seule fois dans
 * le calcul des commissions : à l'entrée, jamais 100 % des deux côtés (la commission calculée était doublée). Les autres formes et les montants
 * ENREGISTRÉS ne changent pas. Données fictives : 12 000 € TTC, taux 50 %.
 */
type Partie = NonNullable<Vente['repartition']>['parties'][number];
const P = (sorte: Partie['sorte'], compteId: number, negociateur: string, pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage, montantHt: null });
const L = (cote: 'entree' | 'sortie', negociateur: string, montantTtc: number, mode: 'calculee' | 'manuelle' = 'manuelle'): LigneVente =>
  ({ id: cote === 'entree' ? 1 : 2, negociateur, role: 'negociateur', cote, montantTtc, taux: 50, mode, nature: 'vente', compte: true, origine: 'saisie',
    sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null } as LigneVente);
const LEA = { id: 5, nom: 'Léa MARTIN' };
const MARC = { id: 7, nom: 'Marc DURAND' };
const vente = (parties: Partie[], entree: typeof LEA | null, sortie: typeof LEA | null, lignes: LigneVente[] = []): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X',
  honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-11-06', apporteur: null, note: null, origine: 'saisie', sourceFichier: null,
  sourceOnglet: null, sourceLigne: null, double: null, repartition: { retroApporteurTtc: 0, parties }, lignes,
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree, sortie, apporteurId: null, personnes: [] } });
/** La commission CALCULÉE de chaque côté (TTC), et leur somme. */
const calculs = (v: Vente) => {
  const e = remunerationDuCote(v, 'entree')?.calculTtc ?? null;
  const s = remunerationDuCote(v, 'sortie')?.calculTtc ?? null;
  return { e, s, total: (e ?? 0) + (s ?? 0) };
};

describe('🔴 « entrée et sortie » : comptée UNE fois', () => {
  const ES = vente([P('entree_sortie', 5, LEA.nom, 100)], LEA, LEA);
  it('la part : 100 % à l’entrée, 0 % à la sortie (avant : 100 % des deux côtés)', () => {
    expect([partDuCote(ES, 'entree'), partDuCote(ES, 'sortie')]).toEqual([100, 0]);
    expect([honorairesDuCote(ES, 'entree')!.ttc, honorairesDuCote(ES, 'sortie')!.ttc]).toEqual([12000, 0]);
  });
  it('la commission calculée : 6 000 une seule fois (avant : 6 000 + 6 000 = 12 000)', () => {
    expect(calculs(ES)).toEqual({ e: 6000, s: 0, total: 6000 });
  });
  it('le calcul suit la ventilation des cartes (la partie y est déjà prise une fois, à l’entrée)', () => {
    const vt = ventilationVente(ES, null);
    expect([vt.entree!.base.ttcC, vt.sortie!.base.ttcC]).toEqual([1200000, 0]);
  });
  it('les montants ENREGISTRÉS ne changent pas : une commission saisie reste telle quelle, et les totaux (lignes) aussi', () => {
    const v = { ...ES, lignes: [L('entree', LEA.nom, 6000), L('sortie', LEA.nom, 1500)] };
    expect(remunerationDuCote(v, 'sortie')!.saisie).toEqual({ montant: 1500, unite: 'ttc' });
    expect(payeTtcDe(v)).toBe(7500);
  });
});

describe('🔴 les autres cas : INCHANGÉS', () => {
  it('un seul côté (entrée, sortie à pourvoir)', () => {
    const v = vente([P('entree', 5, LEA.nom, 100)], LEA, null);
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([100, null]);
    expect(calculs(v)).toEqual({ e: 6000, s: null, total: 6000 });
  });
  it('un seul côté (sortie seule)', () => {
    const v = vente([P('sortie', 5, LEA.nom, 100)], null, LEA);
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([null, 100]);
    expect(calculs(v)).toEqual({ e: null, s: 6000, total: 6000 });
  });
  it('partagée avec un collègue (50 / 50)', () => {
    const v = vente([P('entree', 5, LEA.nom, 50), P('sortie', 7, MARC.nom, 50)], LEA, MARC);
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([50, 50]);
    expect(calculs(v)).toEqual({ e: 3000, s: 3000, total: 6000 });
  });
  it('deux côtés via le formulaire (entrée 100 %, la sortie à 0 non enregistrée)', () => {
    const v = vente([P('entree', 5, LEA.nom, 100)], LEA, LEA);
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([100, 0]);
    expect(calculs(v)).toEqual({ e: 6000, s: 0, total: 6000 });
  });
  it('deux côtés au même négociateur, 60 / 40', () => {
    const v = vente([P('entree', 5, LEA.nom, 60), P('sortie', 5, LEA.nom, 40)], LEA, LEA);
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([60, 40]);
    expect(calculs(v)).toEqual({ e: 3600, s: 2400, total: 6000 });
  });
});
