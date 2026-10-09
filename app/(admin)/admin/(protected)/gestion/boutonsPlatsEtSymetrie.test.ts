import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT BOUTONS-PLATS-ET-SYMETRIE-PANNEAUX (09/10/2026) ═════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, en deux points :
 *   ① « Fini la pilule : coins arrondis à 8 px (même rayon que le bouton “Plein écran”), hauteur VISIBLE
 *      32 px, marges intérieures horizontales conservées. La zone CLIQUABLE reste d'au moins 44 px de haut
 *      (marge invisible autour du bouton visible), pour respecter la cible tactile du §15. […] Le bouton
 *      “Plein écran” des deux panneaux prend la même hauteur visible (32 px). »
 *   ② « Symétrie des deux panneaux […] écart 0 px attendu, en thème Clair et Sombre, et en plein écran de
 *      fenêtre comme en largeur réduite. Rien n'est retiré ; comportements inchangés. »
 *
 * ⚠️ CE QUE CES CAS PEUVENT, ET CE QU'ILS NE PEUVENT PAS. Ils lisent le SOURCE : ils tiennent la MÉCANIQUE
 * (une hauteur visible, une zone cliquable séparée, des rangées partagées plutôt que deux empilements
 * parallèles). Les PIXELS, eux, se mesurent à l'écran — c'est fait, aux quatre largeurs et dans les deux
 * thèmes, et le tableau est dans `app/.captures/boutons-plats-et-symetrie/mesures.md`. Une épreuve qui
 * prétendrait mesurer un `getBoundingClientRect` depuis une chaîne de caractères mentirait.
 */

const PILULE = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonPilule.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const URGENCE = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');

const DESSIN = PILULE.slice(PILULE.indexOf('export const CSS_BOUTON_PILULE'));

