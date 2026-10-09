import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES (09/10/2026) ════════════════════════════════════════════════════
 *
 * Trois demandes :
 *   ① chaque famille de filtres devient un GROUPE ENCADRÉ, avec son étiquette — « TYPE » en gagne une ;
 *   ② le bouton ACTIF survolé était ILLISIBLE (fond clair, texte blanc) — à corriger partout ;
 *   ③ l'actif passe du noir au ROUGE DE LA MARQUE, sauf les trois tons d'urgence.
 *
 * ══ 🔴🔴 CE QUE CES CAS PEUVENT, ET CE QU'ILS NE PEUVENT PAS ════════════════════════════════════════════════════
 *
 * Un contraste ne se lit pas dans une chaîne de caractères : il se MESURE sur des couleurs calculées par le
 * navigateur, dans les deux thèmes. C'est fait, et le tableau est dans
 * `app/.captures/filtres-familles-et-boutons-rouges/mesures.md` — avec les valeurs d'AVANT, qui chiffrent le
 * défaut (1,1:1 sur les pilules, 2,0:1 sur les bascules de la fiche du bien).
 *
 * CE QUE CES CAS TIENNENT, EUX, EST CE QU'UNE MESURE NE PEUT PAS TENIR : que la correction soit écrite À TOUS
 * LES ENDROITS où le format est employé, et qu'un lot suivant ne puisse pas en rouvrir un sans le voir.
 */

const PILULE = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonPilule.tsx', 'utf8');
const URGENCE = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');
const TABLEAU = readFileSync('app/(admin)/admin/(protected)/gestion/TableauBordEvenements.tsx', 'utf8');
const HDB = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const LIGNE = readFileSync('app/(admin)/admin/(protected)/gestion/LigneFiltresEvenements.tsx', 'utf8');

/** Les règles seules : un commentaire qui CITE une couleur ne doit pas passer pour une couleur appliquée. */
const sansCommentaires = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('🔴🔴 ① chaque famille est un groupe encadré, et porte son nom', () => {
  /**
   * 🔴🔴 LE CADRE FAIT CE QUE LE FILET NE FAISAIT PAS. Un trait vertical entre deux groupes disparaît dès que
   * la ligne se replie : à la deuxième ligne il ne sépare plus rien. Le cadre, lui, suit son groupe partout.
   */
  it('🔴🔴 un cadre léger, teinté, à coins de 8 px', () => {
    const feuille = LIGNE.slice(LIGNE.indexOf('const CSS_LIGNE_FILTRES'));
    expect(feuille).toContain('.lfe-fam{display:flex;flex-wrap:wrap;align-items:center;gap:8px 6px;min-width:0;');
    expect(feuille).toContain('padding:6px 10px 7px;border:1px solid var(--color-svv-line);border-radius:8px;');
    expect(feuille).toContain('background:var(--color-svv-field)}');
  });

  /** 🔴 LES SIX ÉTIQUETTES D'ARNO, mot pour mot — « TYPE » comprise, qui manquait. */
  it('🔴🔴 les six familles sont nommées, « Type » comprise', () => {
    for (const nom of ['Priorité', 'État', 'Type', 'Monga', 'À surveiller', 'Trier']) {
      expect(LIGNE, nom).toContain(`famille('${nom}'`);
    }
  });

  /**
   * 🔴🔴 UN GROUPE NE SE COUPE JAMAIS EN DEUX, et c'est une propriété de STRUCTURE, pas de surveillance : la
   * famille est un élément de la rangée extérieure, donc elle passe à la ligne D'UN BLOC. Avant ce lot, les
   * boutons étaient des frères directs de la rangée et pouvaient se séparer au milieu d'un groupe.
   */
  it('🔴🔴 c’est la famille qui se replie, pas ses boutons', () => {
    expect(LIGNE).toContain('<div className={`lfe-fam${deplus}`} role="group" aria-label={nom}>');
    expect(LIGNE).toContain('<span className="lfe-boutons">{contenu}</span>');
  });

  /** 🔴 « TRIER » EST À PART (Arno) : poussé à droite, sur un fond neutre — ce n'est pas un filtre. */
  it('🔴 « Trier » est visuellement détaché', () => {
    expect(LIGNE).toContain("' lfe-fam--tris'");
    expect(LIGNE).toContain('.lfe-fam--tris{margin-left:auto;background:var(--color-svv-surface);');
  });
});

