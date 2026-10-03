/**
 * ══ 🔴🔴 LOT SIGNATURE-ECHELLE — UNE ICÔNE DE SIGNATURE RESTE UNE ICÔNE. Module PUR ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), conversation « scan » (fil 36671) : « les icônes de la signature Service Gestion
 * (épingle, mobile, téléphone) s'affichent désormais, mais ÉNORMES — plusieurs centaines de pixels — au lieu de
 * leur petite taille d'origine, environ 20 px, alignées sur la ligne de texte, comme dans le message d'origine. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ SUR LES DEUX MESSAGES, ET IL DÉSIGNE UN SEUL COUPABLE ════════════════════════════
 *
 *   · MESSAGE 57464 — NOTRE ENVOI, tel que la relève l'a capté :
 *         <img width="20" height="20" src="data:image/png;base64,…" style="margin-top: 0px; margin-left: 0px">
 *     Les dimensions SONT là, et elles sont justes : 20 × 20.
 *
 *   · MESSAGE 57465 — LA RÉPONSE D'ARNO, écrite depuis Gmail, qui CITE notre signature :
 *         <img src="cid:1d0ecfbd47378a46_0.0.1" style="width:240px;max-width:100%">
 *     🔴 GMAIL A RETIRÉ LES ATTRIBUTS `width` ET `height` ET LES A REMPLACÉS PAR `width:240px`. Douze fois la
 *     taille d'origine. Ce message ne porte AUCUNE pièce (0 en base) : ses trois `cid:` sont résolus par la
 *     CONVERSATION, c'est-à-dire sur les pièces 27118/27119/27120 de notre propre envoi.
 *
 * ═══ CE QUI N'EST **PAS** EN CAUSE, et il fallait le vérifier plutôt que le supposer ═════════════════════════════
 *
 *   · NOTRE NETTOYAGE NE RETIRE RIEN : `width` et `height` sont des attributs autorisés sur `img`, et `width`,
 *     `height`, `max-width` sont des propriétés autorisées du profil « reception » (`htmlMail.ts`).
 *   · LE REMPLACEMENT DU `cid:` NE PERD RIEN : `remplacerSrc` ne change que le `src` et laisse le reste de la
 *     balise intact — attributs et style compris.
 *
 * Le défaut n'est donc pas chez nous, mais la correction l'est : nous AVONS la taille d'origine, dans notre
 * propre message, et c'est elle qui fait foi pour une image que nous avons nous-mêmes publiée.
 *
 * ═══ 🔴🔴 LES TROIS RÈGLES, ET CE QU'ELLES NE FONT PAS ═══════════════════════════════════════════════════════════
 *
 *   ① L'ORIGINE GAGNE, QUAND C'EST UNE ICÔNE. Un `cid:` résolu par la conversation désigne une image que NOUS
 *      avons envoyée : les dimensions écrites par son auteur font foi devant celles qu'un client citant a
 *      réécrites. On n'applique cette règle que si l'origine est PETITE (≤ 64 px) — autrement dit à une icône.
 *   ② SANS AUCUNE DIMENSION, UNE ICÔNE DE SIGNATURE PREND UNE TAILLE DE LIGNE : hauteur bornée à 1,2 em, pour
 *      qu'elle s'aligne sur le texte au lieu de le dominer.
 *   ③ TOUT LE RESTE EST LAISSÉ TEL QUEL.
 *
 * 🔴🔴 UNE IMAGE DE CONTENU N'EST JAMAIS TOUCHÉE, et c'est la borne qu'Arno a posée. Une photo, un document
 * scanné, une capture d'écran gardent la taille que leur message leur donne — la règle ① ne s'applique qu'à une
 * origine d'au plus 64 px, la règle ② qu'à une image que `estImageDeSignature` reconnaît. Une photo citée à
 * 240 px par Gmail RESTE à 240 px : la rendre à sa taille d'origine (parfois 1 200 px) serait un second défaut,
 * symétrique du premier. La largeur du mail la borne de toute façon (`.cnv-html img{max-width:100%}`).
 *
 * 🔒 CE MODULE EST PUR : pas un `fetch`, pas de SQL, pas de DOM. Il lit des chaînes et il en rend.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { estImageDeSignature } from './lisibilite';

/**
 * ⚠️ AU-DELÀ DE 64 px, CE N'EST PLUS UNE ICÔNE. Une épingle, un combiné, un petit mobile tiennent dans 16, 20 ou
 * 32 px ; 64 laisse la place aux icônes à double densité (une image 40×40 affichée à 20) sans jamais attraper une
 * vignette de photo. C'est la borne qui empêche la règle ① de toucher à une image de contenu.
 */
export const ICONE_MAX_PX = 64;

/**
 * ⚠️ LA HAUTEUR DE REPLI, EN `em` ET NON EN PIXELS : elle suit la taille du texte du mail. 1,2 em est la hauteur
 * d'une ligne — une icône qui la dépasse pousse la ligne, une icône qui s'y tient s'aligne dessus, ce qui est
 * exactement ce qu'Arno décrit du message d'origine.
 */
