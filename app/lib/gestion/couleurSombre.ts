/**
 * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — DU TEXTE NOIR SUR UN FOND SOMBRE. Module PUR. ════════════════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) : « dans l'éditeur (Nouveau message), en thème Sombre, la signature HTML
 * (“Service Gestion”, l'adresse, les téléphones) s'écrit en noir sur fond sombre, donc illisible. Le reste du
 * texte est blanc. »
 *
 * ═══ 🔴 POURQUOI LE CSS NE SUFFIT PAS ══════════════════════════════════════════════════════════════════════
 *
 * La signature porte ses couleurs EN ATTRIBUT `style` (« color:#000 »), comme tout HTML de courrier. Un style en
 * ligne l'emporte sur toute feuille de style : la seule façon de le contrer en CSS serait un `!important`
 * général — qui écraserait AUSSI le rouge, les liens, et tout ce qu'Arno demande justement de ne pas toucher.
 *
 * 🔴 D'OÙ UNE DÉCISION COULEUR PAR COULEUR, prise à l'affichage : on ne relève que ce qui est SOMBRE ET TERNE.
 * Un texte noir ou gris foncé devient clair ; un rouge, un bleu de lien, une image ne bougent pas d'un pixel.
 *
 * ═══ 🔴🔴 CE QUE CE MODULE NE FAIT JAMAIS ══════════════════════════════════════════════════════════════════
 *
 * Il ne touche NI au HTML envoyé, NI au HTML stocké. Arno : « le mail part avec ses couleurs d'origine, noir sur
 * blanc pour le destinataire ». La correction vit dans le NAVIGATEUR, sur le DOM déjà peint, et elle est refaite
 * à chaque affichage — elle ne peut donc pas se glisser dans un corps qu'on enregistre ou qu'on envoie.
 *
 * ⚠️ ET LA RÈGLE « AUTOMATIQUE » RESTE EN VIGUEUR : aucun blanc imposé ne part dans un mail. Ce module ne
 * produit aucune couleur destinée à l'envoi ; il n'en discute même pas.
 */

/** Une couleur lue dans le DOM, ramenée à ses trois composantes. */
export interface Rvb { r: number; g: number; b: number }

/**
 * LIT UNE COULEUR CSS. Accepte ce que `getComputedStyle` rend (`rgb(...)`, `rgba(...)`) et ce qu'un mail écrit
 * (`#000`, `#1a1a1a`). Rend `null` pour tout le reste — un nom de couleur, un dégradé, `currentColor` : on ne
 * devine pas, et ne pas savoir vaut « on n'y touche pas ».
 *
 * ⚠️ UNE COULEUR TRANSPARENTE (`alpha = 0`) EST RENDUE `null` : elle ne se voit pas, il n'y a rien à corriger, et
 * l'éclaircir ferait apparaître un texte que l'auteur avait masqué. PUR.
 */
export function lireCouleur(brut: string | null | undefined): Rvb | null {
  const s = (brut ?? '').trim().toLowerCase();
  if (s === '') return null;

  const fonction = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.%]+)\s*)?\)$/.exec(s);
  if (fonction !== null) {
    const alpha = fonction[4] === undefined ? 1
      : (fonction[4].endsWith('%') ? Number(fonction[4].slice(0, -1)) / 100 : Number(fonction[4]));
    if (Number.isFinite(alpha) && alpha === 0) return null;
    return { r: Number(fonction[1]), g: Number(fonction[2]), b: Number(fonction[3]) };
  }

  const hexa = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hexa !== null) {
    const h = hexa[1];
    const d = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
    return { r: parseInt(d[0], 16), g: parseInt(d[1], 16), b: parseInt(d[2], 16) };
  }
  return null;
}

