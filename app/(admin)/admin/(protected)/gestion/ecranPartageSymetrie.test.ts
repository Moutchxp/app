import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — LES DEUX COLONNES DE L'ÉCRAN PARTAGÉ SE RÉPONDENT ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « même largeur (50/50), même hauteur d'en-tête (titre + compteur + filtres alignés
 * sur une même ligne de base), mêmes marges, même hauteur de ligne de liste, mêmes pieds (pagination alignée),
 * défilement indépendant mais même hauteur visible. Aucune fonction retirée ni masquée. Clair et Sombre, et à
 * toutes les largeurs (sur écran étroit, une colonne sous l'autre). »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER TIENT, ET POURQUOI IL LIT LA FEUILLE ════════════════════════════════════════════════
 *
 * La symétrie se MESURE à l'écran, et elle l'a été : colonnes 552 × 577 aux deux, en-têtes 73 px, corps 448 px
 * commençant à la même hauteur, pieds 48 px se terminant sur la même ligne. Mais une mesure faite une fois ne
 * protège de rien : ce fichier fige les RÈGLES qui la produisent, celles qu'un ajustement futur casserait sans
 * le dire.
 *
 * ⚠️ L'ÉCRAN ÉTROIT N'A PAS PU ÊTRE MESURÉ, et c'est dit ici plutôt que tu dans un coin : le navigateur piloté ne
 * change pas la largeur du DOCUMENT quand on redimensionne sa fenêtre (limite déjà consignée au lot
 * CORBEILLE-SANS-STATUT). Ce qui se tient sans lui, c'est que les hauteurs fixes vivent TOUTES dans une media
 * query `min-width:901px`, et que la règle d'empilement existe — c'est exactement ce que ces épreuves exigent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BRC = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');

/** La feuille de l'écran, sans ses commentaires : on éprouve des RÈGLES, pas des explications. */
const FEUILLE = VUE.slice(VUE.indexOf('.gst-deux{'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('① les mêmes trois rangées, des deux côtés', () => {
  /**
   * 🔴 LA MÊME STRUCTURE DANS LES DEUX FICHIERS. La colonne de gauche est rendue par `BoiteReception`, celle de
   * droite par `GestionVue` : deux fichiers, et donc deux occasions d'oublier une rangée. Les trois classes
   * doivent se trouver dans les deux.
   */
  it('🔴🔴 en-tête (titre + outils), corps, pied — dans les DEUX colonnes', () => {
    for (const [nom, src] of [['colonne des mails', BRC], ['colonne des événements', VUE]] as const) {
      expect(src, nom).toContain('className="gst-tete-partage"');
      expect(src, nom).toContain('className="gst-tete-partage-titre"');
      expect(src, nom).toContain('gst-tete-partage-outils');
      expect(src, nom).toContain('className="gst-corps-partage"');
      expect(src, nom).toContain('className="gst-pied-partage"');
    }
  });

  /**
   * 🔴 « Plein écran » OCCUPE LA SECONDE RANGÉE DES DEUX CÔTÉS. C'est ce qui évite une rangée vide à droite :
   * à gauche elle porte les filtres ET ce bouton, à droite ce bouton seul. Sans ce déplacement, il aurait fallu
   * réserver 44 px de vide dans la colonne des événements pour que les deux en-têtes fassent la même hauteur.
   */
  it('🔴 « Plein écran » est dans la rangée des outils, poussé à droite, dans les deux', () => {
    for (const [nom, src] of [['colonne des mails', BRC], ['colonne des événements', VUE]] as const) {
      expect(src, nom).toContain('gst-btn gst-plein');
    }
    expect(FEUILLE).toContain('.gst-tete-partage-outils .gst-plein{margin-left:auto}');
  });
});

describe('② même largeur, même hauteur visible, défilement indépendant', () => {
  it('🔴 la grille reste 50/50', () => {
    expect(FEUILLE).toContain('.gst-deux{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}');
  });

  it('🔴🔴 les colonnes s’étirent à la même hauteur, et c’est la GRILLE qui l’impose', () => {
    expect(FEUILLE).toMatch(/@media \(min-width:901px\)\{[\s\S]*\.gst-deux\{align-items:stretch\}/);
    expect(FEUILLE).toMatch(/\.gst-deux > \.gst-col\{display:flex;flex-direction:column;min-height:0\}/);
  });

  it('🔴🔴 le CORPS a une hauteur FIXE et commune, et défile pour lui-même', () => {
    /**
     * 🔴 FIXE, ET NON PLAFONNÉE. Avec un `max-height`, la colonne des événements (deux cartes) serait plus courte
     * que celle des mails, et les deux pieds ne s'aligneraient plus — ce qui est précisément le défaut à
     * corriger. `max()` donne un plancher : sur un écran bas, la liste reste utilisable.
     */
    expect(FEUILLE).toContain('.gst-deux .gst-corps-partage{flex:1 1 auto;min-height:0;'
      + 'height:max(22rem,52vh);overflow-y:auto}');
  });

  it('🔴 le PIED reste en bas, et fait la même hauteur des deux côtés', () => {
    expect(FEUILLE).toContain('.gst-deux .gst-pied-partage{margin-top:auto}');
    /* ⚠️ 48 px, mesuré : un bouton de 44 px dans une rangée centrée en occupe 48. 44 laissait 4 px d'écart. */
    expect(FEUILLE).toMatch(/\.gst-pied-partage\{[^}]*min-height:48px/);
  });
});

describe('③ le même rythme de ligne, sans jamais rogner un contenu', () => {
  it('🔴 même hauteur MINIMALE et mêmes marges internes dans les deux listes', () => {
    expect(FEUILLE).toContain('.gst-deux .brc-li,\n.gst-deux .gst-item{min-height:var(--gst-ligne,106px)}');
    expect(FEUILLE).toMatch(/\.gst-deux \.gst-item\{[^}]*padding:8px 4px\}/);
  });

  /**
   * 🔴🔴 UN MINIMUM, PAS UN PLAFOND — ET C'EST LA MOITIÉ QUI COMPTE. Arno demande l'harmonie ET « aucune fonction
   * retirée ni masquée », dans la même phrase. Une carte d'événement qui porte une pastille « attend une
   * réponse » dépasse les 106 px ; la rogner masquerait du contenu. Entre un pixel identique et un contenu
   * entier, c'est le contenu qui gagne.
   */
  it('🔴🔴 AUCUNE hauteur maximale sur une ligne de liste : rien n’est rogné', () => {
    expect(FEUILLE).not.toMatch(/\.gst-deux[^{]*\{[^}]*max-height:[^}]*\}[^]*?\.(brc-li|gst-item)/);
    for (const regle of FEUILLE.split('}')) {
      if (/\.(brc-li|gst-item)/.test(regle)) expect(regle).not.toContain('max-height');
      if (/\.(brc-li|gst-item)/.test(regle)) expect(regle).not.toContain('overflow:hidden');
    }
  });
});

describe('④ l’écran étroit : une colonne sous l’autre, et plus aucune hauteur fixe', () => {
  /**
   * 🔴🔴 LE PIÈGE QUE CETTE ÉPREUVE FERME. Deux boîtes à défilement empilées dans un petit écran enferment le
   * lecteur : la page ne défile plus, chaque liste défile pour elle, et l'on ne voit jamais le bas. Toutes les
   * hauteurs fixes doivent donc vivre DANS la media query large, sans exception.
   */
  it('🔴🔴 toutes les hauteurs fixes sont DANS `@media (min-width:901px)`', () => {
    const i = FEUILLE.indexOf('@media (min-width:901px){');
    expect(i).toBeGreaterThan(0);
    const avant = FEUILLE.slice(0, i);
    const dedans = FEUILLE.slice(i, FEUILLE.indexOf('\n}', i));
    /* Avant la media query : aucune hauteur imposée au corps, aucun défilement propre. */
    expect(avant).not.toContain('.gst-corps-partage{flex');
    expect(avant).not.toContain('overflow-y:auto');
    /* Dedans : les deux. */
    expect(dedans).toContain('height:max(22rem,52vh)');
    expect(dedans).toContain('overflow-y:auto');
  });

  it('🔴 la règle d’empilement existe toujours, et elle est sous 901 px', () => {
    expect(FEUILLE).toContain('@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}');
  });
});

describe('⑤ rien n’est retiré ni masqué', () => {
  /**
   * 🔴🔴 LE BLOC « ÉCHANGES SANS ÉVÉNEMENT » A CHANGÉ DE PLACE, PAS DE NATURE. Il vivait DANS la colonne de
   * gauche, sous son pied — ce qui empêchait les deux colonnes de se terminer sur la même ligne (mesuré : pied
   * de gauche à 922 px, pied de droite à 967). Il est désormais SOUS les deux, sur toute la largeur, avec son
   * titre, son compteur, son « Plein écran », sa fenêtre d'activité, ses gestes et son repli par défaut.
   */
  it('🔴 le bloc « Échanges sans événement » est hors de la grille, et complet', () => {
    const grille = VUE.slice(VUE.indexOf('<div className="gst-deux">'), VUE.indexOf('CE BLOC EST PASSÉ'));
    expect(grille).not.toContain('gst-file-echanges');
    expect(VUE).toContain('<details className="gst-file-echanges">');
    expect(VUE).toContain('Échanges sans événement <span className="gst-compte">{d.filsTotal}</span>');
    expect(VUE).toContain('gst-titre-file');
  });

  /** 🔴 LES DEUX GESTES DU PIED DE GAUCHE SONT LÀ, côte à côte : aucun n'a disparu avec la mise en rangée. */
  it('🔴 le pied de la colonne des mails garde ses deux gestes', () => {
    expect(BRC).toContain('Voir les mails plus anciens');
    expect(BRC).toContain('File des échanges sans événement');
    expect(BRC).toContain('onClick={onFileEchanges}');
  });

  /** ⚠️ ET LES FILTRES AUSSI : les quatre sont toujours rendus, dans la rangée des outils. */
  it('⚠️ les quatre filtres de la colonne des mails sont intacts', () => {
    for (const mot of ['Tous', 'À classer', 'Classés', 'Hors gestion']) {
      expect(BRC).toContain(`mot: '${mot}'`);
    }
  });
});
