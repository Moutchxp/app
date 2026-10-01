/**
 * MODULE « GESTION » — LOT LECTURE-HTML-FIL-TROMBONE : LES IMAGES D'UN MAIL EN HTML. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE PROBLÈME, ET POURQUOI IL N'A PAS DE SOLUTION NAÏVE.
 *
 * Un mail en HTML porte deux sortes d'images, et aucune des deux ne peut être posée telle quelle dans la page :
 *
 *   · `cid:image003.png@01DC…`  — une image INTÉGRÉE au message. Ce n'est pas une adresse : c'est une référence à
 *     une PARTIE du mail. Le navigateur ne sait pas la résoudre ; laissée telle quelle, elle produit une image
 *     cassée. Mesuré sur la vraie base le 29/09/2026 : **63 mails**.
 *
 *   · `https://…`               — une image DISTANTE, chez l'expéditeur ou chez Google. Mesuré : **48 162 mails**.
 *     La laisser telle quelle ferait appeler le serveur de l'expéditeur DEPUIS LE POSTE DE LA PERSONNE QUI LIT :
 *     son adresse IP, son navigateur, l'heure exacte de lecture. C'est le pixel espion, et c'est le mécanisme par
 *     lequel un expéditeur sait qu'un mail a été ouvert.
 *
 * ═══ 🔴 CE QU'ON RETIENT, ET CE QUE ÇA COÛTE ═══════════════════════════════════════════════════════════════════
 *
 * ① Les `cid:` sont résolus vers NOTRE route de pièces jointes, par rapprochement de NOM DE FICHIER.
 * ② Les images distantes passent par NOTRE route, qui va les chercher depuis le serveur.
 *
 * ⚠️ CE QUE LE RELAIS PROTÈGE, ET CE QU'IL NE PROTÈGE PAS — il faut le dire en entier. Il empêche l'expéditeur
 * d'apprendre l'adresse IP, le navigateur et le système de la personne qui lit. Il ne l'empêche PAS de savoir que
 * le mail a été ouvert : notre serveur, lui, va bien chercher l'image. Supprimer aussi cela demanderait de ne pas
 * afficher les images du tout — ce qui est l'autre choix possible, et ce n'est pas celui qu'Arno a demandé.
 *
 * 🔴 ET SURTOUT : LA ROUTE NE PREND JAMAIS UNE ADRESSE EN PARAMÈTRE. Elle prend un MESSAGE et un RANG (« la 3ᵉ
 * image du mail 57185 »), puis relit l'adresse dans le HTML stocké. Une route qui accepterait une URL serait un
 * relais ouvert : n'importe qui pourrait s'en servir pour faire appeler par notre serveur une adresse interne
 * (`http://localhost:9000`, un service du réseau privé) et lire la réponse. C'est la faille SSRF, et on ne l'ouvre
 * pas — même « juste pour les images ».
 *
 * ⚠️ LE RANG SE CALCULE SUR LE HTML **ASSAINI**, des deux côtés. `assainirHtml` est pure et déterministe : le rendu
 * et le relais comptent donc les mêmes images dans le même ordre. Compter d'un côté sur le HTML brut et de l'autre
 * sur l'assaini décalerait tout dès qu'une balise tombe — et l'on servirait une image pour une autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  lireDataImage, octetsDeLaCharge, refusDeLImage, tailleLisible, vignetteImage,
} from './imagesIntegrees';

/** Ce qu'on sait d'une pièce pour résoudre un `cid:`. */
export interface PieceIntegree { pieceId: number; nomFichier: string }

/**
 * LES ADRESSES `src` DE TOUTES LES IMAGES, DANS L'ORDRE DU DOCUMENT. PUR.
 *
 * C'est la fonction pivot : le rendu s'en sert pour réécrire, le relais pour retrouver l'adresse du rang demandé.
 * Une seule lecture du document, donc un seul ordre — deux analyses différentes finiraient par diverger.
 *
 * ⚠️ ON NE CHERCHE PAS À COMPRENDRE LE DOCUMENT. Comme `htmlMail`, c'est un lecteur de balises : il relève les
 * `<img …>` et l'attribut `src` de chacun. Le HTML qu'il reçoit est DÉJÀ assaini — il ne reste ni script, ni
 * attribut d'événement, ni balise inconnue.
 */
export function adressesDesImages(html: string | null | undefined): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*>/gi;
  const source = html ?? '';
  for (const balise of source.match(re) ?? []) {
    const src = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(balise);
    out.push(src === null ? '' : (src[2] ?? src[3] ?? src[4] ?? '').trim());
  }
  return out;
}

