import { describe, expect, it } from 'vitest';
import {
  infobulleChemin, LIGNE_FERMEE, NOM_PAR_DEFAUT, ouvrirLigne, verdictNom,
} from './dossierEnLigne';

/**
 * LOT DRIVE-RETOUCHES-1 — LA LIGNE DE DOSSIER, REJOUÉE SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CES TESTS PROTÈGENT. Le formulaire qu'on remplace faisait CONFIRMER le chemin complet avant d'écrire.
 * En supprimant cette étape, on supprime aussi le filet qui rattrapait la faute la plus probable : le bon nom, au
 * mauvais endroit. Ce qui la remplace tient en deux choses, et les deux sont éprouvées ici — la ligne naît à sa
 * place (donc `parent` voyage avec l'état, et n'est jamais relu « au moment du POST »), et le chemin complet reste
 * lisible en infobulle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('ouvrir la ligne', () => {
  it('propose un nom, et retient OÙ elle créera', () => {
    const l = ouvrirLigne('D1', 'Artisans');
    expect(l.c).toBe('edition');
    if (l.c !== 'edition') return;
    expect(l.nom).toBe(NOM_PAR_DEFAUT);
    expect(l.parent).toBe('D1');
    expect(l.parentNom).toBe('Artisans');
    expect(l.erreur).toBeNull();
  });

  it('la ligne fermée est un état, pas une absence', () => {
    expect(LIGNE_FERMEE).toEqual({ c: 'ferme' });
  });
});

describe('🔴 ce que vaut le nom saisi', () => {
  const voisins = ['Travaux', 'Baux 2024', 'Éléctricité'];

  it('un nom libre passe, débarrassé de ses espaces', () => {
    expect(verdictNom('  Devis 2026 ', voisins)).toEqual({ quoi: 'creer', nom: 'Devis 2026' });
  });

  /** ⚠️ UN NOM VIDE EST UN ABANDON, PAS UNE ERREUR : on renonce sans rien reprocher. */
  it('🔴 un nom vide fait RENONCER, il ne fait pas corriger', () => {
    expect(verdictNom('', voisins).quoi).toBe('renoncer');
    expect(verdictNom('    ', voisins).quoi).toBe('renoncer');
  });

  /**
   * 🔴 LE DOUBLON N'EST PAS UNE ERREUR DE GOOGLE : Drive accepte parfaitement deux dossiers du même nom au même
   * endroit — il en fait deux. C'est NOUS qui refusons, parce qu'un Drive où « Travaux » existe deux fois côte à
   * côte est un Drive où l'on range au hasard.
   */
  it('🔴 un doublon fait CORRIGER, avec le nom dans le motif', () => {
    const v = verdictNom('Travaux', voisins);
    expect(v.quoi).toBe('corriger');
    if (v.quoi === 'corriger') expect(v.motif).toContain('Travaux');
  });

  /** ⚠️ LA COMPARAISON EST CELLE DE L'ŒIL : casse, accents et espaces en trop ne font pas deux dossiers. */
  it('🔴 « travaux », « TRAVAUX » et « Travaux  » sont le même dossier', () => {
    for (const n of ['travaux', 'TRAVAUX', 'Travaux ', ' travaux']) {
      expect(verdictNom(n, voisins).quoi, n).toBe('corriger');
    }
    expect(verdictNom('electricite', voisins).quoi).toBe('corriger');
  });

  it('un dossier vide de voisins accepte tout nom non vide', () => {
    expect(verdictNom('Travaux', []).quoi).toBe('creer');
  });
});

describe('l’infobulle du chemin — ce qui subsiste de la confirmation', () => {
  it('dit le chemin complet quand le serveur l’a rendu', () => {
    expect(infobulleChemin('GESTION LOCATIVE › Base › Artisans', 'Artisans'))
      .toBe('Le dossier sera créé ici : GESTION LOCATIVE › Base › Artisans');
  });

  /** ⚠️ SANS CHEMIN, ON NOMME QUAND MÊME L'ENDROIT : un champ sans repère créerait à l'aveugle. */
  it('à défaut, elle nomme au moins le dossier', () => {
    expect(infobulleChemin(null, 'Artisans')).toContain('« Artisans »');
    expect(infobulleChemin('', 'Artisans')).toContain('« Artisans »');
  });
});
