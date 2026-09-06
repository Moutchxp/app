import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { BarreVisionneusePieces, type BarreVisionneusePiecesProps } from './BarreVisionneusePieces';
import type { StatutPage, ResumePagesAnalysees } from './TraceEmpriseRendu';

/**
 * BUG « voir toutes les pièces du dossier » ENTIÈREMENT VIDE (distinct du lot 9decccf) — RÉGRESSION de la factorisation : la barre
 * partagée faisait `return null` quand AUCUNE pièce n'est ouverte (`pieceId === null`), ce qui masquait AUSSI l'échappatoire
 * `slotPieces` (« voir toutes les pièces ») — donc plus aucun moyen de CHOISIR une pièce. Avant la factorisation, le sélecteur était
 * rendu INCONDITIONNELLEMENT. Ce test (composant PUR, renderToStaticMarkup) aurait attrapé le bug.
 */
const statutNeutre: StatutPage = { nature: 'aucune', origine: null, etat: 'non_identifiee', derive: false, dateLisible: null };
const resumeVide: ResumePagesAnalysees = { pagesIndividuelles: [], fichier: false, dateFichier: null };

function props(over: Partial<BarreVisionneusePiecesProps>): BarreVisionneusePiecesProps {
  return {
    pieceId: 55, nomCourant: 'A.pdf', page: 1, nbPagesPiece: 1, echelle: null,
    nav: 'bestof',
    slotNav: h('div', { 'data-slot': 'nav' }, 'BLOC-NAV'),
    slotPieces: h('div', { 'data-slot': 'pieces' }, 'SELECTEUR-PIECES'),
    onOuvrirDocument: () => {}, onPagePrecedente: () => {}, onPageSuivante: () => {}, onRetourBestOf: () => {},
    pageDansBestOf: false, onRetirerBestOf: () => {}, onAjouterBestOf: () => {},
    statutPage: statutNeutre, resumePages: resumeVide, pleinPagesAnalysees: false, onTogglePleinPages: () => {},
    reperEnCours: false, lectureEnCours: false,
    onAnalyseFichier: () => {}, onAnalysePage: () => {}, reperMsg: null, lectureRes: null, onAnnulerValeur: () => {},
    ...over,
  };
}

describe('BUG sélecteur VIDE — slotPieces (échappatoire) reste rendu même sans pièce ouverte', () => {
  it('pieceId === null : la barre n’est PAS nulle ; slotNav ET slotPieces (le sélecteur) sont rendus', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: null })));
    expect(html).toContain('SELECTEUR-PIECES'); // l'échappatoire pour CHOISIR une pièce est disponible
    expect(html).toContain('BLOC-NAV');
    // les commandes LIÉES À LA PAGE sont absentes sans pièce (pas de lien d'ouverture, pas d'analyses).
    expect(html).not.toContain('dans un nouvel onglet');
    expect(html).not.toContain('analyse du fichier complet');
  });

  it('pieceId défini : la barre rend TOUT (sélecteur + commandes de page)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 55 })));
    expect(html).toContain('SELECTEUR-PIECES');
    expect(html).toContain('dans un nouvel onglet');       // lien (page ouverte)
    expect(html).toContain('analyse du fichier complet');  // analyses (page ouverte)
  });
});