describe('🔴🔴 ② l’actif survolé reste lisible — partout où le format est employé', () => {
  /**
   * 🔴🔴 LA CAUSE, FIGÉE. `.gpil:hover` n'excluait pas l'actif : son fond plein redevenait le gris pâle de
   * `field` pendant que son texte restait `surface`. Mesuré AVANT : 1,1:1 en Clair, 1,15:1 en Sombre —
   * c'est-à-dire invisible. Constat d'Arno, au mot près : « un bouton actif survolé devient illisible ».
   */
  it('🔴🔴 le survol générique épargne l’actif, qui a le sien', () => {
    expect(PILULE).toContain('.gpil:hover:not(:disabled):not(.gpil--actif){background:var(--color-svv-field)}');
    expect(PILULE).toContain('.gpil--actif:hover:not(:disabled),\n.gpil--actif:not(:disabled):focus-visible{'
      + 'background:var(--color-svv-red-dark);');
  });

  /**
   * 🔴🔴 LE MÊME DÉFAUT VIVAIT DANS DEUX AUTRES EMPLOIS DU FORMAT, et Arno demande de les trouver :
   *   · `.tbe-chiffre` — les chiffres cliquables du tableau de bord (même dessin, recopié parce qu'ils
   *     portent un nombre) ;
   *   · `.hdb-petit` et `.hdb-puce-bascule` — les bascules de la fiche du bien (Toutes/Avec/Sans,
   *     « Événement ouvert », « ↓ Plus récent en haut »), qui posaient `color:ink` sur leur fond rouge :
   *     2,0:1 mesuré.
   * Les trois sont corrigés de la même façon, et ce cas interdit qu'un seul reparte.
   */
  it('🔴🔴 les deux autres emplois du format sont corrigés aussi', () => {
    expect(TABLEAU).toContain('.tbe-chiffre:hover:not(:disabled):not(.tbe-chiffre--actif){');
    expect(TABLEAU).toContain('.tbe-chiffre--actif:hover:not(:disabled),');
    expect(HDB).toContain('.hdb-petit:hover:not(.hdb-petit--actif){color:var(--color-svv-ink)}');
    expect(HDB).toContain('.hdb-petit--actif:hover,\n.hdb-petit--actif:focus-visible{');
    expect(HDB).toContain('.hdb-puce-bascule:hover:not(.hdb-puce-bascule--actif){');
    expect(HDB).toContain('.hdb-puce-bascule--actif:hover,\n.hdb-puce-bascule--actif:focus-visible{');
  });

  /**
   * 🔴 LE FOCUS CLAVIER EST TRAITÉ AVEC LE SURVOL, dans la même règle — Arno demande les deux. Un bouton
   * atteint au clavier doit rester lisible exactement comme sous la souris.
   */
  it('🔴 chaque correction couvre aussi le focus clavier', () => {
    for (const [nom, src, sel] of [
      ['pilule', PILULE, '.gpil--actif:not(:disabled):focus-visible'],
      ['tableau de bord', TABLEAU, '.tbe-chiffre--actif:not(:disabled):focus-visible'],
      ['segment', HDB, '.hdb-petit--actif:focus-visible'],
      ['puce', HDB, '.hdb-puce-bascule--actif:focus-visible'],
    ] as const) {
      expect(src, nom).toContain(sel);
    }
  });
});

describe('🔴🔴 ③ l’actif est le rouge de la marque, sauf l’urgence', () => {
  it('🔴🔴 le format commun passe au rouge, texte inversé', () => {
    expect(PILULE).toContain('.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-red);'
      + 'border-color:var(--color-svv-red)}');
    expect(TABLEAU).toContain('.tbe-chiffre--actif{color:var(--color-svv-surface);background:var(--color-svv-red);');
  });

  /**
   * 🔴 C'EST DÉJÀ LE ROUGE DE LA FICHE DU BIEN : ce lot n'invente pas une convention, il aligne le reste du
   * module sur celle qui existait. Un seul rouge d'état actif dans toute l'application.
   */
  it('🔴 la fiche du bien employait déjà ce rouge, et le garde', () => {
    expect(HDB).toContain('.hdb-petit--actif{background:var(--color-svv-red);color:var(--color-svv-surface);');
    expect(HDB).toContain('.hdb-puce-bascule--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);');
  });

  /**
   * 🔴🔴 L'EXCEPTION DOIT TENIR AU SURVOL AUSSI, ET C'EST UN DÉFAUT QUE CE LOT A FAILLI INTRODUIRE : le
   * nouveau survol de l'actif est PLUS SPÉCIFIQUE que les trois tons. Survoler « Normal » actif l'aurait fait
   * virer au ROUGE — l'inverse de ce que le bouton dit. Trouvé en mesurant, pas en relisant.
   */
  it('🔴🔴 les trois tons d’urgence gardent leur couleur, survol et focus compris', () => {
    const feuille = URGENCE.slice(URGENCE.indexOf('const CSS_SELECTEUR_URGENCE'));
    for (const [ton, jeton] of [
      ['vert', '--color-svv-green-ink'], ['orange', '--color-svv-orange'], ['rouge', '--color-svv-red-dark'],
    ] as const) {
      expect(feuille, ton).toContain(`.gurg-voie--${ton}.gpil--actif:hover:not(:disabled),`);
      expect(feuille, ton).toContain(`background:var(${jeton});`);
    }
    /* ⚠️ ET LE TABLEAU DE BORD PORTE LA MÊME EXCEPTION, pour les mêmes trois tons. */
    expect(TABLEAU).toContain('.tbe-ton--normale .tbe-chiffre--actif:hover:not(:disabled){');
  });

  /**
   * 🔴 AUCUNE COULEUR EN DUR NULLE PART : les deux thèmes suivent les jetons sans qu'on leur dise rien.
   * ⚠️ ON CHERCHE DANS LES RÈGLES, PAS DANS LES COMMENTAIRES : les encadrés CITENT les valeurs mesurées pour
   * que le lecteur sache ce que le jeton vaut, et faire rougir l'épreuve là-dessus pousserait à retirer
   * l'explication plutôt que la faute.
   */
  it('🔴 aucune couleur en dur dans les feuilles touchées', () => {
    for (const [nom, src, debut] of [
      ['pilule', PILULE, 'export const CSS_BOUTON_PILULE'],
      ['urgence', URGENCE, 'const CSS_SELECTEUR_URGENCE'],
      ['ligne', LIGNE, 'const CSS_LIGNE_FILTRES'],
    ] as const) {
      const feuille = sansCommentaires(src.slice(src.indexOf(debut)));
      expect(feuille, nom).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
      /* ⚠️ ET LE DÉCAPAGE N'A PAS TOUT EMPORTÉ : sans cela, le cas passerait en ne prouvant plus rien. */
      expect(feuille, nom).toContain('var(--color-svv-');
    }
  });
});