export const HAUTEUR_ICONE = '1.2em';

/** Ce qu'une balise dit de sa taille. `null` = elle n'en dit rien. */
export interface Dimensions {
  largeur: number | null;
  hauteur: number | null;
}

export const SANS_DIMENSIONS: Dimensions = { largeur: null, hauteur: null };

const attribut = (balise: string, nom: string): string | null => {
  const m = new RegExp(`\\b${nom}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(balise);
  return m === null ? null : (m[2] ?? m[3] ?? m[4] ?? '').trim();
};

/**
 * ⚠️ ON NE LIT QUE DES PIXELS, ET C'EST VOLONTAIRE. Un `width:80%` est une consigne RELATIVE, parfaitement
 * légitime et que nous n'avons aucune raison de contredire : on la laisse passer sans la comprendre. Seule une
 * valeur en pixels se compare à une autre valeur en pixels, et la comparaison est tout ce dont les règles ont
 * besoin.
 */
function enPixels(valeur: string | null): number | null {
  if (valeur === null) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(valeur);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** La valeur d'une propriété dans un `style="…"`. PUR. */
export function proprieteDuStyle(balise: string, propriete: string): string | null {
  const style = attribut(balise, 'style');
  if (style === null) return null;
  for (const bout of style.split(';')) {
    const i = bout.indexOf(':');
    if (i < 0) continue;
    if (bout.slice(0, i).trim().toLowerCase() === propriete) return bout.slice(i + 1).trim();
  }
  return null;
}

/**
 * ══ 🔴 CE QUE LA BALISE DIT DE SA TAILLE. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE `style` L'EMPORTE SUR L'ATTRIBUT, parce que c'est ce que fait le navigateur. Lire l'attribut en premier
 * aurait fait croire que le message 57465 demandait 20 px alors que son style en impose 240 — et l'on aurait
 * conclu qu'il n'y avait rien à corriger.
 */
export function dimensionsDeLaBalise(balise: string): Dimensions {
  return {
    largeur: enPixels(proprieteDuStyle(balise, 'width')) ?? enPixels(attribut(balise, 'width')),
    hauteur: enPixels(proprieteDuStyle(balise, 'height')) ?? enPixels(attribut(balise, 'height')),
  };
}

/** La balise porte-t-elle une consigne de taille, quelle qu'elle soit (pixels, pourcentage, `auto`) ? PUR. */
export function aUneTaille(balise: string): boolean {
  for (const nom of ['width', 'height']) {
    if ((proprieteDuStyle(balise, nom) ?? '') !== '') return true;
    if ((attribut(balise, nom) ?? '') !== '') return true;
  }
  return false;
}

/** Les dimensions de chaque `<img>` d'un document, dans l'ordre. PUR — c'est l'ordre du rang. */
export function dimensionsParRang(html: string): Dimensions[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => dimensionsDeLaBalise(m[0]));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA DÉCISION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type Consigne =
  /** ① On impose les dimensions de l'image telle que SON auteur l'a publiée. */
  | { sorte: 'origine'; largeur: number | null; hauteur: number | null }
  /** ② On borne la hauteur à celle d'une ligne de texte. */
  | { sorte: 'icone' }
  /** ③ On ne touche à rien. */
  | null;

/** Une dimension d'icône : petite dans les deux sens, ou petite dans le seul sens qu'on connaisse. */
function estUneIcone(d: Dimensions): boolean {
  const mesures = [d.largeur, d.hauteur].filter((x): x is number => x !== null);
  return mesures.length > 0 && mesures.every((x) => x <= ICONE_MAX_PX);
}

/**
 * ══ 🔴🔴 QUELLE TAILLE DONNER À CETTE IMAGE. PUR. ════════════════════════════════════════════════════════════════
 *
 * `origine` = ce que disait la balise du message qui PORTE réellement cette image (notre envoi, pour un `cid:`
 * résolu par la conversation). `null` ⇒ on ne la connaît pas.
 *
 * 🔴 L'ORDRE DES RÈGLES EST LE SENS DU LOT : l'origine d'abord, parce qu'elle est la vérité de l'auteur ; le
 * repli d'icône ensuite, parce qu'il vaut mieux qu'une signature démesurée ; et rien du tout en dernier, parce
 * qu'une image de contenu ne se corrige pas.
 */
export function consigneDeTaille(o: {
  balise: string;
  origine?: Dimensions | null;
  /** Le nom, le type et le poids de la pièce, quand on les a : ils disent si c'est une image de signature. */
  piece?: { nomFichier: string; typeMime?: string | null; tailleOctets?: number | null } | null;
}): Consigne {
  const origine = o.origine ?? null;
  /**
   * ① L'ORIGINE GAGNE, MAIS SEULEMENT POUR UNE ICÔNE. C'est ici que le cas d'Arno se répare : la balise dit
   * 240 px, l'origine dit 20 × 20, et 20 ≤ 64 — donc 20 × 20. Si l'origine était une photo de 1 200 px, la
   * condition tombe et l'on ne touche à rien : on ne RAGRANDIT pas ce qu'un client a volontairement réduit.
   */
  if (origine !== null && estUneIcone(origine)) {
    const actuelle = dimensionsDeLaBalise(o.balise);
    /* ⚠️ RIEN À FAIRE SI C'EST DÉJÀ LA BONNE TAILLE : réécrire une balise identique ferait du bruit dans les
       différences sans rien changer à l'écran. */
    if (actuelle.largeur === origine.largeur && actuelle.hauteur === origine.hauteur) return null;
    return { sorte: 'origine', largeur: origine.largeur, hauteur: origine.hauteur };
  }
  /**
   * ② AUCUNE TAILLE NULLE PART, ET C'EST UNE IMAGE DE SIGNATURE : on la borne à la hauteur d'une ligne. Sans
   * cela, le navigateur l'afficherait à sa taille NATURELLE — une icône à double densité de 40 ou 80 px au
   * milieu d'un texte de 13 px.
   */
  const p = o.piece ?? null;
  if (!aUneTaille(o.balise) && p !== null && estImageDeSignature({
    nomFichier: p.nomFichier, typeMime: p.typeMime ?? null, tailleOctets: p.tailleOctets ?? null,
  })) {
    return { sorte: 'icone' };
  }
  return null;                                           // ③ une image de contenu ne se corrige pas
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   APPLIQUER LA CONSIGNE À LA BALISE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Retire une propriété d'un `style`, et rend le style restant (vide s'il ne reste rien). */
function sansProprietes(style: string, proprietes: readonly string[]): string {
  return style.split(';')
    .filter((bout) => {
      const i = bout.indexOf(':');
      if (i < 0) return bout.trim() !== '';
      return !proprietes.includes(bout.slice(0, i).trim().toLowerCase());
    })
    .map((x) => x.trim()).filter((x) => x !== '').join(';');
}

/** Pose (ou remplace) l'attribut `style` d'une balise. */
function avecStyle(balise: string, style: string): string {
  const sansAncien = balise.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
  const fin = sansAncien.replace(/\s*\/?>$/, '');
  const auto = /\/>$/.test(sansAncien.trim()) ? ' />' : '>';
  return style === '' ? `${fin}${auto}` : `${fin} style="${style}"${auto}`;
}

/** Retire un attribut d'une balise. */
function sansAttribut(balise: string, nom: string): string {
  return balise.replace(new RegExp(`\\s${nom}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'ig'), '');
}

