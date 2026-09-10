import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompteRenduCartouche, type DonneesCartouche } from './CompteRenduCartouche';
import { LIBELLE_NON_DECLARE, LIBELLE_NON_INSTRUIT } from './compteRendu';
import type { GlobalPermis, CorpsBatiment } from '../../../../lib/permis/caracteristiquesRepo';
import type { JournalPermis } from '../../../../lib/permis/journalLecture';
import type { ParcelleLigne } from '../../../../lib/permis/parcellesRepo';
import type { DeclarationsRecapCerfa } from '../../../../lib/permis/recapCerfa';
import type { FaitsPermis } from './caracteristiquesForm';

/** CR-2a — la CARTOUCHE, testée en NODE PUR (renderToStaticMarkup, aucun jsdom). On assertionne le CONTENU rendu, pas le balisage. */

const GLOBAL_VIDE: GlobalPermis = {
  parking: null, parkingOrigine: null, commentaire: null, majLe: null, majPar: null,
  natureProjet: null, natureProjetOrigine: null, surfacePlancherM2: null, surfacePlancherM2Origine: null,
  nbLogements: null, nbLogementsOrigine: null, nbPlacesStationnement: null, nbPlacesStationnementOrigine: null,
  adresseTerrain: null, adresseTerrainOrigine: null, designation: null, designationOrigine: null,
  destinations: null, destinationsOrigine: null, altitudeSommetNgf: null, altitudeSommetNgfOrigine: null,
};
const glob = (p: Partial<GlobalPermis>): GlobalPermis => ({ ...GLOBAL_VIDE, ...p });

const CORPS_VIDE: CorpsBatiment = {
  id: 1, repere: null, nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
  altitudeDernierPlancherNgf: null, altitudeDernierPlancherNgfOrigine: null, altitudeSommetNgf: null, altitudeSommetNgfOrigine: null,
  altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
  hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null, altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
  hauteurRelativeM: null, hauteurRelativeMOrigine: null, altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
  empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null,
};
const corps = (p: Partial<CorpsBatiment>): CorpsBatiment => ({ ...CORPS_VIDE, ...p });

const FAITS_VIDE: FaitsPermis = { numDau: 'X', type: 'PC', communeNom: 'Paris', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null };
const faits = (p: Partial<FaitsPermis>): FaitsPermis => ({ ...FAITS_VIDE, ...p });

const parcelle = (p: Partial<ParcelleLigne>): ParcelleLigne => ({
  id: 1, refRemplacee: null, prefixe: null, section: 'AB', numero: '157', superficieDeclareeM2: null, role: 'origine',
  origine: 'extraite', idu: null, confiance: null, reserve: null, provenance: null, majPar: null, majLe: null, acteurNom: null,
  communeCadastrale: null, contenance: null, aireCadastraleM2: null, aGeometrie: false, deptCharge: false, ...p,
});

const DECL_VIDE: DeclarationsRecapCerfa = {
  dateDepot: null, superficieTerrainM2: null, logementsTotal: null, logementsIndividuels: null, logementsCollectifs: null,
  niveauxDessusSol: null, niveauxDessousSol: null, stationnementAvant: null, stationnementApres: null, empriseAuSolCreeeM2: null,
  surfacePlancherTotaleM2: null, descriptionProjet: null, descriptionProjetProvenance: 'absent',
  descriptionScission: { genere: null, humain: null, valeurs: null }, decompte: null, absents: [], ambigus: [], present: false,
};
const decl = (p: Partial<DeclarationsRecapCerfa>): DeclarationsRecapCerfa => ({ ...DECL_VIDE, ...p });

const journal = (permis: JournalPermis['permis'] = {}, parCorps: JournalPermis['parCorps'] = {}): JournalPermis => ({ permis, parCorps });
const rendre = (donnees: DonneesCartouche): string => renderToStaticMarkup(createElement(CompteRenduCartouche, { donnees }));

