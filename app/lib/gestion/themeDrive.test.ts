import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES, POINT 2 — LA FENÊTRE DU DRIVE SUIT LE THÈME ═════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « la fenêtre “Ranger une pièce dans le Drive” reste sombre en thème Clair. Elle
 * doit suivre le thème choisi (Clair / Sombre / Système), comme le reste de l'appli, avec les mêmes jetons de
 * couleur. Vérifie aussi la visionneuse et le menu clic droit. »
 *
 * 🔴🔴 CE QUE LA MESURE DIT, ET ELLE CONTREDIT MON PROPRE SIGNALEMENT DE LA VEILLE. Les trois surfaces suivent
 * déjà le thème, jeton pour jeton — relevé dans le navigateur, `data-theme` basculé entre les deux relevés :
 *
 *                        thème Clair                     thème Sombre
 *     fenêtre Drive      #fff / #16202c                  #1b232f / #e8ebef
 *     menu clic droit    #fff / #16202c                  #1b232f / #e8ebef
 *     visionneuse        #fff / #16202c                  #1b232f / #e8ebef
 *
 * La BARRE DE TITRE, elle, est INVERSÉE PAR DESSIN (`background: var(--color-svv-ink)`) : sombre en Clair, CLAIRE
 * en Sombre (#e8ebef mesuré). C'est une barre de fenêtre, et elle s'inverse correctement — ce n'est pas un
 * oubli de jeton, et c'est sans doute ce qui a fait conclure trop vite que « la fenêtre reste sombre ».
 *
 * ═══ 🔴 IL N'Y A DONC RIEN À CORRIGER, ET JE LE DIS PLUTÔT QUE D'INVENTER UN CORRECTIF ═══════════════════════════
 *
 * La seule couleur écrite en dur de tout le chemin est la FEUILLE BLANCHE du mail, et elle est voulue — voir
 * l'encadré du dernier bloc de ce fichier, qui scelle l'exception et raconte l'erreur que j'ai failli commettre
 * en voulant la « corriger ».
 *
 * ═══ ⚠️ POURQUOI UN GARDE PLUTÔT QU'UNE CORRECTION ══════════════════════════════════════════════════════════════
 *
 * Il n'y avait rien à corriger dans ces trois surfaces : les éprouver aujourd'hui ne prouverait qu'une chose
 * qu'on sait déjà. Ce qu'il faut TENIR, c'est que personne n'y écrive demain une couleur en dur — et cela ne se
 * vérifie pas en regardant l'écran, cela se vérifie en lisant la feuille de style.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Les fichiers qui portent les trois surfaces nommées par Arno.
 *
 * ⚠️ `Conversation.tsx` N'Y EST PAS, ET C'EST UNE DÉCISION DÉJÀ PRISE. Le corps d'un mail est posé sur une
 * FEUILLE BLANCHE qui ne suit JAMAIS le thème (`.cnv-html`, lot LECTURE-HTML-FIL-TROMBONE) : Arno a demandé
 * « lisible en Sombre SANS INVERSER LES IMAGES », et la seule voie qui ne déforme ni le logo d'une signature ni
 * une capture d'écran est de poser le mail comme une page imprimée. Y exiger des jetons serait un contresens —
 * ils changeraient avec le thème, donc reviendraient à inverser.
 */
const SURFACES = [
  ['app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'la fenêtre du Drive et son menu clic droit'],
  ['app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx', 'la visionneuse'],
] as const;

/**
 * LES COULEURS ÉCRITES EN DUR DANS UNE DÉCLARATION DE STYLE.
 *
 * ⚠️ ON NE REGARDE QUE LES BLOCS CSS (les littéraux de gabarit `CSS_…`), jamais la prose : les encadrés de ces
 * fichiers citent volontiers des valeurs mesurées (« #1b232f », « ratio 4,5:1 »), et les compter ferait échouer
 * le garde sur sa propre documentation.
 *
 * ⚠️ `color-mix(…, #xxxxxx …)` EST TOLÉRÉ, et c'est délibéré : ces teintes-là (l'ambre du surlignage de la loupe,
 * le brun de l'œil actif) sont des couleurs de SENS qui ne changent pas avec le thème — elles sont mélangées à
 * du transparent, donc posées SUR la surface du moment, et elles restent lisibles dans les deux.
 */
function couleursEnDur(src: string): string[] {
  const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const trouves: string[] = [];
  for (const m of sansCommentaires.matchAll(/(background|background-color|color|border|border-color|outline)\s*:\s*([^;}\n]+)/g)) {
    const valeur = m[2];
    if (/color-mix\(/.test(valeur)) continue;              // voir l'encadré : teinte de sens, pas de thème
    if (!/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(valeur)) continue;
    trouves.push(`${m[1]}: ${valeur.trim()}`);
  }
  return trouves;
}

describe('🔴🔴 les surfaces du Drive n’écrivent aucune couleur en dur', () => {
  for (const [chemin, quoi] of SURFACES) {
    it(`🔴 ${quoi} ne passe que par les jetons`, () => {
      expect(couleursEnDur(readFileSync(chemin, 'utf8')), chemin).toEqual([]);
    });
  }
});

describe('🔴 la barre de titre s’inverse, et c’est par les jetons qu’elle le fait', () => {
  /**
   * 🔴 ELLE EST INVERSÉE PAR DESSIN : encre sur surface. En Clair cela donne une barre sombre, en Sombre une
   * barre claire — mesuré #e8ebef. Un `#16202c` écrit en dur aurait donné la même chose en Clair, et une barre
   * noire illisible en Sombre.
   */
  it('🔴 `--color-svv-ink` sur `--color-svv-surface`, jamais deux valeurs figées', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
    const i = src.indexOf('.sfd-barre-titre{');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('}', i));
    expect(bloc).toContain('background:var(--color-svv-ink)');
    expect(bloc).toContain('color:var(--color-svv-surface)');
  });
});

