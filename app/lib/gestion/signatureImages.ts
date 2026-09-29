import { adressesDesImages, estDistante } from './imagesMail';
// ⚠️ LE CHEMIN EST DÉFINI DANS `htmlMail`, la couche la plus basse : l'assainissement doit l'accepter comme source
//    d'image, et une seconde définition serait un second endroit à tenir d'accord. Réexporté ci-dessous.
import { CHEMIN_IMAGE_SIGNATURE } from './htmlMail';

/**
 * LOT ETOILE-ET-SIGNATURE — LES IMAGES DE LA SIGNATURE GMAIL. Module PUR : aucun réseau, aucune base, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ARNO DEMANDE : « que mes signatures partent dans leur vrai format, comme dans Gmail » — logo Sans
 * Vis-à-Vis, nom en gras, adresse en lien, icônes de téléphone.
 *
 * LE CHEMIN EST EN DEUX TEMPS, ET C'EST VOULU :
 *
 *   ① À L'ÉCRAN, les images passent par NOTRE route (`/api/admin/gestion/signature/image?rang=N`). Le navigateur
 *      n'appelle donc jamais Google directement — mesuré le 29/09/2026 : les adresses `lh3/lh5.googleusercontent.com`
 *      se chargent parfaitement depuis notre SERVEUR (200, image/png, 1 933 / 835 / 1 600 octets) mais restaient
 *      VIDES dans la page. Un logo cassé dans l'éditeur, c'est un logo dont on doute jusqu'à l'envoi.
 *
 *   ② À L'ENVOI, ces mêmes adresses deviennent des `cid:` et les octets voyagent DANS le message
 *      (`multipart/related`). Le destinataire les voit sans aucun lien externe — donc même si son client bloque
 *      les images distantes (le réglage par défaut d'Outlook), et même le jour où l'adresse Google change.
 *
 * 🔴 LE MARQUEUR EST NOTRE PROPRE ADRESSE DE ROUTE, et c'est ce qui fait tenir l'ensemble. Le brouillon enregistré
 * porte cette adresse ; une réponse, un transfert, un brouillon rouvert la portent aussi, puisqu'ils reprennent le
 * HTML tel quel. L'envoi n'a donc rien à deviner : il reconnaît SES adresses et les remplace. Aucune autre image du
 * message n'est touchée — celles qu'on colle ou qu'on joint restent ce qu'elles sont.
 *
 * ⚠️ JAMAIS D'IMAGE CASSÉE. Une image qu'on n'a pas su récupérer perd son `src` ENTIER (et non « garde un lien
 * mort ») : la signature part sans elle, ce qui se remarque à peine, plutôt qu'avec un carré barré, qui se remarque
 * chez tous les destinataires.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le chemin de NOTRE route d'images de signature. Écrit une fois : l'écran le pose, l'envoi le reconnaît. */
export { CHEMIN_IMAGE_SIGNATURE };

/** L'adresse que l'éditeur affiche pour la Nᵉ image de la signature. PUR. */
export function adresseEcranSignature(rang: number): string {
  return `${CHEMIN_IMAGE_SIGNATURE}?rang=${rang}`;
}

/**
 * Le rang porté par une de NOS adresses, ou `null` si ce n'en est pas une. PUR.
 *
 * ⚠️ ON ACCEPTE LA FORME ABSOLUE AUTANT QUE LA RELATIVE : l'éditeur riche du navigateur réécrit volontiers un
 * `src` relatif en absolu au moment de sérialiser (`http://localhost:3000/api/…`). Ne reconnaître que la forme
 * relative ferait partir la signature avec des adresses vers notre serveur — invisibles à l'écran, mortes chez le
 * destinataire. C'est exactement le genre de défaut qu'on ne voit jamais chez soi.
 */
export function rangSignature(src: string): number | null {
  const s = (src ?? '').trim();
  const i = s.indexOf(CHEMIN_IMAGE_SIGNATURE);
  if (i < 0) return null;
  // Ce doit être le DÉBUT du chemin, pas un morceau au milieu d'une autre adresse.
  if (i > 0 && !/^https?:\/\/[^/]+$/.test(s.slice(0, i))) return null;
  const m = /[?&]rang=(\d{1,3})(?:&|$)/.exec(s.slice(i));
  return m === null ? null : Number(m[1]);
}

