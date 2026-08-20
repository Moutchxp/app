import { describe, it, expect } from 'vitest';
import { decisionDesignation, MOTIF_AUCUNE_LIGNE_LIBELLEE, type PagePermis } from './decisionDesignation';

/**
 * N10-H — extraction PURE de la désignation. Fait foi = la ligne libellée « Nom de l'opération : … », valeur = texte entre
 * l'étiquette et la suivante. Espaces multiples réduits à un seul, RIEN d'autre touché (on ne recolle pas les mots). Abstention
 * motivée quand aucune ligne libellée n'existe (cas 07512025V0035, sans mini-fiche).
 */
const page = (piece: string, page: number, texte: string): PagePermis => ({ piece, page, texte });

describe('decisionDesignation', () => {
  it('07512024V0037 : la ligne libellée fait foi ; le texte de la couche (typographie espacée) est retenu TEL QUEL', () => {
    // texte réel de pdfjs : le titre est espacé (« M ultisport s ») et les étiquettes portent des espaces multiples.
    const p = page('PC39.pdf', 1, "Désignation de l’opération   Nom de l’opération   :   Équipement   M ultisport s   ZAC Python Duvernois   Nature des travaux   : Construction d’un équipement");
    const d = decisionDesignation([p]);
    expect(d).toEqual({ statut: 'retenue', valeur: 'Équipement M ultisport s ZAC Python Duvernois', piece: 'PC39.pdf', page: 1 });
  });

  it('espaces multiples réduits à UN seul — mais les mots ne sont JAMAIS recollés (résidu visible, jamais faux)', () => {
    const d = decisionDesignation([page('x.pdf', 3, "Nom de l’opération :   Halle   Sport ive   du   Nord   Nature des travaux : ...")]);
    expect(d.statut).toBe('retenue');
    if (d.statut === 'retenue') {
      expect(d.valeur).toBe('Halle Sport ive du Nord'); // « Sport ive » conservé : pas d'invention de frontière de mot
      expect(d.valeur).not.toContain('  ');             // aucun double espace
    }
  });

  it('la valeur s’arrête à l’étiquette SUIVANTE (jamais happer « Nature des travaux » et la suite)', () => {
    const d = decisionDesignation([page('x.pdf', 1, "Nom de l’opération : Groupe scolaire Jean Zay Adresse travaux : 10 rue X")]);
    expect(d.statut === 'retenue' && d.valeur).toBe('Groupe scolaire Jean Zay');
  });

  it('sans étiquette de fermeture → prend le reste de la page (mais reste borné à la page)', () => {
    const d = decisionDesignation([page('x.pdf', 2, "Nom de l’opération : Gymnase municipal")]);
    expect(d.statut === 'retenue' && d.valeur).toBe('Gymnase municipal');
  });

  it('« Désignation de l’opération : X » (variante libellée avec deux-points) est acceptée', () => {
    const d = decisionDesignation([page('x.pdf', 1, "Désignation de l’opération : Centre nautique Nature des travaux : neuf")]);
    expect(d.statut === 'retenue' && d.valeur).toBe('Centre nautique');
  });

  it('première page libellée porteuse d’une valeur retenue ; provenance exacte', () => {
    const pages = [
      page('entete.pdf', 1, 'PC - RÉALISATION D’UN ÉQUIPEMENT MULTISPORTS'), // en-tête/cartouche : JAMAIS remonté
      page('sansval.pdf', 1, "Nom de l’opération :  Nature des travaux : ..."), // libellé mais valeur vide → ignoré
      page('fiche.pdf', 4, "Nom de l’opération : Piscine Georges Vallerey Nature des travaux : réhabilitation"),
    ];
    const d = decisionDesignation(pages);
    expect(d).toMatchObject({ statut: 'retenue', valeur: 'Piscine Georges Vallerey', piece: 'fiche.pdf', page: 4 });
  });

  it('07512025V0035 : aucune ligne libellée (désignation seulement en cartouche) → ABSTENTION motivée, jamais un en-tête deviné', () => {
    const pages = [
      page('C_A2.pdf', 2, "Opération Porte de Montreuil - Construction d’un ensemble immobilier Lot 2D"),
      page('cerfa.pdf', 1, 'Opération d’Intérêt National (O.I.N) ? Non'),
    ];
    const d = decisionDesignation(pages);
    expect(d).toEqual({ statut: 'abstenue', motif: MOTIF_AUCUNE_LIGNE_LIBELLEE });
  });

  it('corpus vide → abstention', () => {
    expect(decisionDesignation([])).toEqual({ statut: 'abstenue', motif: MOTIF_AUCUNE_LIGNE_LIBELLEE });
  });
});
