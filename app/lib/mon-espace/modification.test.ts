import { describe, expect, it } from 'vitest';
import { commissionsConservees, journalPourLeTitulaire, MOTIF_MODIFIER_PAS_SUR_UN_COTE, MOTIF_REJOINDRE_COTE_TENU, MOTIF_REJOINDRE_DEJA, MOTIF_REJOINDRE_GARDER,
  MOTIF_REJOINDRE_MANDAT, MOTIF_RESTER_SUR_UN_COTE, refusModification } from './modification';
import type { LigneVente, Vente } from '../transaction/modele';
import type { DossierSaisie } from '../transaction/saisie';

/**
 * 🔴 MON ESPACE, LOT 6 — les règles de « Modifier » et « Rejoindre » depuis « Mon espace » (PUR) : qui peut écrire, rejoindre un côté libre avec la
 * preuve du n° de mandat, les commissions reprises de la vente enregistrée (jamais écrasées par une valeur absente), l'historique d'un collaborateur.
 * Marc (7) tient l'entrée ; Léa (5) rejoint la sortie. Données fictives.
 */
const ligne = (o: Partial<LigneVente> & Pick<LigneVente, 'negociateur' | 'role'>): LigneVente => ({ id: 1, montantTtc: null, nature: 'compromis', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const vente = (o: Partial<Vente> = {}): Vente => ({ id: 3, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, numeroMandat: 'M-0042',
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 7, nom: 'Marc DURAND' }, sortie: null, apporteurId: null, personnes: [] },
  lignes: [ligne({ negociateur: 'Marc DURAND', role: 'negociateur', cote: 'entree', montantHt: 2499.99, montantTtc: 2999.99, taux: 47, mode: 'manuelle' })], ...o });
const saisie = (o: Partial<DossierSaisie> = {}): DossierSaisie => ({ societe: 'criterimmo', statut: 'compromis', libelle: null, honorairesTtc: 12000, dateCompromis: null, dateActePrevue: null,
  dateActe: null, adresseBien: null, note: null, entreeId: 7, sortieId: 5, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc', personnes: [],
  parties: [{ sorte: 'entree', compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie', compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
  prixVente: null, lignes: [], ...o });
const LEA = 5;

describe('🔴 les commissions d’une saisie de la vue personnelle : reprises de la vente enregistrée', () => {
  it('le côté de Marc (inchangé) : SA commission telle qu’enregistrée (montant dans son unité, taux, mode) ; le côté que Léa prend : « calculé »', () => {
    expect(commissionsConservees(vente(), saisie())).toEqual({ entree: { montant: 2499.99, unite: 'ht' }, sortie: null,
      taux: { entree: 47, sortie: null }, mode: { entree: 'manuelle', sortie: 'calculee' } });
  });
  it('un côté dont le négociateur change repart « calculé » ; un côté sans négociateur : aucune', () => {
    expect(commissionsConservees(vente(), saisie({ entreeId: 9, sortieId: null })).mode).toEqual({ entree: 'calculee', sortie: null });
  });
});

describe('🔴 qui peut modifier depuis « Mon espace »', () => {
  it('un collaborateur absent : 403 ; présent : accepté s’il reste sur un côté ; administrateur : toujours', () => {
    expect(refusModification(vente(), saisie(), { compteId: LEA, administrateur: false, surLaVente: false, rejoindre: null })).toEqual({ statut: 403, motif: MOTIF_MODIFIER_PAS_SUR_UN_COTE });
    expect(refusModification(vente(), saisie(), { compteId: 7, administrateur: false, surLaVente: true, rejoindre: null })).toBeNull();
    expect(refusModification(vente(), saisie({ entreeId: 9, parties: [] }), { compteId: 7, administrateur: false, surLaVente: true, rejoindre: null }))
      .toEqual({ statut: 422, motif: MOTIF_RESTER_SUR_UN_COTE });
    expect(refusModification(vente(), saisie({ entreeId: 9, sortieId: null, parties: [] }), { compteId: 1, administrateur: true, surLaVente: false, rejoindre: null })).toBeNull();
  });
});

describe('🔴 rejoindre : la preuve du n°, un côté LIBRE, personne n’est retiré', () => {
  const o = (rejoindre: string, surLaVente = false) => ({ compteId: LEA, administrateur: false, surLaVente, rejoindre: { numero: rejoindre } });
  it('le bon n° (écrit autrement) et la sortie libre : accepté', () => {
    expect(refusModification(vente(), saisie(), o('m 42'))).toBeNull();
  });
  it('un autre n° : 403', () => {
    expect(refusModification(vente(), saisie(), o('M-43'))).toEqual({ statut: 403, motif: MOTIF_REJOINDRE_MANDAT });
  });
  it('le côté déjà tenu (Léa à l’entrée, à la place de Marc) : refusé ; retirer Marc : refusé ; déjà sur l’affaire : refusé', () => {
    expect(refusModification(vente(), saisie({ entreeId: LEA, sortieId: null }), o('M42'))).toEqual({ statut: 422, motif: MOTIF_REJOINDRE_COTE_TENU });
    expect(refusModification(vente(), saisie({ entreeId: null }), o('M42'))).toEqual({ statut: 422, motif: MOTIF_REJOINDRE_GARDER });
    expect(refusModification(vente(), saisie(), o('M42', true))).toEqual({ statut: 422, motif: MOTIF_REJOINDRE_DEJA });
  });
});

describe('l’historique lu par un collaborateur', () => {
  it('sans les commissions (montants et taux des deux côtés) ; un administrateur : tout', () => {
    const js = [{ action: 'saisie' }, { action: 'commissions' }, { action: 'repartition' }, { action: 'modification' }];
    expect(journalPourLeTitulaire(js, false).map((j) => j.action)).toEqual(['saisie', 'repartition', 'modification']);
    expect(journalPourLeTitulaire(js, true)).toHaveLength(4);
  });
});