/**
 * ══ 🔴🔴 L'EXCEPTION, ÉCRITE NOIR SUR BLANC — ET UNE ERREUR QUE J'AI FAILLI LAISSER ═════════════════════════════
 *
 * En cherchant des couleurs en dur, j'ai trouvé `#bbb` et `#666` sur le cadre d'une image intégrée introuvable,
 * et je les ai passés aux jetons en croyant corriger un oubli. C'ÉTAIT FAUX : ce cadre vit sur la feuille
 * BLANCHE du mail, qui ne suit jamais le thème. Un jeton y aurait mis du gris clair sur du blanc en Sombre —
 * donc un cadre invisible, à l'endroit même qui doit se lire puisqu'il remplace une image absente.
 *
 * ⚠️ CE QUI PROTÈGE ICI N'EST PAS UNE RÈGLE DE PLUS, C'EST UNE RAISON ÉCRITE. Ce fichier scelle l'exception pour
 * que le prochain à passer ne refasse pas le même « correctif ».
 */
describe('🔴🔴 la feuille du mail est blanche À DESSEIN, et elle le reste', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  it('🔴🔴 `.cnv-html` pose une feuille blanche, quel que soit le thème', () => {
    const i = src.indexOf('.cnv-html{max-width:100%');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('}', i));
    expect(bloc).toContain('background:#fff');
    expect(bloc).toContain('color-scheme:light');
  });

  /** 🔴 ET CE QUI SE POSE DESSUS RESTE ACCORDÉ À ELLE, pas au thème : un gris sombre sur du blanc, toujours. */
  it('🔴 le cadre d’une image introuvable reste accordé à la feuille', () => {
    const i = src.indexOf('.cnv-html img[data-absente]{display:inline-block');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('}', i));
    expect(bloc).toContain('#bbb');
    expect(bloc).toContain('#666');
    expect(bloc).not.toContain('--color-svv-muted');
  });
});