/** Une adresse `cid:…`, réduite à son identifiant nu (sans le préfixe, sans les chevrons). `null` si ce n'en est pas une. */
export function identifiantCid(src: string): string | null {
  const s = (src ?? '').trim();
  if (!/^cid:/i.test(s)) return null;
  const nu = s.slice(4).trim().replace(/^</, '').replace(/>$/, '').trim();
  return nu === '' ? null : decodeURIComponent(nu);
}

/** Une adresse DISTANTE, qu'il faudra relayer ? `data:` ne l'est pas (elle porte ses propres octets). */
export function estDistante(src: string): boolean {
  return /^https?:\/\//i.test((src ?? '').trim());
}

/**
 * ══ 🔴🔴 RÉSOUT UN `cid:` VERS UNE PIÈCE DU MESSAGE — ET IL FAUT DIRE JUSQU'OÙ ÇA VA ═══════════════════════════
 *
 * On rapproche par NOM DE FICHIER, parce qu'un `cid` s'écrit très souvent `image003.png@01DC579B.8FCB6050` : la
 * partie avant l'arobase EST le nom du fichier. C'est la seule voie dont nous disposons, et elle est étroite.
 *
 * ═══ CE QUE ÇA COUVRE VRAIMENT, MESURÉ LE 29/09/2026 SUR LA VRAIE BASE ══════════════════════════════════════════
 *
 *     156 références `cid:` réparties sur 62 mails  →  **3** se résolvent par le nom.
 *
 * Les autres portent des pièces RENOMMÉES à la capture (« Outlook-cid_image0.png », « image.png »,
 * « ~WRD0000.jpg ») : le lien avec le `cid` d'origine est perdu, et aucune ruse ne le retrouvera.
 *
 * 🔴 POURQUOI ON NE FAIT PAS MIEUX, ET POURQUOI CE N'EST PAS UN OUBLI. La voie juste serait de ranger le
 * `Content-ID` à la CAPTURE, dans une colonne dédiée. Or le seul endroit du dépôt qui analyse les parties d'un
 * mail est `app/lib/email/imap.ts`, explicitement hors du périmètre de ce lot : rien ne pourrait donc remplir
 * cette colonne, et la livrer serait livrer du bois mort. Le jour où l'on ouvrira ce fichier, ce sera une colonne
 * et trois lignes.
 *
 * ⚠️ EN ATTENDANT, UNE IMAGE NON RETROUVÉE EST **DITE**, jamais cassée : c'est la règle du module — ce qu'on ne
 * peut pas montrer, on l'écrit. Et cela ne concerne que des LOGOS DE SIGNATURE : le corps du mail, lui, s'affiche
 * entièrement.
 */
export function pieceDuCid(cid: string, pieces: readonly PieceIntegree[]): PieceIntegree | null {
  const cle = cid.trim().toLowerCase();
  if (cle === '') return null;
  const nom = cle.split('@')[0].trim();
  if (nom === '') return null;
  return pieces.find((p) => (p.nomFichier ?? '').trim().toLowerCase() === nom) ?? null;
}

/**
 * L'IMAGE QU'ON MET À LA PLACE D'UNE IMAGE INTÉGRÉE INTROUVABLE.
 *
 * 🔴 PAS UNE IMAGE CASSÉE, ET PAS UN TROU MUET. Une image cassée fait croire à une panne ; un trou fait croire
 * qu'il n'y avait rien. On laisse une marque discrète, avec le mot — c'est la règle du module : ce qu'on ne peut
 * pas montrer, on le DIT.
 */
export const MENTION_IMAGE_INTROUVABLE = 'image intégrée non retrouvée';

/**
 * ══ 🔴 RÉÉCRIT TOUTES LES ADRESSES D'IMAGES DU DOCUMENT. PUR. ══════════════════════════════════════════════════
 *
 * Le HTML reçu est DÉJÀ ASSAINI (`assainirHtml`) : cette fonction ne protège de rien, elle range. Elle ne doit
 * JAMAIS être employée sur du HTML brut — l'ordre est assainir PUIS réécrire, et un test le scelle.
 *
 * ⚠️ LE RANG PASSÉ À `relais` EST CELUI DE L'IMAGE DANS TOUT LE DOCUMENT, images `data:` et `cid:` comprises. Ne
 * compter que les distantes obligerait le relais à refaire exactement le même tri pour retomber sur le même
 * numéro — deux comptages pour un seul rang, donc un jour deux rangs différents.
 */
