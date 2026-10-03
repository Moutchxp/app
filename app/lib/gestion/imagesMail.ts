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
/**
 * 🔴🔴 LOT SIGNATURE-ECHELLE — la taille d'une image citée. Voir l'encadré de `tailleImageMail.ts` : le défaut
 * n'est pas chez nous (Gmail réécrit `width="20"` en `width:240px`), mais la correction l'est, parce que nous
 * avons la taille d'origine dans notre propre message.
 */
import { appliquerTaille, consigneDeTaille, type Dimensions } from './tailleImageMail';

/** Ce qu'on sait d'une pièce pour résoudre un `cid:`. */
export interface PieceIntegree {
  pieceId: number;
  nomFichier: string;
  /**
   * 🔴 LOT ETOILE-SIGNATURES-PIECES — LE TYPE, quand on le connaît. Il ne sert qu'au DERNIER recours de la
   * résolution (voir `resoudreCids`) : choisir, parmi les pièces de la conversation, celles qui sont des IMAGES.
   * Absent ⇒ on se rabat sur l'extension du nom, comme partout ailleurs dans ce module.
   */
  typeMime?: string | null;
  /**
   * 🔴 LOT SIGNATURE-ECHELLE — LE POIDS, pour reconnaître une image de signature quand rien ne dit sa taille.
   * Absent ⇒ la règle de repli d'icône ne s'applique pas, et l'image reste telle quelle.
   */
  tailleOctets?: number | null;
  /**
   * ══ 🔴🔴 LOT SIGNATURE-ECHELLE — LA TAILLE QUE SON AUTEUR LUI A DONNÉE ═══════════════════════════════════════
   *
   * Les dimensions de la balise `<img>` du message qui PORTE réellement cette image — notre propre envoi, pour
   * un `cid:` que seule la conversation sait résoudre.
   *
   * 🔴 ELLE EXISTE PARCE QUE GMAIL RÉÉCRIT. Mesuré sur le fil 36671 : notre envoi (57464) publie ses icônes en
   * `width="20" height="20"` ; la réponse d'Arno (57465), écrite depuis Gmail, cite les mêmes images en
   * `style="width:240px"` — douze fois trop grand. Les dimensions de l'auteur font foi devant celles d'un
   * client citant, et c'est ce champ qui les transporte.
   *
   * ⚠️ ABSENT ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LETTRE : on ne touche à aucune taille.
   */
  dimensions?: Dimensions | null;
}

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
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — RÉSOUDRE LES `cid:` D'UN DOCUMENT, EN TROIS TEMPS ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : dans un mail qui lui revient, la signature « Service Gestion » affiche
 * « image intégrée non retrouvée » à la place des trois pictos.
 *
 * ═══ 🔴 LA CAUSE, LUE CHEZ GOOGLE ET NON SUPPOSÉE ══════════════════════════════════════════════════════════════
 *
 * Le message revenu (Gmail 1a1011cca965f9fd) est un `multipart/alternative` de DEUX parties : `text/plain` et
 * `text/html`. **Il ne porte aucune image.** Son HTML cite pourtant trois `cid:1d0ecfbd47378a46_0.0.{1,2,3}` —
 * des identifiants que GMAIL a réécrits, et qui ne désignent que des parties de l'original, resté chez lui.
 *
 * Notre envoi d'origine (1a100d7a8d14e269), lui, les porte bel et bien : trois `image/png` `Content-Disposition:
 * inline`, `Content-ID: <sig0…@criterimmo.fr>`, `<sig1…>`, `<sig2…>`.
 *
 * 🔴 LA RÉSOLUTION PAR LE NOM NE POUVAIT DONC PAS MARCHER, et aucune ruse sur l'identifiant ne la sauvera : il n'y
 * a rien à retrouver DANS ce message, et le `cid` de Gmail n'a aucun rapport avec le nôtre.
 *
 * ═══ 🔴🔴 LES TROIS TEMPS, DU PLUS SÛR AU PLUS FAIBLE ═══════════════════════════════════════════════════════════
 *
 *   ① LE NOM, DANS CE MESSAGE — `pieceDuCid`. Exact quand le `cid` porte le nom du fichier
 *      (« image003.png@01DC579B »), ce que font Outlook et consorts. Inchangé.
 *   ② LE NOM, DANS LA CONVERSATION — la même règle, élargie aux autres messages de l'échange. C'est la demande
 *      d'Arno : « puis, à défaut, vers les autres messages de la même conversation (notre envoi d'origine) ».
 *   ③ LE RANG, DANS LA CONVERSATION — et UNIQUEMENT sous une condition stricte.
 *
 * 🔴🔴 LA CONDITION DU TEMPS ③, ET POURQUOI ELLE EST SI DURE. Le rang est un rapprochement par POSITION : la
 * première image non résolue du corps cité est la première image de la conversation, la deuxième la deuxième.
 * C'est vrai quand le corps cité EST une copie de notre envoi — le cas d'Arno — et faux dès qu'il en manque une.
 * On n'y recourt donc QUE si les deux comptes tombent juste : autant d'images non résolues que d'images
 * candidates. Un seul écart, et l'on s'abstient entièrement.
 *
 * ⚠️ POSER LA MAUVAISE IMAGE SERAIT PIRE QUE N'EN POSER AUCUNE. Une signature sans picto se remarque à peine ;
 * le logo d'un correspondant posé dans la signature d'un autre est un faux, et il se propagerait au transfert
 * suivant. C'est tout le sens de la condition : en cas de doute, l'emplacement reste vide.
 *
 * 🔒 LES CANDIDATES VIENNENT DE LA CONVERSATION, et de rien d'autre. Jamais d'un autre échange, jamais d'une
 * bibliothèque d'images : on ne peut donc pas faire apparaître dans un mail une image qu'il n'a jamais côtoyée.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const EXTENSION_IMAGE = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;

/** Cette pièce est-elle une image ? Par son type quand on le connaît, par son nom sinon. PUR. */
export function pieceEstImage(p: PieceIntegree): boolean {
  const t = (p.typeMime ?? '').trim().toLowerCase();
  if (t !== '') return t.startsWith('image/');
  return EXTENSION_IMAGE.test((p.nomFichier ?? '').trim());
}

/**
 * LA TABLE `cid` → pièce, pour TOUT le document. PUR.
 *
 * ⚠️ LA CLÉ EST LE `cid` EN MINUSCULES : un même identifiant écrit deux fois avec des casses différentes doit
 * désigner la même pièce, sans quoi la seconde occurrence retomberait au temps ③ et consommerait une candidate.
 */
export function resoudreCids(
  html: string,
  pieces: readonly PieceIntegree[],
  conversation: readonly PieceIntegree[] = [],
): Map<string, number> {
  const table = new Map<string, number>();
  /* Les `cid` du document, dans l'ordre, sans doublon : c'est l'ordre qui fera foi au temps ③. */
  const cids: string[] = [];
  for (const src of adressesDesImages(html)) {
    const cid = identifiantCid(src);
    if (cid === null) continue;
    const cle = cid.trim().toLowerCase();
    if (cle !== '' && !cids.includes(cle)) cids.push(cle);
  }
  if (cids.length === 0) return table;

  const pris = new Set<number>();
  const restants: string[] = [];
  for (const cid of cids) {
    //  ① puis ② : la MÊME règle de nom, d'abord ici, ensuite dans l'échange.
    const trouve = pieceDuCid(cid, pieces) ?? pieceDuCid(cid, conversation);
    if (trouve === null) { restants.push(cid); continue; }
    table.set(cid, trouve.pieceId);
    pris.add(trouve.pieceId);
  }
  if (restants.length === 0) return table;

  /* ③ LE RANG — et seulement si les comptes tombent juste. Voir l'encadré : au moindre écart, on s'abstient. */
  const candidates = conversation.filter((p) => pieceEstImage(p) && !pris.has(p.pieceId));
  if (candidates.length !== restants.length) return table;
  restants.forEach((cid, i) => table.set(cid, candidates[i].pieceId));
  return table;
}

/**
 * L'IMAGE QU'ON MET À LA PLACE D'UNE IMAGE INTÉGRÉE INTROUVABLE.
 *
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LE MOT PASSE DANS L'INFOBULLE, PLUS DANS LA PAGE ════════════════════════
 *
 * ARNO (03/10/2026) : « si vraiment introuvable : rien d'affiché ou un petit emplacement neutre, pas le texte
 * “image intégrée non retrouvée” en gras au milieu de la signature. »
 *
 * 🔴 CE QUI CHANGE, ET CE QUI NE CHANGE PAS. Le mot reste — il est dans le `title`, donc au survol, et la marque
 * `data-absente` le dit toujours au code. Ce qui disparaît, c'est le TEXTE DANS LA PAGE : un `alt` vide laisse un
 * petit rectangle neutre, et la signature redevient lisible. On n'a pas cessé de le dire ; on a cessé de le crier.
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
    /**
     * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LES PIÈCES DES AUTRES MESSAGES DE L'ÉCHANGE.
     *
     * Elles servent au second et au troisième temps de `resoudreCids` : un mail qui nous revient cite les images
     * de NOTRE envoi sans les porter, et c'est là qu'elles sont. Absente ⇒ comportement d'avant ce lot, à la
     * lettre : on ne cherche que dans le message.
     */
    conversation?: readonly PieceIntegree[];
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
  /* 🔴 LA TABLE EST CALCULÉE UNE FOIS, AVANT LE PARCOURS : le troisième temps (le rang) a besoin de connaître
     TOUTES les images non résolues du document pour décider s'il s'applique. Résoudre balise par balise ne
     pourrait jamais le savoir. */
  const table = resoudreCids(html, pieces, o.conversation ?? []);
  /**
   * 🔴🔴 LOT SIGNATURE-ECHELLE — DE QUOI JUGER DE LA TAILLE D'UNE IMAGE RÉSOLUE. Les deux listes réunies : la
   * taille d'origine d'une image citée vit dans la CONVERSATION (c'est le message qui la porte vraiment), et
   * celle d'une image du message lui-même dans `pieces`.
   */
  const parPiece = new Map<number, PieceIntegree>();
  for (const p of [...pieces, ...(o.conversation ?? [])]) if (!parPiece.has(p.pieceId)) parPiece.set(p.pieceId, p);
  let rang = -1;
  return html.replace(/<img\b[^>]*>/gi, (balise) => {
    rang += 1;
    const m = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(balise);
    const src = m === null ? '' : (m[2] ?? m[3] ?? m[4] ?? '').trim();

    const cid = identifiantCid(src);
    if (cid !== null) {
      const pieceId = table.get(cid.trim().toLowerCase());
      if (pieceId === undefined) return marqueNeutre(balise, MENTION_IMAGE_INTROUVABLE);
      /**
       * 🔴🔴 LOT SIGNATURE-ECHELLE — ON REMET LA TAILLE AVANT DE REMPLACER L'ADRESSE. L'ordre est indifférent au
       * résultat, mais pas à la lecture : `appliquerTaille` juge sur la balise telle qu'elle est ARRIVÉE, avec
       * le `width:240px` que Gmail y a mis — c'est précisément ce qu'elle doit voir pour le corriger.
       *
       * ⚠️ ET ELLE NE FAIT RIEN DANS LA QUASI-TOTALITÉ DES CAS : sans dimensions d'origine connues et hors image
       * de signature, `consigneDeTaille` rend `null` et la balise ressort telle quelle.
       */
      const p = parPiece.get(pieceId) ?? null;
      const dimensionnee = appliquerTaille(balise, consigneDeTaille({
        balise, origine: p?.dimensions ?? null, piece: p,
      }));
      return remplacerSrc(dimensionnee, o.piece(pieceId));
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

/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LA MARQUE QUI NE SE LIT PAS DANS LA PAGE ════════════════════════════════
 *
 * La même marque que `marque`, à une chose près : l'`alt` est VIDE. Le navigateur ne peint donc aucun texte à
 * l'emplacement de l'image — il reste un petit rectangle neutre —, tandis que le `title` garde le mot pour qui
 * survole, et `data-absente` le garde pour le code (la visionneuse ne s'ouvre pas sur une image absente).
 *
 * 🔴 POURQUOI PAS RIEN DU TOUT. Arno laisse les deux (« rien d'affiché ou un petit emplacement neutre »). On
 * garde l'emplacement parce qu'une signature a une mise en page : retirer la balise ferait sauter la ligne et
 * donnerait l'impression d'un mail abîmé, ce qui est l'inverse du but.
 */
function marqueNeutre(balise: string, mot: string): string {
  const sans = balise
    .replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    .replace(/\balt\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    .replace(/\btitle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
  return sans.replace(/^<img\b/i, `<img data-absente="1" alt="" title="${mot}"`);
}