/**
 * Réécrit les `src` d'un document, un par un, par RANG. `null` rendu ⇒ le `src` est RETIRÉ (l'image ne demande
 * alors rien à personne). PUR.
 *
 * ⚠️ LE RANG COMPTE TOUTES LES IMAGES, dans l'ordre du document — même règle que `reecrireImages` pour les mails
 * reçus, et pour la même raison : deux comptages différents pour un seul rang finissent par servir une image à la
 * place d'une autre.
 */
export function reecrireSources(html: string, remplacer: (src: string, rang: number) => string | null): string {
  let rang = 0;
  return html.replace(/<img\b[^>]*>/gi, (balise) => {
    const r = rang++;
    const m = /\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(balise);
    const src = m === undefined || m === null ? '' : (m[2] ?? m[3] ?? m[4] ?? '');
    const neuf = remplacer(src, r);
    if (neuf === null) {
      return m === null ? balise : balise.replace(m[0], '');
    }
    if (m === null) return balise.replace(/^<img\b/i, `<img src="${neuf}"`);
    return balise.replace(m[0], ` src="${neuf}"`);
  });
}

/**
 * ① LA SIGNATURE TELLE QUE L'ÉDITEUR LA MONTRE : chaque image DISTANTE passe par notre route, par son rang.
 *
 * ⚠️ `data:` ET `cid:` NE SONT PAS TOUCHÉS. Le premier porte déjà ses octets ; le second n'a rien à faire dans une
 * signature Gmail, mais s'il y était, le relayer n'aurait aucun sens.
 */
export function signaturePourEcran(html: string): string {
  return reecrireSources(html, (src, rang) => (estDistante(src) ? adresseEcranSignature(rang) : src));
}

/** Ce qu'une image de signature devient à l'envoi : ses octets, et le `cid` qui la désigne. */
export interface ImageSignature {
  rang: number;
  cid: string;
  nom: string;
  typeMime: string;
  octets: Buffer;
}

/**
 * ② LE CORPS TEL QU'IL PART : nos adresses deviennent des `cid:`, et les octets partent avec le message.
 *
 * 🔴 CE QU'ON NE TROUVE PAS, ON LE RETIRE. Un rang sans octets perd son `src` entier — la signature part sans
 * cette image. Arno en est informé (l'appelant le journalise) ; le destinataire, lui, ne voit pas de carré barré.
 *
 * ⚠️ SEULES NOS ADRESSES SONT TOUCHÉES. Une image collée dans le corps, une image distante d'une citation : elles
 * ne portent pas notre chemin, elles ne bougent pas. Ce module ne décide de rien d'autre que de la signature.
 */
export function corpsPourEnvoi(
  html: string, images: readonly ImageSignature[],
): { html: string; manquantes: number[] } {
  const parRang = new Map(images.map((i) => [i.rang, i]));
  const manquantes: number[] = [];
  const sortie = reecrireSources(html, (src) => {
    const rang = rangSignature(src);
    if (rang === null) return src;
    const img = parRang.get(rang);
    if (img === undefined) { manquantes.push(rang); return null; }
    return `cid:${img.cid}`;
  });
  return { html: sortie, manquantes };
}

/**
 * L'identifiant d'une image incorporée. Il doit être UNIQUE AU MONDE (RFC 2392) : le domaine d'envoi le garantit,
 * et l'aléa évite qu'un client confonde deux messages d'une même conversation. PUR.
 */
export function cidSignature(rang: number, domaine: string, alea: string): string {
  const propre = alea.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'x';
  return `sig${rang}.${propre}@${domaine}`;
}

/** Les adresses distantes d'une signature, dans l'ordre du document. Délègue — une seule lecture pour tout le module. */
export function adressesSignature(html: string | null | undefined): string[] {
  return adressesDesImages(html);
}
