import { describe, it, expect } from 'vitest';
import { dossiersSatisfaits, type DossierPourSatisfaction } from './satisfactionDossier';

/**
 * R6c — satisfaction PURE, haute précision. Numéro Sitadel COMPLET reconnu littéralement (pièce jointe ou corps) →
 * satisfait ; tronqué / partiel / autre dossier → NON. En cas de doute, on ne marque pas.
 */
const DOSSIERS: DossierPourSatisfaction[] = [
  { dossierId: 1, numDau: 'PC 075 056 19 00042' }, // même numéro avec séparateurs → normalisé identique
  { dossierId: 2, numDau: 'PC0920042500001' },
];

describe('R6c — dossiersSatisfaits', () => {
  it('numéro complet dans un NOM DE PIÈCE JOINTE → satisfait (séparateurs normalisés)', () => {
    const r = dossiersSatisfaits({ piecesNoms: ['PC075056190004 2 — plan de masse.pdf'], corpsTexte: null }, DOSSIERS);
    expect(r).toEqual([1]);
  });

  it('numéro complet dans le CORPS → satisfait', () => {
    const r = dossiersSatisfaits({ piecesNoms: [], corpsTexte: 'Veuillez trouver les pièces du dossier PC0920042500001 ci-jointes.' }, DOSSIERS);
    expect(r).toEqual([2]);
  });

  it('numéro TRONQUÉ / partiel → NON satisfait', () => {
    const r = dossiersSatisfaits({ piecesNoms: ['PC075056.pdf'], corpsTexte: 'dossier PC 075 056 19 (suite à venir)' }, DOSSIERS);
    expect(r).toEqual([]); // ni le nom ni le corps ne contiennent le numéro COMPLET
  });

  it('numéro d’un AUTRE dossier → ne satisfait pas celui visé', () => {
    const r = dossiersSatisfaits({ piecesNoms: [], corpsTexte: 'dossier PC0920042500001' }, [DOSSIERS[0]]);
    expect(r).toEqual([]); // seul le n° du dossier 2 est présent ; le dossier 1 n'est pas satisfait
  });

  it('aucune correspondance → liste vide', () => {
    const r = dossiersSatisfaits({ piecesNoms: ['accuse-reception.pdf'], corpsTexte: 'Nous accusons réception de votre demande.' }, DOSSIERS);
    expect(r).toEqual([]);
  });

  it('plusieurs dossiers reconnus dans une même réponse', () => {
    const r = dossiersSatisfaits({ piecesNoms: ['PC0750561900042.pdf'], corpsTexte: 'et aussi PC0920042500001' }, DOSSIERS);
    expect(r).toEqual([1, 2]);
  });
});

describe('N6-D — sources ADDITIVES (objet, corps HTML) : additives, sans seconde normalisation', () => {
  it('numéro présent SEULEMENT dans l’OBJET → reconnu', () => {
    const r = dossiersSatisfaits({ piecesNoms: ['plan.pdf'], corpsTexte: null, objet: 'permis PC 092 004 25 00001 pièces' }, DOSSIERS);
    expect(r).toEqual([2]);
  });
  it('numéro présent SEULEMENT dans le corps HTML → reconnu (TEXTE extrait, pas les balises/attributs)', () => {
    const html = '<div><p>Référence du dossier&nbsp;: PC0920042500001</p></div>';
    expect(dossiersSatisfaits({ piecesNoms: [], corpsTexte: null, corpsHtml: html }, DOSSIERS)).toEqual([2]);
  });
  it('un numéro caché dans un ATTRIBUT HTML (href) n’est PAS lu (on n’examine que le texte)', () => {
    const html = '<a href="https://x/PC0920042500001/view">télécharger</a>';
    expect(dossiersSatisfaits({ piecesNoms: [], corpsTexte: null, corpsHtml: html }, DOSSIERS)).toEqual([]);
  });
  it('NON-RÉGRESSION : un appelant qui NE fournit ni objet ni corpsHtml → résultat identique à avant', () => {
    // même entrée que le test « corps » historique, sans les nouveaux champs
    expect(dossiersSatisfaits({ piecesNoms: [], corpsTexte: 'dossier PC0920042500001 ci-joint' }, DOSSIERS)).toEqual([2]);
    // objet/corpsHtml undefined ⇒ chaînes vides ⇒ ne peuvent JAMAIS ajouter de correspondance
    expect(dossiersSatisfaits({ piecesNoms: ['accuse.pdf'], corpsTexte: 'rien' }, DOSSIERS)).toEqual([]);
  });
});
