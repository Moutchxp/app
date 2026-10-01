/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — LES IMAGES CITÉES PARTENT AVEC LEURS OCTETS ════════════════
 *
 * DÉCISION D'ARNO (02/10/2026) : « Les images citées dans une réponse ou un transfert partent avec leurs octets
 * intégrés (pièce en ligne cid:), jamais un lien vers nos routes internes. »
 *
 * ═══ LA DETTE QUE CE MODULE SOLDE ═══════════════════════════════════════════════════════════════════════════════
 *
 * Au lot IMAGES-INTEGREES, la citation d'une réponse a cessé d'emporter du base64 en clair : elle emporte
 * désormais le corps ASSAINI, donc de vraies balises `<img>`. Mais leurs adresses sont les NÔTRES —
 * `/api/admin/gestion/messages/57381/integree?rang=0`, `…/image?rang=1`, `/api/admin/gestion/pieces/27064` —
 * c'est-à-dire des routes qui exigent une session d'administration. Parties telles quelles, elles donneraient au
 * destinataire un carré barré, et à nous l'illusion d'avoir transmis une photo.
 *
 * 🔴 CE MODULE EST LE JUMEAU DE `signatureImages`, ET C'EST VOULU. Le mécanisme est déjà écrit, éprouvé et
 * employé pour le logo de la signature : reconnaître NOS adresses dans le corps, les remplacer par des `cid:`, et
 * laisser l'assembleur MIME poser les octets en `multipart/related`. On ne réinvente rien ; on étend la même
 * règle aux images du CORPS CITÉ, qui sont le cas fréquent et visible.
 *
 * ⚠️ CE QU'IL NE TOUCHE PAS. Une image `data:` de petite taille porte déjà ses octets et part telle quelle ; une
 * image distante qu'aucune de nos routes ne sert reste une image distante. Ce module ne connaît QUE nos adresses.
 *
 * 🔴 MODULE PUR : aucun import, aucune base, aucun réseau. Les octets lui sont DONNÉS (voir `imagesCiteesReel`).
 */

/** Ce qu'une de nos adresses d'image désigne. */
export type SorteCitee =
  /** `/api/admin/gestion/pieces/<id>` — une pièce jointe du message cité (un `cid:` déjà résolu à l'affichage). */
  | { sorte: 'piece'; pieceId: number }
  /** `/api/admin/gestion/messages/<id>/integree?rang=N` — une image intégrée (`data:`) allégée à la lecture. */
  | { sorte: 'integree'; messageId: number; rang: number }
  /** `/api/admin/gestion/messages/<id>/image?rang=N` — une image DISTANTE, que notre relais va chercher. */
  | { sorte: 'distante'; messageId: number; rang: number };

