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

describe('CAPSULE IA — quatre états distincts (vérité de l’analyse, y compris hors best-of)', () => {
  const lecture = (over: object) => ({ page: 1, envoyee: true, motif: null, nbValeurs: 0, resume: null, coutUsd: 0, creeLe: null, ...over });
  it('VALEURS (envoyée + nbValeurs>0) → « Page analysée IA », FOND BLEU + texte BLANC (couleurs fixes)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 5, page: 1, lectureCourante: lecture({ nbValeurs: 1 }) })));
    expect(html).toContain('Page analysée IA');
    expect(html).toContain('background:#1a4d8f');
    expect(html).toContain('color:#fff');
  });
  it('BUG CERFA — analysée SANS valeur (envoyée, nbValeurs=0) → « analysée, aucune valeur », JAMAIS « non analysée »', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 5, page: 19, lectureCourante: lecture({ page: 19, nbValeurs: 0, resume: 'aucune valeur exploitable sur cette page.' }) })));
    expect(html).toContain('analysée, aucune valeur');
    expect(html).not.toContain('non analysée IA');
  });
  it('ÉCHEC (lectureRes.echec pour LA page) → « analyse échouée », FOND AMBRE ; jamais silencieux', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 5, page: 1, lectureRes: { cle: '5:1', texte: 'Analyse de la page impossible, réessayez.', ecrit: false, echec: true } })));
    expect(html).toContain('analyse échouée');
    expect(html).toContain('background:#8a5a00');
  });
  it('NON ANALYSÉE (aucune lecture, aucun repérage) → « non analysée IA » (état actuel)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 5, page: 1 })));
    expect(html).toContain('non analysée IA');
    expect(html).not.toContain('Page analysée IA');
  });
  it('page HORS best-of : la capsule reflète quand même l’analyse (pageDansBestOf=false + lecture avec valeur → « Page analysée IA »)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 5, page: 7, pageDansBestOf: false, lectureCourante: lecture({ page: 7, nbValeurs: 1 }) })));
    expect(html).toContain('Image fichier');       // hors best-of
    expect(html).toContain('Page analysée IA');     // et pourtant analysée → capsule correcte
  });
});

describe('DISSOCIATION VISUELLE — deux capsules : BEST-OF (liseré BLEU) vs FICHIER (gris), sans rien déplacer', () => {
  it('deux CONTENEURS distincts (role=group + libellés) ; distinction non réductible à la couleur', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 55, nbPagesPiece: 3 })));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Navigation du best-of des plans"'); // capsule best-of
    expect(html).toContain('aria-label="Pages et pièces du fichier"');       // capsule fichier
  });

  it('la capsule BEST-OF utilise le MÊME bleu que « Image best-of » (var(--color-svv-blue)), pas le bleu fixe de la capsule IA', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 55, pageDansBestOf: true })));
    expect(html).toContain('1px solid var(--color-svv-blue)'); // liseré de la capsule best-of
    expect(html).toContain('Image best-of');                    // le repère « Image best-of » (même token bleu)
    // le bleu du liseré est un TOKEN thématisé (clair/sombre), distinct du bleu FIXE #1a4d8f de la capsule « Page analysée IA ».
  });

  it('la capsule FICHIER est en GRIS neutre (var(--color-svv-line))', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 55 })));
    const iFichier = html.indexOf('aria-label="Pages et pièces du fichier"');
    expect(iFichier).toBeGreaterThan(-1);
    expect(html.slice(iFichier, iFichier + 120)).toContain('var(--color-svv-line)'); // liseré gris sur le conteneur fichier
  });

  it('AUCUN élément de navigation n’a disparu, et chacun est dans la BONNE capsule (ordre : best-of → fichier)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: 55, nbPagesPiece: 3, nav: 'bestof' })));
    const iBleu = html.indexOf('Navigation du best-of des plans');
    const iNav = html.indexOf('BLOC-NAV');                 // slotNav (compteur + ‹/› + type + nom·page·échelle)
    const iGris = html.indexOf('Pages et pièces du fichier');
    const iPage = html.indexOf('pages de ce fichier :');    // contrôle de page (module fichier)
    const iPieces = html.indexOf('SELECTEUR-PIECES');       // « voir toutes les pièces » (module fichier)
    const iOuvrir = html.indexOf('dans un nouvel onglet');  // lien (module fichier)
    for (const i of [iBleu, iNav, iGris, iPage, iPieces, iOuvrir]) expect(i).toBeGreaterThan(-1);
    // slotNav est DANS la capsule best-of (après son ouverture, avant la capsule fichier).
    expect(iBleu).toBeLessThan(iNav);
    expect(iNav).toBeLessThan(iGris);
    // les trois éléments du module fichier sont APRÈS l'ouverture de la capsule fichier.
    for (const i of [iPage, iPieces, iOuvrir]) expect(i).toBeGreaterThan(iGris);
  });

  it('sans pièce ouverte : la capsule FICHIER reste rendue avec l’échappatoire « voir toutes les pièces » (slotPieces toujours là)', () => {
    const html = renderToStaticMarkup(h(BarreVisionneusePieces, props({ pieceId: null })));
    expect(html).toContain('aria-label="Pages et pièces du fichier"');
    expect(html).toContain('SELECTEUR-PIECES');
    expect(html).not.toContain('dans un nouvel onglet'); // le lien reste gardé par pageOuverte
  });
});
