/**
 * ══ 🔴🔴 LOT BULLE-INFO-ET-S12 — OÙ SE PLACE LA BULLE, ET POURQUOI C'EST UN MODULE PUR ═════════════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) : « Dans la modale “Rattacher ce mail à…”, la bulle est coupée par le bord de son
 * bloc. » Elle doit donc « se placer toute seule pour rester entièrement visible (droite par défaut, sinon
 * gauche, au-dessus ou en dessous) ».
 *
 * ═══ POURQUOI UN MODULE PUR, ET NON QUELQUES LIGNES DANS LE COMPOSANT ═══════════════════════════════════════════
 *
 * Parce que c'est la SEULE partie de la bulle qu'on peut éprouver sans navigateur. « Près du bord droit », « bas de
 * modale », « petit écran » sont trois jeux de nombres : ici ils tiennent en trois essais, alors que dans le
 * composant il faudrait simuler des `getBoundingClientRect` — c'est-à-dire éprouver la simulation, pas la règle.
 *
 * 🔴 ELLE RAISONNE EN COORDONNÉES DE FENÊTRE (celles de `getBoundingClientRect`), et le composant pose la bulle en
 * `position:fixed`. Aucun décalage de défilement n'entre donc dans le calcul : c'est ce qui fait que la bulle reste
 * collée à son picto quand la page défile — il suffit de recalculer avec le nouveau rectangle.
 */

/** Un rectangle, dans les coordonnées de la fenêtre : exactement ce que rend `getBoundingClientRect`. */
export interface Boite {
  gauche: number;
  haut: number;
  largeur: number;
  hauteur: number;
}

/** Le côté finalement retenu. Il n'est pas qu'une information : la petite flèche de la bulle s'y accroche. */
export type CoteBulle = 'droite' | 'gauche' | 'dessous' | 'dessus';

export interface PlaceBulle {
  gauche: number;
  haut: number;
  cote: CoteBulle;
  /**
   * La hauteur MAXIMALE que la bulle peut prendre sans sortir de la fenêtre. Le composant la pose en
   * `max-height` : une fiche très longue défile à l'intérieur de la bulle au lieu de passer sous le bord.
   */
  hauteurMax: number;
}

/** L'écart entre le picto et la bulle — assez petit pour que le lien de parenté se voie. */
export const ECART_PICTO = 8;
/** La marge gardée entre la bulle et le bord de la fenêtre. En dessous, la bulle a l'air coupée même si elle ne l'est pas. */
export const MARGE_BORD = 8;

const borner = (v: number, min: number, max: number): number => (max < min ? min : Math.min(Math.max(v, min), max));

/**
 * LA PLACE DE LA BULLE, dans l'ordre de préférence d'Arno : à DROITE du picto, sinon à GAUCHE, sinon EN DESSOUS,
 * sinon AU-DESSUS. Le dernier repli ne refuse jamais de placer : il borne.
 *
 * 🔴 « ENTIÈREMENT VISIBLE » EST LA SEULE RÈGLE, et elle est vérifiée sur les DEUX axes à chaque fois. Un côté
 * retenu parce qu'il tient en largeur mais qui sortirait par le bas serait exactement le défaut qu'Arno a vu.
 */
export function placerLaBulle(o: {
  /** Le picto « i », tel que le navigateur le mesure. */
  picto: Boite;
  /** La bulle, mesurée APRÈS son rendu : c'est pour cela que le composant la dessine invisible une image avant. */
  bulle: { largeur: number; hauteur: number };
  /** La fenêtre du navigateur. */
  fenetre: { largeur: number; hauteur: number };
}): PlaceBulle {
  const { picto, bulle, fenetre } = o;
  const hauteurMax = Math.max(fenetre.hauteur - 2 * MARGE_BORD, 0);
  const hauteur = Math.min(bulle.hauteur, hauteurMax);
  const hautMin = MARGE_BORD;
  const hautMax = fenetre.hauteur - MARGE_BORD - hauteur;
  const gaucheMin = MARGE_BORD;
  const gaucheMax = fenetre.largeur - MARGE_BORD - bulle.largeur;

  // ── À DROITE, LE DÉFAUT ───────────────────────────────────────────────────────────────────────────────────────
  // Verticalement, la bulle est CENTRÉE sur le picto puis ramenée dans la fenêtre : on lit le descriptif en face
  //   de la ligne dont il parle, ce qui est tout l'intérêt d'une bulle latérale.
  const aCote = borner(picto.haut + picto.hauteur / 2 - hauteur / 2, hautMin, hautMax);
  const droite = picto.gauche + picto.largeur + ECART_PICTO;
  if (droite + bulle.largeur <= fenetre.largeur - MARGE_BORD) {
    return { gauche: droite, haut: aCote, cote: 'droite', hauteurMax };
  }

  // ── À GAUCHE ──────────────────────────────────────────────────────────────────────────────────────────────────
  const gauche = picto.gauche - ECART_PICTO - bulle.largeur;
  if (gauche >= MARGE_BORD) {
    return { gauche, haut: aCote, cote: 'gauche', hauteurMax };
  }

  // ── EN DESSOUS, PUIS AU-DESSUS ────────────────────────────────────────────────────────────────────────────────
  // Horizontalement, la bulle est centrée sur le picto et ramenée dans la fenêtre : c'est la place du bas de modale
  //   et celle du téléphone, où aucun côté ne tient.
  const centre = borner(picto.gauche + picto.largeur / 2 - bulle.largeur / 2, gaucheMin, gaucheMax);
  const dessous = picto.haut + picto.hauteur + ECART_PICTO;
  if (dessous + hauteur <= fenetre.hauteur - MARGE_BORD) {
    return { gauche: centre, haut: dessous, cote: 'dessous', hauteurMax };
  }
  const dessus = picto.haut - ECART_PICTO - hauteur;
  if (dessus >= MARGE_BORD) {
    return { gauche: centre, haut: dessus, cote: 'dessus', hauteurMax };
  }

  /**
   * 🔴 LE DERNIER REPLI NE REFUSE PAS DE PLACER. Quand rien ne tient — une bulle plus haute que la fenêtre, un
   * téléphone en paysage —, on la pose en dessous et on la BORNE : elle défile à l'intérieur. Rendre `null` ferait
   * disparaître le descriptif, ce qui est pire que de le faire défiler.
   */
  return { gauche: centre, haut: borner(dessous, hautMin, hautMax), cote: 'dessous', hauteurMax };
}