export function reecrireImages(
  html: string,
  o: {
    /** Les pièces du message, pour résoudre les `cid:`. Vide = on ne résout rien (le message n'en a aucune). */
    pieces?: readonly PieceIntegree[];
    /** L'adresse de NOTRE route de pièce jointe, pour un `cid:` résolu. */
    piece: (pieceId: number) => string;
    /** L'adresse de NOTRE relais, pour la `rang`-ième image du document. `null` = on n'affiche pas l'image. */
    relais: ((rang: number) => string) | null;
    /**
     * 🔴🔴 LOT IMAGES-INTEGREES — L'ADRESSE QUI SERT LES OCTETS D'UNE IMAGE INTÉGRÉE (`data:`).
     *
     * Absente ⇒ comportement d'avant ce lot : l'image `data:` reste telle quelle, octets compris. Présente ⇒ les
     * images dont la charge a été retirée à la lecture (voir `sqlSansChargeImage`) y sont renvoyées. C'est ce qui
     * permet de ne plus faire traverser 2 Mo de base64 à la page pour une photo qu'on n'a peut-être pas regardée.
     */
    integree?: (rang: number) => string;
  },
): string {
  const pieces = o.pieces ?? [];
  let rang = -1;
  return html.replace(/<img\b[^>]*>/gi, (balise) => {
    rang += 1;
    const m = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(balise);
    const src = m === null ? '' : (m[2] ?? m[3] ?? m[4] ?? '').trim();

    const cid = identifiantCid(src);
    if (cid !== null) {
      const piece = pieceDuCid(cid, pieces);
      return piece === null
        ? marque(balise, MENTION_IMAGE_INTROUVABLE)
        : remplacerSrc(balise, o.piece(piece.pieceId));
    }
    if (estDistante(src)) {
      return o.relais === null ? marque(balise, 'image distante non affichée') : remplacerSrc(balise, o.relais(rang));
    }
    /**
     * ══ 🔴🔴 LOT IMAGES-INTEGREES — UNE IMAGE INTÉGRÉE S'AFFICHE, OU SE DIT. JAMAIS DU CODE. ═══════════════════
     *
     * Trois issues, et une seule ligne de conduite — ce qu'on ne peut pas montrer, on l'ÉCRIT :
     *   · format refusé (svg et tout ce qui n'est pas jpeg/png/gif/webp), charge illisible ou trop lourde →
     *     une VIGNETTE qui nomme l'image, dit sa taille et pourquoi elle ne s'affiche pas ;
     *   · charge retirée à la lecture → l'image part vers le relais, qui ira chercher les octets en base ;
     *   · petite image intacte → elle reste telle quelle, comme avant ce lot.
     */
    const data = lireDataImage(src);
    if (data !== null) {
      const refus = refusDeLImage(data);
      if (refus !== null) {
        return vignetteImage({
          nom: `image ${data.type}`,
          taille: tailleLisible(octetsDeLaCharge(data.charge)),
          refus,
          href: refus === 'taille' && o.integree !== undefined ? o.integree(rang) : null,
        });
      }
      if (data.allegee) {
        return o.integree === undefined
          ? marque(balise, MENTION_IMAGE_INTROUVABLE)
          : remplacerSrc(balise, o.integree(rang));
      }
      return balise;
    }
    // Tout le reste est tombé à l'assainissement : `PROTOCOLES_IMAGE` n'en laisse pas passer d'autre.
    return balise;
  });
}

/** Remplace l'attribut `src` d'une balise `<img>`, ou l'ajoute s'il manquait. PUR. */
function remplacerSrc(balise: string, url: string): string {
  const propre = url.replace(/"/g, '&quot;');
  return /\bsrc\s*=/i.test(balise)
    ? balise.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `src="${propre}"`)
    : balise.replace(/^<img\b/i, `<img src="${propre}"`);
}

/**
 * Remplace l'image par une MARQUE lisible : on retire le `src` (donc plus d'appel, plus d'image cassée) et l'on
 * pose le mot en `alt` et en `title`. PUR.
 */
function marque(balise: string, mot: string): string {
  const sans = balise
    .replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    .replace(/\balt\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    .replace(/\btitle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
  return sans.replace(/^<img\b/i, `<img data-absente="1" alt="${mot}" title="${mot}"`);
}