describe('🔴🔴 ① 32 px qu’on voit, 44 px qu’on touche', () => {
  /**
   * 🔴🔴 LES DEUX GRANDEURS SONT SÉPARÉES, ET C'EST TOUT L'OBJET DU POINT 1. Jusqu'ici la cible tactile était
   * tenue en GROSSISSANT le bouton : le dessin payait l'accessibilité. Vérifier l'une sans l'autre laisserait
   * passer soit un bouton joli et intouchable au doigt, soit le bouton de 44 px que ce lot vient d'aplatir.
   */
  it('🔴🔴 la hauteur visible est 32 px, la zone cliquable 44', () => {
    expect(DESSIN).toContain('min-height:32px');
    expect(DESSIN).toContain('.gpil::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;'
      + 'transform:translateY(-50%)}');
    /* ⚠️ SANS `position:relative` SUR LE BOUTON, le rectangle se placerait par rapport à la page entière. */
    expect(DESSIN).toContain('.gpil{position:relative;');
  });

  /** 🔴 LE RAYON DEMANDÉ, ET LES MARGES HORIZONTALES INCHANGÉES (.7rem, comme avant le lot). */
  it('🔴 coins à 8 px, marges intérieures horizontales conservées', () => {
    expect(DESSIN).toContain('border-radius:8px');
    expect(DESSIN).not.toContain('border-radius:999px');
    expect(DESSIN).toContain('padding:.25rem .7rem');
  });

  /**
   * 🔴 « Plein écran » SUIT, PAR LE MÊME MOYEN. Il faisait 44 px pleins (`.gst-btn`) : à côté de boutons de
   * 32, la seconde rangée n'aurait pas été homogène. Et il garde sa cible tactile — la perdre sur le seul
   * bouton qui change d'écran aurait été le pire endroit où le faire.
   *
   * ⚠️ `min-height:32px` SEUL NE SUFFISAIT PAS, ET C'EST MESURÉ : un minimum ne rabaisse rien, et ses 8,8 px
   * de marge haute et basse le laissaient à 33,2 px. D'où la marge verticale à .25rem — l'horizontale (1rem,
   * héritée de `.gst-btn`) n'est pas touchée, comme demandé.
   */
  it('🔴 « Plein écran » prend la même hauteur visible, et garde ses 44 px cliquables', () => {
    expect(VUE).toContain('.gst-tete-partage-outils .gst-plein{margin-left:auto;position:relative;'
      + 'min-height:32px;border-radius:8px;\n  padding-top:.25rem;padding-bottom:.25rem}');
    expect(VUE).toContain('.gst-tete-partage-outils .gst-plein::after{content:"";position:absolute;'
      + 'left:0;right:0;top:50%;height:44px;');
    /* ⚠️ LA RÈGLE EST SCOPÉE À LA RANGÉE : `.gst-btn` sert des dizaines de boutons ailleurs, et la demande ne
       parle que de ces deux-là. Sa propre déclaration reste intacte. */
    expect(VUE).toContain('.gst-btn{width:auto;flex-shrink:0;min-height:44px');
  });

  /**
   * 🔴🔴 LES TROIS RANGÉES QUI PORTENT CES BOUTONS ÉCARTENT LEURS LIGNES DE 12 px. Deux lignes de 32 px
   * espacées de 6 (ou 4) auraient des zones de clic de 44 px qui SE CHEVAUCHENT : un doigt dans la bande
   * commune atteindrait le mauvais bouton, et c'est sur un téléphone — là où la rangée se replie — que la
   * cible tactile compte le plus. 12 px les séparent exactement, et la colonne ne bouge pas : sur une seule
   * ligne, rien ne change à l'écran.
   */
  it('🔴🔴 les lignes repliées ne font pas se chevaucher les zones de clic', () => {
    expect(BOITE).toContain('.brc-filtres{display:flex;flex-wrap:wrap;gap:12px 6px}');
    expect(VUE).toContain('.gst-tris{display:inline-flex;flex-wrap:wrap;align-items:center;gap:12px 4px;');
    expect(URGENCE).toContain('.gurg-voies{display:flex;flex-wrap:wrap;gap:12px 4px;min-width:0}');
  });

  /**
   * ⚠️ RIEN D'AUTRE NE CHANGE : couleurs, états actif/inactif, police, graisse. Les trois teintes de sens de
   * l'urgence sont intactes, et l'actif commun reste le fond sombre à texte clair.
   */
  it('⚠️ couleurs et états inchangés', () => {
    expect(DESSIN).toContain('.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-ink);'
      + 'border-color:var(--color-svv-ink)}');
    expect(DESSIN).toContain('font:inherit;font-size:.8rem');
    expect(DESSIN).not.toContain('font-weight');
    const feuille = URGENCE.slice(URGENCE.indexOf('const CSS_SELECTEUR_URGENCE'));
    expect(feuille).toContain('.gurg-voie--vert.gpil--actif{background:var(--color-svv-green-ink)}');
    expect(feuille).toContain('.gurg-voie--orange.gpil--actif{background:var(--color-svv-orange)}');
    expect(feuille).toContain('.gurg-voie--rouge.gpil--actif{background:var(--color-svv-red-dark)}');
    /* 🔴 ET AUCUNE COULEUR EN DUR : le thème Sombre suit sans qu'on lui dise rien. */
    expect(DESSIN).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});

describe('🔴🔴 ② les deux panneaux partagent les mêmes rangées', () => {
  /**
   * 🔴🔴 CE QUI CLOCHAIT, ET POURQUOI UN `min-height` NE POUVAIT PAS LE RÉPARER. Chaque colonne empilait ses
   * quatre rangées POUR ELLE-MÊME. À 1512 px cela tombait juste ; à 1000 px le titre de gauche passait sur
   * deux lignes (60,5 px contre 30), ses outils aussi (76 contre 44), et les deux listes commençaient à 404
   * et 342 — 62 px d'écart. Un minimum est un PLANCHER : il ne peut pas faire descendre la colonne d'en face.
   *
   * 🔴 LES DEUX COLONNES PARTAGENT DONC LES LIGNES DE LA GRILLE. La hauteur de chaque rangée est celle du plus
   * grand des deux côtés, à toute largeur et quel que soit le contenu du jour. Il n'y a plus rien à
   * « vérifier » : l'alignement est ce que la grille EST.
   */
  it('🔴🔴 quatre rangées, relayées jusqu’au bout de la chaîne', () => {
    expect(VUE).toContain('.gst-deux{align-items:stretch;row-gap:0;grid-template-rows:auto auto 1fr auto}');
    expect(VUE).toContain('.gst-deux > .gst-col{grid-row:1 / span 4;display:grid;grid-template-rows:subgrid;min-height:0}');
    /* ⚠️ `.brc` S'INTERCALE À GAUCHE (la colonne délègue à `BoiteReception`) : sans ce relais, la gauche
       empilerait ses quatre rangées DANS UNE SEULE ligne de la grille, et tout l'étage s'écroulerait. */
    expect(VUE).toContain('.gst-deux > .gst-col > .brc{grid-row:1 / span 4;display:grid;grid-template-rows:subgrid;');
    /* ⚠️ ET L'EN-TÊTE PORTE DEUX RANGÉES À LUI SEUL : il les relaie à son tour. */
    expect(VUE).toContain('.gst-deux .gst-tete-partage{grid-row:1 / span 2;display:grid;grid-template-rows:subgrid;');
  });

  /**
   * ⚠️ LES ÉCARTS DE RANGÉE REDEVIENNENT DES MARGES, et ce ne sont pas des valeurs inventées : ce sont
   * exactement celles que `.gst-tete-partage` portait en `gap` (0,4 rem) et en `margin` (0,5 rem). En
   * subgrid, l'espace entre deux rangées vient du `row-gap` du PARENT — 24 px ici, l'écart entre les deux
   * colonnes, qui aurait ruiné l'en-tête.
   */
  it('⚠️ les respirations d’avant sont rendues à l’identique', () => {
    expect(VUE).toContain('.gst-tete-partage{display:flex;flex-direction:column;gap:.4rem;margin:0 0 .5rem}');
    expect(VUE).toContain('.gst-deux .gst-tete-partage-titre{margin-bottom:.4rem}');
    expect(VUE).toContain('height:max(22rem,52vh);overflow-y:auto;margin-top:.5rem}');
  });

  /**
   * 🔴🔴 LE SÉPARATEUR EST ÉCRIT UNE SEULE FOIS, POUR LES DEUX. Il existait À GAUCHE SEULEMENT, porté par
   * `.brc-liste` : la colonne des événements n'en avait aucun et ses cartes commençaient 1 px plus haut
   * (342 contre 341). « Même épaisseur, même position des deux côtés » n'est plus une coïncidence à vérifier
   * — c'est la même déclaration.
   *
   * ⚠️ RIEN N'EST RETIRÉ À GAUCHE : le filet est au même endroit (le haut de la liste EST le haut du corps),
   * de la même épaisseur et du même jeton. Et posé sur le conteneur à défilement, il ne défile plus avec la
   * liste — ce qu'un filet posé sur la liste ne faisait pas.
   */
  it('🔴🔴 le séparateur est porté par le corps, des deux côtés, et nulle part ailleurs', () => {
    expect(VUE).toContain('.gst-corps-partage{min-width:0;border-top:1px solid var(--color-svv-line)}');
    expect(BOITE).toContain('.brc-liste{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}');
    expect(BOITE).not.toMatch(/\.brc-liste\{[^}]*border-top/);
  });

  /**
   * 🔴 LES DEUX CALAGES DE L'EN-TÊTE, ET LEURS RAISONS OPPOSÉES — c'est la mesure qui a tranché dans les deux
   * cas, pas la symétrie du code :
   *   · LE TITRE N'A PAS DE `align-content` : la cale par défaut ÉTIRE la ligne unique sur toute la rangée,
   *     les deux titres font donc la même hauteur et leurs compteurs tombent au même pixel (256,59 des deux
   *     côtés). Avec `flex-start`, celui de droite remontait de 3,75 px.
   *   · LES OUTILS SONT CALÉS EN BAS : à 1000 px les filtres de gauche se replient et « Plein écran » tombe
   *     sur la seconde ligne (363 px) ; à droite, seul, il restait centré dans la rangée étirée (341) —
   *     22 px d'écart. `flex-end` fait rejoindre au bouton solitaire la dernière ligne de gauche.
   */
  it('🔴 le titre s’étire, les outils se calent en bas', () => {
    expect(VUE).toContain('.gst-tete-partage-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;min-height:30px}');
    expect(VUE).not.toMatch(/\.gst-tete-partage-titre\{[^}]*align-content/);
    expect(VUE).toMatch(/\.gst-tete-partage-outils\{[^}]*align-content:flex-end/);
  });

  /**
   * 🔴 LE TITRE SE DISPOSE EN RANGÉE CENTRÉE, ET NON À LA LIGNE DE BASE. Mesuré : la pastille du compteur
   * était 3,8 px plus bas à gauche qu'à droite, parce que le bouton rond « relever » de la boîte de réception
   * abaissait la ligne de base de tout ce qui le suivait. Un calage qui dépend du contenu de la colonne de
   * gauche n'est pas un calage.
   */
  it('🔴 le contenu du titre est centré verticalement, des deux côtés', () => {
    expect(VUE).toContain('.gst-tete-partage-titre .gst-titre{margin:0;display:flex;flex-wrap:wrap;'
      + 'align-items:center;gap:.5rem;min-width:0}');
  });

  /**
   * ⚠️ EN DESSOUS DE 901 px, RIEN DE TOUT CELA NE S'APPLIQUE : les colonnes s'empilent, le `row-gap` de 24 px
   * reprend son office, et la page retrouve son défilement unique (règle existante). Deux boîtes à
   * défilement empilées dans un téléphone seraient un piège — c'est pour cela que le bloc vit dans une media
   * query, et ce cas garde cette frontière.
   */
  it('⚠️ tout le partage de rangées reste borné à la media query', () => {
    const large = VUE.slice(VUE.indexOf('@media (min-width:901px){'));
    const bloc = large.slice(0, large.indexOf('\n}\n'));
    for (const regle of ['grid-template-rows:subgrid', 'row-gap:0', 'align-items:stretch']) {
      expect(bloc, regle).toContain(regle);
    }
    /* 🔴 ET HORS MEDIA QUERY, AUCUNE DE CES RÈGLES : sinon le repli mobile hériterait d'une grille à quatre
       rangées faite pour deux colonnes côte à côte. */
    expect(VUE.slice(0, VUE.indexOf('@media (min-width:901px){'))).not.toContain('grid-template-rows:subgrid');
  });
});