/** Pose un attribut (après l'avoir retiré s'il existait). */
function avecAttribut(balise: string, nom: string, valeur: string): string {
  const net = sansAttribut(balise, nom);
  const fin = net.replace(/\s*\/?>$/, '');
  const auto = /\/>$/.test(net.trim()) ? ' />' : '>';
  return `${fin} ${nom}="${valeur}"${auto}`;
}

/**
 * ══ 🔴🔴 LA BALISE, REDIMENSIONNÉE. PUR. ════════════════════════════════════════════════════════════════════════
 *
 * 🔴 ON ÉCRIT DANS LE `style` **ET** DANS LES ATTRIBUTS, et il faut les deux : le style l'emporte dans le
 * navigateur, donc laisser `width:240px` en place aurait annulé un attribut `width="20"` parfaitement posé. Les
 * attributs restent pour les lecteurs qui n'appliquent pas de style.
 *
 * ⚠️ `max-width:100%` N'EST JAMAIS RETIRÉ : c'est la borne qui empêche une image de déborder du mail, et elle
 * vaut pour toutes. On ne retire que `width` et `height`, les deux seules que l'on remplace.
 */
export function appliquerTaille(balise: string, consigne: Consigne): string {
  if (consigne === null) return balise;
  const styleActuel = attribut(balise, 'style') ?? '';
  const reste = sansProprietes(styleActuel, ['width', 'height', 'min-width', 'min-height',
    'max-height']);

  if (consigne.sorte === 'icone') {
    /* ② LA HAUTEUR MÈNE, la largeur suit (`width:auto`) : une icône gardera ses proportions. */
    const style = [reste, `height:${HAUTEUR_ICONE}`, 'width:auto'].filter((x) => x !== '').join(';');
    return avecStyle(sansAttribut(sansAttribut(balise, 'width'), 'height'), style);
  }

  const morceaux = [reste];
  if (consigne.largeur !== null) morceaux.push(`width:${consigne.largeur}px`);
  if (consigne.hauteur !== null) morceaux.push(`height:${consigne.hauteur}px`);
  let sortie = avecStyle(balise, morceaux.filter((x) => x !== '').join(';'));
  sortie = consigne.largeur === null
    ? sansAttribut(sortie, 'width') : avecAttribut(sortie, 'width', String(consigne.largeur));
  sortie = consigne.hauteur === null
    ? sansAttribut(sortie, 'height') : avecAttribut(sortie, 'height', String(consigne.hauteur));
  return sortie;
}
