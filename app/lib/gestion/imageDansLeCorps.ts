/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — UNE IMAGE DONT LES OCTETS SONT DÉJÀ DANS LE CORPS ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « les images intégrées au corps du mail ne sont PAS des pièces jointes. Critère :
 * Content-Disposition inline ET référencée par un cid: du HTML, ou image de signature connue. Une vraie pièce
 * jointe (attachment, ou image non référencée dans le corps) reste comptée, même si c'est une photo. »
 *
 * ═══ 🔴 CE QU'ON NE PEUT PAS LIRE, ET CE QU'ON PEUT ═════════════════════════════════════════════════════════════
 *
 * `Content-Disposition` et `Content-ID` ne sont rangés nulle part : le seul fichier du dépôt qui analyse les
 * parties d'un mail est `app/lib/email/imap.ts`, hors du périmètre de ce lot. Impossible, donc, de lire la
 * disposition telle quelle.
 *
 * 🔴 MAIS LE CRITÈRE EST QUAND MÊME À PORTÉE, ET SANS RIEN SUPPOSER. mailparser, qui fait cette analyse,
 * REMPLACE les parties `related` par leurs octets dans le HTML qu'il rend : une image inline référencée par un
 * `cid:` arrive chez nous sous la forme `data:image/png;base64,…` DANS le corps, en plus d'être rangée comme
 * pièce. D'où le critère, qui dit exactement la même chose que celui d'Arno :
 *
 *     une image dont les OCTETS SONT DÉJÀ POSÉS DANS LE CORPS est une image intégrée.
 *
 * ÉPROUVÉ SUR LA VRAIE BASE le 03/10/2026, aux deux bouts :
 *   · message 57424 (un correspondant) — `image001.png` 909 o et `image002.gif` 184 414 o : les deux empreintes
 *     sha256 des pièces se retrouvent À L'IDENTIQUE parmi celles des `data:` du corps ; le PDF joint, lui, n'y
 *     est pas ;
 *   · message 57464 (notre propre envoi) — `signature-1/2/3.png` : mêmes trois empreintes, mêmes trois `data:`.
 *
 * ═══ ⚠️ CE QUE CE MODULE NE DÉCIDE PAS ══════════════════════════════════════════════════════════════════════════
 *
 * Il rend des EMPREINTES, pas un verdict d'écran. C'est `lisibilite.estImageDeSignature` qui tranche, en réunissant
 * ce critère-ci et la règle de nom/taille qui existait avant — l'« image de signature connue » d'Arno. Les deux
 * ensemble n'écartent jamais moins qu'avant : aucune pièce ne RÉAPPARAÎT dans un compteur à cause de ce lot.
 *
 * 🔴 MODULE PUR : aucune base, aucun réseau, aucun `node:crypto`. Le hachage est confié à l'appelant (voir
 * `imageDansLeCorpsReel`), parce que `crypto` n'a rien à faire dans le graphe d'un composant client.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ LA CLASSE DE CARACTÈRES ACCEPTE LES BLANCS : un `data:` base64 arrive très souvent replié sur plusieurs
 * lignes (c'est ce que fait Outlook), et s'arrêter au premier retour chariot ne lirait qu'un morceau d'image —
 * donc une empreinte fausse, donc une pièce comptée à tort.
 */
const RE_DATA_IMAGE = /data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)/gi;

/**
 * LES CHARGES base64 DES IMAGES POSÉES DANS LE CORPS, dans l'ordre du document. PUR.
 *
 * ⚠️ LES BLANCS SONT RETIRÉS ICI, UNE FOIS : le décodage est fait par l'appelant, et lui laisser une chaîne
 * repliée l'obligerait à refaire ce nettoyage — donc, un jour, à l'oublier.
 */
export function chargesImagesDuCorps(html: string | null | undefined): string[] {
  const source = html ?? '';
  if (source === '') return [];
  const out: string[] = [];
  RE_DATA_IMAGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DATA_IMAGE.exec(source)) !== null) {
    const charge = m[1].replace(/\s+/g, '');
    if (charge !== '') out.push(charge);
  }
  return out;
}

/**
 * CETTE PIÈCE EST-ELLE POSÉE DANS LE CORPS ? PUR.
 *
 * ⚠️ SANS EMPREINTE, LA RÉPONSE EST « NON » — et c'est la bonne. Ne pas savoir n'est pas une raison de retirer une
 * pièce d'un compteur : on la garde, quitte à en compter une de trop. 39 pièces de la base sont dans ce cas.
 */
export function estPoseeDansLeCorps(
  empreinte: string | null | undefined, empreintesDuCorps: ReadonlySet<string>,
): boolean {
  const e = (empreinte ?? '').trim().toLowerCase();
  return e !== '' && empreintesDuCorps.has(e);
}