/**
 * LA LUMINANCE RELATIVE (WCAG). 0 = noir, 1 = blanc.
 *
 * ⚠️ CE N'EST PAS LA MOYENNE DES TROIS CANAUX : l'œil est bien plus sensible au vert qu'au bleu, et une moyenne
 * simple dirait qu'un bleu pur (#0000ff) est aussi clair qu'un vert pur. Sur un fond sombre, l'un est illisible
 * et l'autre éclatant. PUR.
 */
export function luminance(c: Rvb): number {
  const canal = (v: number): number => {
    const x = Math.min(255, Math.max(0, v)) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

/**
 * LA VIVACITÉ D'UNE COULEUR : l'écart entre son canal le plus fort et le plus faible, ramené à 0–1.
 *
 * 🔴 C'EST ELLE QUI PROTÈGE LE ROUGE ET LES LIENS. Un gris a ses trois canaux égaux (vivacité 0) ; un rouge
 * sombre (#a30402, la couleur de la marque) a un écart de 161 sur 255. La règle d'Arno — « les couleurs vives
 * (rouge, liens, etc.) ne sont jamais modifiées » — tient entièrement à cette mesure. PUR.
 */
export function vivacite(c: Rvb): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return (max - min) / 255;
}

/**
 * ⚠️ LES DEUX SEUILS, ET CE QU'ILS LAISSENT PASSER.
 *
 * · `LUMINANCE_SOMBRE` — au-dessus, le texte se lit déjà sur un fond sombre. 0,25 correspond à un gris moyen
 *   (#8a8a8a) : plus clair que lui, on n'y touche pas. Le gris foncé d'une signature (#333, luminance 0,03) et
 *   le noir (0) passent largement dessous.
 * · `VIVACITE_TERNE` — au-dessus, la couleur PORTE une information (c'est un rouge, un bleu de lien) et on la
 *   laisse, même sombre. 0,18 laisse passer les gris légèrement teintés qu'écrivent les éditeurs de courrier
 *   (#2b2f33 et ses cousins), et retient tout ce qui ressemble à une vraie teinte.
 *
 * 🔴 LES DEUX SONT EXIGÉS. Relever tout ce qui est sombre écraserait le rouge de la marque ; relever tout ce qui
 * est terne éclaircirait un gris clair qui se lisait très bien.
 */
export const LUMINANCE_SOMBRE = 0.25;
export const VIVACITE_TERNE = 0.18;

/**
 * FAUT-IL RELEVER CETTE COULEUR ? Arno : « tout texte dont la couleur imposée est sombre (noir ou gris foncé,
 * faible contraste avec le fond) s'affiche en couleur de texte claire. Les couleurs vives (rouge, liens, etc.)
 * et les images ne sont jamais modifiées. » PUR.
 */
export function couleurIllisibleSurFondSombre(brut: string | null | undefined): boolean {
  const c = lireCouleur(brut);
  if (c === null) return false;
  return luminance(c) < LUMINANCE_SOMBRE && vivacite(c) < VIVACITE_TERNE;
}

/**
 * ══ 🔴 LA MÊME QUESTION POUR UN FOND ═══════════════════════════════════════════════════════════════════════
 *
 * Un mail peut imposer un fond CLAIR à un bloc (« background:#fff ») en comptant sur du texte noir. En thème
 * Sombre, ce bloc reste blanc — et le texte, lui, aura été relevé en clair : blanc sur blanc, donc invisible.
 *
 * 🔴 D'OÙ LA RÈGLE SYMÉTRIQUE : là où un fond CLAIR est imposé, on ne touche à RIEN. Le bloc garde son fond
 * blanc et son texte noir, il se lit parfaitement, et il n'a jamais eu de problème. C'est ce qu'on veut : la
 * correction ne doit jamais rendre illisible ce qui l'était.
 */
export const LUMINANCE_FOND_CLAIR = 0.5;

export function fondClairImpose(brut: string | null | undefined): boolean {
  const c = lireCouleur(brut);
  return c !== null && luminance(c) >= LUMINANCE_FOND_CLAIR;
}
