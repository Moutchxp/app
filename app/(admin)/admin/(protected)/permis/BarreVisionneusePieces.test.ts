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

describe('LIGNE DE STATUT — une seule ligne sous l’image : titre · retour · statut image · IA · bascule best-of', () => {
  it('ORDRE de gauche à droite : titre → retour → « Image … » → capsule IA → bascule best-of', () => {
    // hors best-of (retour visible) pour asserter les 5 éléments dans l'ordre.
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ nav: 'bestof', pageDansBestOf: false })));
    const iTitre = html.indexOf('Best-of des plans proposés');
    const iRetour = html.indexOf('revenir au best-of');
    const iStatut = html.indexOf('Image fichier');
    const iIA = html.indexOf('non analysée IA');
    const iToggle = html.indexOf('ajouter au best-of');
    for (const i of [iTitre, iRetour, iStatut, iIA, iToggle]) expect(i).toBeGreaterThan(-1);
    expect(iTitre).toBeLessThan(iRetour);
    expect(iRetour).toBeLessThan(iStatut);
    expect(iStatut).toBeLessThan(iIA);
    expect(iIA).toBeLessThan(iToggle);
    // pas de DOUBLON : l'ancien bandeau « Vous parcourez… » a disparu.
    expect(html).not.toContain('Vous parcourez');
  });

  it('RETOUR : rendu SEULEMENT hors best-of (mode pièce OU image hors sélection) ; absent quand l’image EST au best-of', () => {
    // bestof + image best-of → dans la sélection → PAS de retour, statut « Image best-of ».
    const dedans = renderToStaticMarkup(h(BarreVisionneusePieces, props({ nav: 'bestof', pageDansBestOf: true })));
    expect(dedans).toContain('Image best-of');
    expect(dedans).not.toContain('revenir au best-of');
    // bestof + image hors best-of → retour présent.
    const horsImage = renderToStaticMarkup(h(BarreVisionneusePieces, props({ nav: 'bestof', pageDansBestOf: false })));
    expect(horsImage).toContain('revenir au best-of');
    // mode pièce (on navigue dans un fichier) → retour présent même si l'image est au best-of.
    const modePiece = renderToStaticMarkup(h(BarreVisionneusePieces, props({ nav: 'piece', pageDansBestOf: true })));
    expect(modePiece).toContain('revenir au best-of');
    expect(modePiece).toContain('Pièce : A.pdf'); // titre en mode pièce
  });

  it('BASCULE best-of dans les DEUX sens (par l’état pageDansBestOf) : « ✕ retirer » si dedans, « ＋ ajouter » sinon', () => {
    const dedans = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pageDansBestOf: true })));
    expect(dedans).toContain('✕ retirer du best-of');
    expect(dedans).not.toContain('＋ ajouter au best-of');
    const dehors = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pageDansBestOf: false })));
    expect(dehors).toContain('＋ ajouter au best-of');
    expect(dehors).not.toContain('✕ retirer du best-of');
  });
});