const RE_PIECE = /^\/api\/admin\/gestion\/pieces\/(\d+)(?:[?#].*)?$/;
const RE_INTEGREE = /^\/api\/admin\/gestion\/messages\/(\d+)\/integree\?rang=(\d+)$/;
const RE_DISTANTE = /^\/api\/admin\/gestion\/messages\/(\d+)\/image\?rang=(\d+)$/;

/**
 * CETTE ADRESSE EST-ELLE L'UNE DES NÔTRES, ET LAQUELLE ? PUR. `null` = ce n'en est pas une, on n'y touche pas.
 *
 * ⚠️ ANCRÉE AUX DEUX BOUTS (`^…$`). Une adresse distante qui CONTIENDRAIT notre chemin
 * (`https://pirate.test/api/admin/gestion/pieces/1`) n'est pas la nôtre : la reconnaître ferait partir les octets
 * d'une pièce de la gestion à la demande d'un expéditeur extérieur.
 */
export function adresseCitee(src: string | null | undefined): SorteCitee | null {
  const s = (src ?? '').trim();
  const p = RE_PIECE.exec(s);
  if (p !== null) return { sorte: 'piece', pieceId: Number(p[1]) };
  const i = RE_INTEGREE.exec(s);
  if (i !== null) return { sorte: 'integree', messageId: Number(i[1]), rang: Number(i[2]) };
  const d = RE_DISTANTE.exec(s);
  if (d !== null) return { sorte: 'distante', messageId: Number(d[1]), rang: Number(d[2]) };
  return null;
}

/** Une image citée, prête à voyager : son indice dans le corps, son `cid`, ses octets. */
export interface ImageCitee {
  /** Le rang de l'image PARMI LES NÔTRES dans le document, et non parmi toutes les images. */
  indice: number;
  cid: string;
  nom: string;
  typeMime: string;
  octets: Buffer;
}

/**
 * LES ADRESSES DES IMAGES CITÉES, DANS L'ORDRE DU DOCUMENT, avec leur indice. PUR.
 *
 * ⚠️ `adresses` ARRIVE DE `adressesDesImages` (module `imagesMail`), et c'est délibéré : il n'existe qu'UNE
 * lecture des `<img>` d'un document dans ce dépôt. En écrire une seconde ici ferait, un jour, deux ordres
 * différents — et l'on poserait les octets d'une photo sur la balise d'une autre.
 */
export function citeesParmi(adresses: readonly string[]): { indice: number; src: string; quoi: SorteCitee }[] {
  const out: { indice: number; src: string; quoi: SorteCitee }[] = [];
  for (const src of adresses) {
    const quoi = adresseCitee(src);
    if (quoi === null) continue;
    out.push({ indice: out.length, src, quoi });
  }
  return out;
}

/**
 * ══ 🔴 LE CORPS TEL QU'IL PART : nos adresses deviennent des `cid:` ═══════════════════════════════════════════
 *
 * 🔴 CE QU'ON N'A PAS PU RAPPORTER, ON LE RETIRE. Même règle que la signature, et pour la même raison : une image
 * absente se remarque à peine, un carré barré se remarque chez tous les destinataires et fait douter du reste du
 * message. L'appelant journalise ce qui manque — Arno a demandé à le savoir.
 *
 * ⚠️ L'INDICE EST CELUI DES NÔTRES, pas celui de toutes les images : une signature distante au milieu du corps ne
 * décale rien. Les deux comptages sont faits par la même fonction (`citeesParmi`), ici et à la lecture des octets.
 */
export function corpsCitePourEnvoi(
  html: string, images: readonly ImageCitee[],
): { html: string; manquantes: number[] } {
  const parIndice = new Map(images.map((i) => [i.indice, i]));
  const manquantes: number[] = [];
  let indice = -1;
  const sortie = html.replace(/<img\b[^>]*>/gi, (balise) => {
    const m = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(balise);
    const src = m === null ? '' : (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (adresseCitee(src) === null) return balise;          // pas une des nôtres : on n'y touche pas
    indice += 1;
    const img = parIndice.get(indice);
    if (img === undefined) { manquantes.push(indice); return ''; }
    return balise.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `src="cid:${img.cid}"`);
  });
  return { html: sortie, manquantes };
}

/**
 * L'identifiant d'une image citée. UNIQUE AU MONDE (RFC 2392) : le domaine d'envoi le garantit, l'aléa évite
 * qu'un client confonde deux messages d'une même conversation. PUR.
 *
 * ⚠️ UN PRÉFIXE DIFFÉRENT DE CELUI DE LA SIGNATURE (`sig…`) : les deux listes partent ensemble dans le même
 * `multipart/related`, et deux `cid` identiques y feraient afficher la même image aux deux endroits.
 */
export function cidCite(indice: number, domaine: string, alea: string): string {
  const propre = alea.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'x';
  return `cit${indice}.${propre}@${domaine}`;
}

/** Un nom de fichier lisible pour la partie MIME. PUR. */
export function nomCite(indice: number, typeMime: string): string {
  const ext = (typeMime.split('/')[1] ?? 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  return `image-${indice + 1}.${ext}`;
}
