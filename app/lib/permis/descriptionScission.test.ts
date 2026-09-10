import { describe, it, expect } from 'vitest';
import { scinderDescription, parserPartGeneree } from './descriptionScission';

/**
 * CR-1b — scinder généré / humain + parser la part générée. On assertionne le COMPORTEMENT sur les 4 descriptions RÉELLES rendues
 * par CR-1 (dossiers 470 / 468 / 531 / 7424), jamais la forme d'une regex.
 */

// 470 — MARQUEUR EXPLICITE : phrase générée (avec « 0 niveau(x) » et « null, null, null »), marqueur, puis le texte de l'architecte.
const D470 = "Construction d’un bâtiment à R+4 sur 0 niveau(x) de sous-sol à destination null, null, null Surface créée: 2590.0 m². //Remplace le texte généré automatiquement ci-dessus// Construction de 60 logements (39 LLI et 21 LLS) dans un bâtiment allant jusqu'au R+5 avec un niveau de rez-de- chaussée avec deux locaux commerciaux.";
// 468 — GABARIT IMPLICITE (pas de marqueur) : la phrase générée en tête, puis l'ajout humain.
const D468 = "Construction d’un bâtiment à R+4 sur 1 niveau(x) de sous-sol à destination d'habitation Surface créée: 818.0 m². Le projet comprend 5 logements BRS (soit 30% de l'opération) et 11 logements PLI.";
// 531 — 100 % HUMAIN : décrit un bâtiment mais PAS selon le gabarit rigide (« d'une résidence sociale … Abattage de 2 arbres … »).
const D531 = "Construction d’une résidence sociale de 21 logements R+3+attique+combles sur 1 niveau de sous-sol. Abattage de 2 arbres et 1 arbuste, replantation de 1 arbre et 10 arbustes. Surface créée: 586.0 m².";
// 7424 — 100 % HUMAIN (témoin négatif) : prose d'architecte, ne commence pas par le gabarit.
const D7424 = "Le projet concerne la construction d'un projet immobilier en surplomb partiel de la future gare Mairie d'Aubervilliers. Le projet consiste en la construction de 67 logements neufs sur 3 plots de A à C. 2 locaux commerciaux à rdc sont créés. 1 sous-sol (parking de 49 pl.) est également construit.";

describe('scinderDescription — marqueur explicite (470)', () => {
  const s = scinderDescription(D470);
  it('coupe AU MARQUEUR : avant = généré, après = humain', () => {
    expect(s.genere).toBe('Construction d’un bâtiment à R+4 sur 0 niveau(x) de sous-sol à destination null, null, null Surface créée: 2590.0 m².');
    expect(s.humain).toBe("Construction de 60 logements (39 LLI et 21 LLS) dans un bâtiment allant jusqu'au R+5 avec un niveau de rez-de- chaussée avec deux locaux commerciaux.");
    expect(s.humain).not.toMatch(/Remplace le texte/); // le marqueur n'est dans aucune des deux parts
  });
  it('valeurs dérivées : « 0 niveau(x) » ⇒ ABSENT, « null, null, null » ⇒ ABSENT (jamais 0 ni "null")', () => {
    expect(s.valeurs).toEqual({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: 2590.0 });
  });
});

describe('scinderDescription — gabarit implicite (468)', () => {
  const s = scinderDescription(D468);
  it('sépare la phrase générée (tête) de l’ajout humain', () => {
    expect(s.genere).toBe("Construction d’un bâtiment à R+4 sur 1 niveau(x) de sous-sol à destination d'habitation Surface créée: 818.0 m².");
    expect(s.humain).toBe("Le projet comprend 5 logements BRS (soit 30% de l'opération) et 11 logements PLI.");
  });
  it('valeurs dérivées lues correctement', () => {
    expect(s.valeurs).toEqual({ niveauxHorsSol: 4, niveauxSousSol: 1, destination: "d'habitation", surfaceCreeeM2: 818.0 });
  });
});

describe('scinderDescription — 100 % humain (jamais de supposition)', () => {
  it('531 : décrit un bâtiment hors gabarit rigide ⇒ tout humain, aucune valeur générée', () => {
    const s = scinderDescription(D531);
    expect(s.genere).toBeNull();
    expect(s.humain).toBe(D531);
    expect(s.valeurs).toBeNull();
  });
  it('7424 (témoin négatif) : prose d’architecte ⇒ tout humain, rien de générique extrait', () => {
    const s = scinderDescription(D7424);
    expect(s.genere).toBeNull();
    expect(s.humain).toBe(D7424);
    expect(s.valeurs).toBeNull();
  });
  it('description vide/null ⇒ deux parts nulles', () => {
    expect(scinderDescription(null)).toEqual({ genere: null, humain: null, valeurs: null });
    expect(scinderDescription('   ')).toEqual({ genere: null, humain: null, valeurs: null });
  });
});

describe('parserPartGeneree — pièges du 470 (0 et null ⇒ ABSENT)', () => {
  it('« 0 niveau(x) » ⇒ niveauxSousSol null, jamais 0', () => {
    expect(parserPartGeneree('Construction d’un bâtiment à R+2 sur 0 niveau(x) de sous-sol à destination d\'habitation Surface créée: 100.0 m².').niveauxSousSol).toBeNull();
  });
  it('« destination null » ⇒ null ; une vraie destination est gardée verbatim', () => {
    expect(parserPartGeneree('Construction d’un bâtiment à R+2 sur 1 niveau(x) de sous-sol à destination null Surface créée: 100.0 m².').destination).toBeNull();
    expect(parserPartGeneree('Construction d’un bâtiment à R+2 sur 1 niveau(x) de sous-sol à destination de commerce Surface créée: 100.0 m².').destination).toBe('de commerce');
  });
});
