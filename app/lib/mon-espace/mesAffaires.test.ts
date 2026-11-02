import { describe, expect, it } from 'vitest';
import { compteursMonEspace, estAMoi, mesCotes, monCa, sansCommissionsDesAutres, type Moi } from './mesAffaires';
import { espaceNegociateurs } from '../transaction/carteAffaireLignes';
import type { LigneVente, Vente } from '../transaction/modele';

/**
 * 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — « mes affaires » (PUR) : deux comptes, trois ventes. Léa (compte 5) et Marc (compte 7) :
 *   · A : compromis partagé — Léa à l'entrée (CRITERIMMO), Marc à la sortie (MACJ), chacun sa commission et son taux ;
 *   · B : compromis de Marc seul ;
 *   · C : vente importée (2026) de l'onglet « LEA » des fichiers (libellé rattaché au compte de Léa), avec la paye de LEA et celle de « MARC ».
 * Données fictives.
 */
const ligne = (o: Partial<LigneVente> & Pick<LigneVente, 'negociateur' | 'role'>): LigneVente => ({ id: Math.floor(Math.random() * 1e6), montantTtc: null, nature: 'vente', compte: true,
  origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const base = (o: Partial<Vente>): Vente => ({ id: 0, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-10-01',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const A = base({ id: 1, libelle: 'PARTAGÉE', numeroMandat: 'M1',
  repartition: { retroApporteurTtc: 0, parties: [
    { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null }] },
  dossier: { adresseBien: '1 rue A', dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null, personnes: [] },
  lignes: [ligne({ negociateur: 'Léa MARTIN', role: 'negociateur', cote: 'entree', montantTtc: 3000, taux: 50 }),
    ligne({ negociateur: 'Marc DURAND', role: 'negociateur', cote: 'sortie', montantTtc: 1777.77, taux: 37 })] });
const B = base({ id: 2, libelle: 'DE MARC',
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree_sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 7, nom: 'Marc DURAND' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null, personnes: [] } });
const C = base({ id: 3, libelle: 'IMPORTÉE', statut: 'vendue', mois: 3, origine: 'import', honorairesTtc: 6000,
  lignes: [ligne({ negociateur: 'LEA', role: 'vendeur' }), ligne({ negociateur: 'LEA', role: 'negociateur', montantTtc: 1500 }), ligne({ negociateur: 'MARC', role: 'negociateur', montantTtc: 444.44 })] });
const LEA: Moi = { compteId: 5, libelles: new Set(['Léa MARTIN', 'LEA']) };
const MARC: Moi = { compteId: 7, libelles: new Set(['Marc DURAND', 'MARC']) };
const AUTRE: Moi = { compteId: 9, libelles: new Set() };

describe('🔴 à qui est une vente', () => {
  it('Léa : A (entrée) et C (libellé des fichiers rattaché) ; jamais B', () => {
    expect([A, B, C].filter((v) => estAMoi(v, LEA)).map((v) => v.id)).toEqual([1, 3]);
    expect([mesCotes(A, LEA), mesCotes(C, LEA)]).toEqual([['entree'], ['unique']]);
  });
  it('Marc : A (sortie) et B (entrée et sortie) ; C seulement parce que sa paye y figure', () => {
    expect([A, B].map((v) => mesCotes(v, MARC))).toEqual([['sortie'], ['entree', 'sortie']]);
  });
  it('un compte sur aucun côté : aucune vente', () => {
    expect([A, B, C].filter((v) => estAMoi(v, AUTRE))).toEqual([]);
  });
});

describe('🔴 la vente reçue par un collaborateur : ni la commission ni le taux de l’AUTRE', () => {
  it('A vue par Léa : sa commission et son taux restent ; ceux de Marc sont ABSENTS de l’objet (le JSON ne les contient pas)', () => {
    const vue = sansCommissionsDesAutres(A, LEA);
    expect(vue.lignes.filter((l) => l.role === 'negociateur').map((l) => [l.negociateur, l.montantTtc, l.taux])).toEqual([['Léa MARTIN', 3000, 50]]);
    const json = JSON.stringify(vue);
    expect(json).not.toContain('1777.77');
    expect(json).not.toContain('"taux":37');
    // Toute la vente reste : les deux côtés et leurs parts d'honoraires, le n° de mandat, le bien.
    expect(vue.repartition!.parties.map((p) => [p.negociateur, p.pourcentage])).toEqual([['Léa MARTIN', 60], ['Marc DURAND', 40]]);
    expect([vue.numeroMandat, vue.dossier?.adresseBien, vue.honorairesTtc]).toEqual(['M1', '1 rue A', 12000]);
  });
  it('A vue par Marc : l’inverse', () => {
    const json = JSON.stringify(sansCommissionsDesAutres(A, MARC));
    expect(json).toContain('1777.77');
    expect(json).not.toContain('"montantTtc":3000');
    expect(json).not.toContain('"taux":50');
  });
  it('C (importée) vue par Léa : la paye de MARC est retirée, la sienne reste ; les lignes d’honoraires restent', () => {
    expect(sansCommissionsDesAutres(C, LEA).lignes.map((l) => [l.negociateur, l.role])).toEqual([['LEA', 'vendeur'], ['LEA', 'negociateur']]);
  });
});

describe('« Mon CA » (décision 1) = les honoraires de mes côtés, par l’Espace par négociateur (aucun calcul recopié)', () => {
  it('égal aux lignes de l’Espace par négociateur (vue FUSION) qui me désignent ; la somme des deux titulaires = la vente', () => {
    const espace = espaceNegociateurs([A], null);
    const de = (n: string) => espace.find((l) => l.negociateur === n)!.ca;
    expect(monCa([A], LEA)).toEqual(de('Léa MARTIN'));
    expect(monCa([A], MARC)).toEqual(de('Marc DURAND'));
    // 12 000 € TTC = 10 000 € HT : 60 % / 40 %, sans double compte
    expect([monCa([A], LEA).htC, monCa([A], MARC).htC]).toEqual([600000, 400000]);
  });
  it('les compteurs : compromis en cours, ventes actées de l’année (année de l’acte)', () => {
    const lea = compteursMonEspace([A, B, C], LEA, '2026-11-02');
    // C (importée) : la part de LEA telle que l'Espace par négociateur la donne (la règle du partage d'une vente importée, inchangée).
    const caC = espaceNegociateurs([C], null).find((l) => l.negociateur === 'LEA')!.ca;
    expect([lea.compromis.ids, lea.compromis.ca.htC, lea.actees.ids, lea.actees.ca, lea.actees.annee]).toEqual([[1], 600000, [3], caC, 2026]);
    // 🔴 LOT 4 — « Mes ventes » : mes ventes actées par année de l'acte (la plus récente d'abord)
    const ancienne = { ...C, id: 5, annee: 2024 };
    expect(compteursMonEspace([A, C, ancienne], LEA, '2026-11-02').parAnnee?.map((a) => [a.annee, a.ids])).toEqual([[2026, [3]], [2024, [5]]]);
    const marc = compteursMonEspace([A, B, C], MARC, '2026-11-02');
    expect([marc.compromis.ids, marc.compromis.ca.htC]).toEqual([[1, 2], 400000 + 1000000]);
    expect(compteursMonEspace([A, B, C], AUTRE, '2026-11-02')).toEqual({ compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } },
      actees: { annee: 2026, nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, parAnnee: [] });
  });
  it('une vente notée chez les deux sociétés, pas encore attribuée : comptée nulle part (comme le Suivi CA)', () => {
    const double = { ...C, id: 4, double: { cle: 'd', attribution: 'a_attribuer' as const } };
    expect(compteursMonEspace([double], LEA, '2026-11-02').actees.nb).toBe(0);
  });
});
