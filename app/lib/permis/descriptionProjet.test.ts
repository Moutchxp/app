import { describe, it, expect } from 'vitest';
import { estGabaritVierge, lireDescriptionProjetTexte, choisirDescriptionProjet } from './descriptionProjet';
import { lireDeclarationsRecapCerfa } from './recapCerfa';

/**
 * CR-1 — coupe robuste de la description de projet. On assertionne le COMPORTEMENT sur des EXTRAITS DE TEXTE RÉELS (forme pdfjs
 * mesurée sur les dossiers 468 / 531 / 7424), jamais la forme d'une regex. Cas couverts : ordre normal (valeur après le libellé),
 * ordre inversé (valeur AVANT le libellé, cas 468 aplati par iText), gabarit vierge seul → refus, absence → vide, AcroForm → prime.
 */

// Ordre NORMAL — champ libre Cerfa : la valeur SUIT « Courte description… », puis vient le gabarit (pagination, sections, cases cochées).
const ORDRE_NORMAL = [
  'Courte description de votre projet ou de vos travaux :',
  'Construction d’une résidence sociale de 21 logements R+3+attique+combles sur 1 niveau de sous-sol.',
  'Abattage de 2 arbres et 1 arbuste, replantation de 1 arbre et 10 arbustes. Surface créée: 586.0 m².',
  '2 1 2 1 2 1 X 6 / 23 4.4 Construction périodiquement démontée et ré-installée',
].join(' ');

// Ordre INVERSÉ — récapitulatif télé-service (dossier 468) : le flux aplati place la valeur AVANT le libellé « Courte description »
// du gabarit. La vraie phrase est dans le bloc des valeurs, JUSTE AVANT le numéro de Cerfa « 13409*13 ». Le libellé « Courte
// description » qui suit n'est suivi que du gabarit vierge (« Superficie du (ou des) terrain… »).
const ORDRE_INVERSE = [
  'Type de dossier : Commune : Adresse principale : Description du projet : Page de présentation et CGU',
  'CERFA de la demande de type : Formulaire demandeur(s) complémentaire(s) : Ce document récapitule',
  'PC 21 Rue de l’Inspecteur Allès, 75019 PARIS Raison sociale RIVP (daniel.schneider@rivp.fr)',
  'Construction d’un bâtiment à R+4 sur 1 niveau(x) de sous-sol à destination d\'habitation Surface créée: 818.0 m².',
  'Le projet comprend 5 logements BRS (soit 30% de l’opération) et 11 logements PLI.',
  '13409*13 Dépôt numérique frederic.borel@fredericborel.fr 04/06/2024',
  'Courte description de votre projet ou de vos travaux : Superficie du (ou des) terrain(s) à aménager (en m2) :',
  'En cas de besoin, vous pouvez vous renseigner auprès de la mairie. 5 / 26',
].join(' ');

// GABARIT VIERGE seul — le libellé n'est suivi QUE de champs de formulaire non remplis (aucune déclaration).
const GABARIT_SEUL = [
  'Courte description de votre projet ou de vos travaux :',
  'Superficie du (ou des) terrain(s) à aménager (en m2) : En cas de besoin, vous pouvez vous renseigner auprès de la mairie.',
  '5 / 26 À remplir pour une demande concernant un lotissement Nombre maximum de lots projetés :',
].join(' ');