describe('CompteRenduCartouche — cartouche complète (dossier 468)', () => {
  const donnees: DonneesCartouche = {
    faits: faits({ adresse: "21 Rue de l'Inspecteur Allès, 75019 PARIS", natureTravaux: 'Construction neuve', dateAutorisation: '2025-02-14' }),
    global: glob({ nbLogements: 5, nbLogementsOrigine: 'extraite', destinations: ['Logement'], destinationsOrigine: 'extraite', surfacePlancherM2: 818, surfacePlancherM2Origine: 'extraite', adresseTerrain: "21 Rue de l'Inspecteur Allès", adresseTerrainOrigine: 'extraite' }),
    corps: [corps({ id: 1, repere: 'A', nbEtages: 5, nbEtagesOrigine: 'extraite', nbNiveauxSousSol: 1, nbNiveauxSousSolOrigine: 'extraite', hauteurMaxPluNgf: 84, hauteurMaxPluNgfOrigine: 'extraite' })],
    journal: journal({ nb_logements: { confiance: 'a_verifier', reserve: null, provenances: [], motif: null, methode: 'cerfa' } }, { 1: { nb_etages: { confiance: null, reserve: null, provenances: [], motif: null, methode: 'enonce' } } }),
    parcelles: [parcelle({ section: 'AB', numero: '157', prefixe: '0' })],
    declarations: decl({
      dateDepot: '17/01/2025', descriptionProjet: 'Construction… 818.0 m². Le projet comprend 5 logements BRS et 11 logements PLI.',
      descriptionScission: { genere: "Construction d’un bâtiment à R+4 sur 1 niveau(x) de sous-sol à destination d'habitation Surface créée: 818.0 m².", humain: 'Le projet comprend 5 logements BRS (soit 30% de l’opération) et 11 logements PLI.', valeurs: { niveauxHorsSol: 4, niveauxSousSol: 1, destination: "d'habitation", surfaceCreeeM2: 818 } },
    }),
    piecesCerfa: [{ id: 521, nom: 'cerfa_13409-13.pdf', pages: 42 }],
  };
  const h = rendre(donnees);
  it('montre les faits avec leur provenance lisible', () => {
    expect(h).toContain('Inspecteur Allès, 75019 PARIS'); // (l'apostrophe est échappée par le rendu HTML)
    expect(h).toContain('déclaré au Cerfa');       // logements = methode cerfa
    expect(h).toContain('plans et coupes');         // étages = methode enonce
    expect(h).toContain('registre Sitadel');        // date d'obtention
  });
  it('distingue les deux parts de la description', () => {
    expect(h).toContain('Ce que le pétitionnaire a écrit');
    expect(h).toContain('11 logements PLI');
    expect(h).toContain('Ce que le téléservice a généré');
    expect(h).toContain('généré par le téléservice');
    expect(h).toContain('habitation'); // destination générée (apostrophe échappée par le rendu)
  });
  it('liste les pièces analysées avec pages + garde le texte source (replié)', () => {
    expect(h).toContain('cerfa_13409-13.pdf');
    expect(h).toContain('42 page(s)');
    expect(h).toContain('Voir le texte source du Cerfa');
  });
});

describe('CompteRenduCartouche — trois états (non déclaré vs pas encore instruit)', () => {
  it('date d’obtention absente → « non déclaré dans ce Cerfa » ; logements absents → « pas encore instruit »', () => {
    const h = rendre({
      faits: faits({ adresse: 'Rue X', dateAutorisation: null }), global: glob({}), corps: [],
      journal: journal(), parcelles: [], declarations: decl({}), piecesCerfa: [],
    });
    expect(h).toContain(LIBELLE_NON_DECLARE);   // date d'obtention (le Cerfa est la pièce de dépôt)
    expect(h).toContain(LIBELLE_NON_INSTRUIT);  // logements pas encore produits
    expect(LIBELLE_NON_DECLARE).not.toBe(LIBELLE_NON_INSTRUIT);
  });
});

describe('CompteRenduCartouche — divergence R+N (cas 470)', () => {
  it('montre R+4 (téléservice) et R+5 (humain), retient la déclaration humaine, à corroborer', () => {
    const h = rendre({
      faits: faits({}), global: glob({}), corps: [], journal: journal(), parcelles: [],
      declarations: decl({ descriptionScission: { genere: 'Construction d’un bâtiment à R+4 sur 0 niveau(x) de sous-sol à destination null Surface créée: 2590.0 m².', humain: "Construction de 60 logements dans un bâtiment allant jusqu'au R+5 avec deux locaux commerciaux.", valeurs: { niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: 2590 } } }),
      piecesCerfa: [{ id: 1, nom: 'cerfa.pdf', pages: 3 }],
    });
    expect(h).toContain('Divergences');
    expect(h).toContain('R+4');
    expect(h).toContain('R+5');
    expect(h).toContain('à corroborer');
  });
  it('conserve l’alerte « Ambigu, non retenu : nature du projet »', () => {
    const h = rendre({
      faits: faits({}), global: glob({}), corps: [], journal: journal(), parcelles: [],
      declarations: decl({ ambigus: [{ champ: 'nature du projet', motif: 'deux libellés sans marque de sélection' }] }), piecesCerfa: [],
    });
    expect(h).toContain('Ambigu, non retenu');
    expect(h).toContain('nature du projet');
  });
});

describe('CompteRenduCartouche — aucune pièce en GED', () => {
  it('le dit clairement (jamais un vide muet)', () => {
    const h = rendre({ faits: faits({}), global: glob({}), corps: [], journal: journal(), parcelles: [], declarations: decl({}), piecesCerfa: [] });
    expect(h).toContain('Aucune pièce Cerfa dans la GED');
  });
});