describe('lireDescriptionProjetTexte — les deux ordres de flux', () => {
  it('ordre NORMAL (valeur après le libellé) : rend la déclaration, sans la traîne de gabarit', () => {
    const v = lireDescriptionProjetTexte(ORDRE_NORMAL);
    expect(v).toBe(
      'Construction d’une résidence sociale de 21 logements R+3+attique+combles sur 1 niveau de sous-sol. Abattage de 2 arbres et 1 arbuste, replantation de 1 arbre et 10 arbustes. Surface créée: 586.0 m².',
    );
    expect(v).not.toMatch(/Construction périodiquement démontée/); // le gabarit qui suit n'est jamais happé
  });

  it('ordre INVERSÉ (cas 468 : valeur AVANT son libellé) : rend la vraie phrase, pas le gabarit', () => {
    const v = lireDescriptionProjetTexte(ORDRE_INVERSE);
    expect(v).toContain('Construction d’un bâtiment à R+4 sur 1 niveau(x) de sous-sol');
    expect(v).toContain('11 logements PLI.');
    expect(v).not.toMatch(/Superficie du \(ou des\) terrain/); // le gabarit vierge sous « Courte description » est refusé
    expect(v).not.toMatch(/Raison sociale/);                   // le bloc demandeur qui précède est une borne, jamais inclus
  });
});

describe('lireDescriptionProjetTexte — refus plutôt qu’un gabarit', () => {
  it('gabarit vierge seul → null (mieux vaut vide qu’un faux)', () => {
    expect(lireDescriptionProjetTexte(GABARIT_SEUL)).toBeNull();
  });
  it('aucune étiquette ni déclaration → null', () => {
    expect(lireDescriptionProjetTexte('un plan de masse quelconque, sans étiquette de description')).toBeNull();
  });
});

describe('estGabaritVierge — détecteur pur des marqueurs du formulaire non rempli', () => {
  it('reconnaît les marques de gabarit', () => {
    expect(estGabaritVierge('À remplir pour une demande concernant un lotissement')).toBe(true);
    expect(estGabaritVierge('En cas de besoin, vous pouvez vous renseigner')).toBe(true);
    expect(estGabaritVierge('Nombre maximum de lots projetés')).toBe(true);
    expect(estGabaritVierge('7 / 26')).toBe(true); // pagination du Cerfa vierge
  });
  it('ne rejette pas une vraie déclaration', () => {
    expect(estGabaritVierge('Construction d’un bâtiment à R+4, 12 logements. Surface créée: 818 m².')).toBe(false);
  });
});

describe('choisirDescriptionProjet — hiérarchie de provenance (AcroForm prime)', () => {
  it('un AcroForm renseigné PRIME sur toute coupe de texte', () => {
    const r = choisirDescriptionProjet({ acroform: 'Surélévation et création de 3 logements.', texte: ORDRE_INVERSE });
    expect(r.provenance).toBe('acroform');
    expect(r.valeur).toBe('Surélévation et création de 3 logements.');
  });
  it('un AcroForm vide (ou gabarit) est ignoré → repli sur le texte', () => {
    expect(choisirDescriptionProjet({ acroform: '   ', texte: ORDRE_INVERSE }).provenance).toBe('texte');
    expect(choisirDescriptionProjet({ acroform: 'À remplir pour une demande', texte: ORDRE_INVERSE }).provenance).toBe('texte');
  });
  it('sans AcroForm et sans déclaration lisible → absent, valeur null', () => {
    const r = choisirDescriptionProjet({ acroform: null, texte: GABARIT_SEUL });
    expect(r).toEqual({ valeur: null, provenance: 'absent' });
  });
});

describe('lireDeclarationsRecapCerfa — intègre la coupe robuste + provenance', () => {
  it('sur un récapitulatif à flux inversé, remplit descriptionProjet et note la provenance', () => {
    const d = lireDeclarationsRecapCerfa(ORDRE_INVERSE);
    expect(d.descriptionProjet).toContain('Construction d’un bâtiment à R+4');
    expect(d.descriptionProjetProvenance).toBe('texte');
  });
  it('l’AcroForm passé en option prime et fixe la provenance', () => {
    const d = lireDeclarationsRecapCerfa(ORDRE_INVERSE, { descriptionAcroform: 'Immeuble neuf de 12 logements.' });
    expect(d.descriptionProjet).toBe('Immeuble neuf de 12 logements.');
    expect(d.descriptionProjetProvenance).toBe('acroform');
  });
});
