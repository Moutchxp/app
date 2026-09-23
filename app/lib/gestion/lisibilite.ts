/**
 * MODULE « GESTION » — LOT 4d-C : RENDRE UN MAIL LISIBLE À L'ÉCRAN. Fonctions PURES.
 *
 * 🔴 RIEN N'EST TOUCHÉ EN BASE. Tout ce qui suit est de l'AFFICHAGE : le corps capturé reste intact, les pièces
 * restent toutes enregistrées. Un mail illisible à l'écran reste un mail complet dans la base — c'est la règle du
 * module (on ne supprime jamais) appliquée à la présentation.
 *
 * Trois gênes, mesurées à l'usage par Arno sur la vraie boîte :
 *   ① les références techniques d'images ([cid:…], [https://…googleusercontent.com/…]) polluent chaque signature ;
 *   ② le TEXTE CITÉ répète tout l'historique sous chaque réponse — on relit six fois la même chose ;
 *   ③ les images de signature (image001.png, logos) se mêlent aux vraies pièces jointes et les noient.
 */

/** Ce qu'on affiche d'un corps de mail : la partie neuve, et l'historique qu'on replie derrière un bouton. */
export interface CorpsLisible {
  /** Ce que la personne a VRAIMENT écrit cette fois-ci. */
  visible: string;
  /** L'historique cité, ou `null` s'il n'y en a pas. Jamais supprimé : replié. */
  cite: string | null;
}

/** Références techniques d'images, telles qu'elles apparaissent dans le texte brut d'un mail. */
const REFS_IMAGES: RegExp[] = [
  /\[cid:[^\]]*\]/gi,                                    // [cid:image001.png@01DA…]
  /\[image:[^\]]*\]/gi,                                  // [image: logo.png]
  /\[https?:\/\/[^\]]*\]/gi,                             // [https://…googleusercontent.com/…]
  /<https?:\/\/[^>\s]*(?:googleusercontent|gstatic)[^>\s]*>/gi,
];

/**
 * ① Retire les RÉFÉRENCES d'images, pas les liens utiles. Un lien entre crochets dans un mail est presque toujours
 * une image inline recrachée par le convertisseur texte ; un lien qu'on veut lire, lui, est écrit en clair.
 * Les crochets vidés ne laissent pas de trous : les espaces qui se retrouvent doublés sont resserrés.
 */
export function masquerReferencesImages(texte: string, marqueur = ''): string {
  let out = texte;
  for (const motif of REFS_IMAGES) out = out.replace(motif, marqueur);
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '');
}

/**
 * Les marques d'un HISTORIQUE CITÉ. Volontairement peu nombreuses et très sûres : mieux vaut laisser passer une
 * citation que replier par erreur ce que quelqu'un vient d'écrire.
 */
const DEBUTS_DE_CITATION: RegExp[] = [
  /^\s*>/,                                                        // la citation classique
  /^\s*Le\s.+\s+a\s+écrit\s*:\s*$/i,                              // « Le 21 septembre 2026, Mme M. a écrit : »
  /^\s*On\s.+\s+wrote\s*:\s*$/i,
  /^\s*-{2,}\s*(Message d'origine|Original Message|Message transféré|Forwarded message)\s*-{2,}/i,
  /^\s*_{5,}\s*$/,                                                // la barre d'Outlook
  /^\s*De\s*:\s*\S/i,                                             // l'en-tête recopié par Outlook
  /^\s*From\s*:\s*\S/i,
];

/** Bornes de sûreté : au-delà, on n'analyse plus, on affiche. */
const MAX_LIGNES = 400;

/**
 * ② Sépare ce qui vient d'être écrit de l'HISTORIQUE CITÉ, qui sera replié à l'écran.
 *
 * La coupure se fait à la PREMIÈRE marque de citation, et tout ce qui suit part avec elle — c'est le comportement
 * d'un client de messagerie, et c'est ce qui évite de relire cinq fois le même échange en descendant une carte.
 *
 * DEUX PRUDENCES : on ne coupe jamais si la partie visible deviendrait vide (un mail qui n'est QU'une citation se
 * lit tel quel, sinon l'écran n'afficherait rien), et rien n'est jamais perdu — le cité est rendu, pas jeté.
 */
export function separerCitation(texte: string | null | undefined): CorpsLisible {
  const brut = (texte ?? '').replace(/\r\n/g, '\n');
  if (brut.trim() === '') return { visible: '', cite: null };

  const lignes = brut.split('\n');
  if (lignes.length > MAX_LIGNES) return { visible: brut.trim(), cite: null };

  const coupure = lignes.findIndex((l) => DEBUTS_DE_CITATION.some((m) => m.test(l)));
  if (coupure === -1) return { visible: brut.trim(), cite: null };

  const visible = lignes.slice(0, coupure).join('\n').trim();
  const cite = lignes.slice(coupure).join('\n').trim();
  // Un mail qui n'est QUE de la citation : on l'affiche en entier plutôt que de rendre un écran vide.
  if (visible === '') return { visible: brut.trim(), cite: null };
  return { visible, cite: cite === '' ? null : cite };
}

/** Le corps prêt à être affiché : références d'images masquées, puis citation mise de côté. */
export function corpsLisible(texte: string | null | undefined, marqueurImage = ''): CorpsLisible {
  const { visible, cite } = separerCitation(masquerReferencesImages(texte ?? '', marqueurImage));
  return { visible, cite };
}

/** Ce qu'il faut savoir d'une pièce pour décider si c'est une vraie pièce ou un bout de signature. */
export interface PieceATrier {
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
}

/** Au-delà, une image n'est plus un logo de signature : c'est une photo qu'on a voulu envoyer. */
export const TAILLE_MAX_SIGNATURE = 10 * 1024;
/** Les noms que produisent Outlook et consorts pour les images intégrées. */
const NOMS_DE_SIGNATURE = /^(image|oledata|logo|signature|outlook-)[\w.-]*\.(png|jpe?g|gif|bmp|webp)$/i;

/**
 * ③ Une image INTÉGRÉE À LA SIGNATURE, par opposition à une vraie pièce jointe.
 *
 * Deux indices, et il faut être une IMAGE dans les deux cas : le nom fabriqué (image001.png, logo.gif…), ou une
 * taille si petite qu'aucune photo utile n'y tiendrait. Un PDF, un document, une photo de 300 ko restent des pièces,
 * quel que soit leur nom.
 *
 * ⚠️ TRIER N'EST PAS SUPPRIMER : ces images restent enregistrées, servies et consultables — simplement rangées à
 * part et repliées, pour que « 2 pièces jointes » ne veuille pas dire « deux logos ».
 */
export function estImageDeSignature(p: PieceATrier): boolean {
  const type = (p.typeMime ?? '').toLowerCase();
  const nom = (p.nomFichier ?? '').trim();
  const estImage = type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/i.test(nom);
  if (!estImage) return false;
  if (NOMS_DE_SIGNATURE.test(nom)) return true;
  return p.tailleOctets !== null && p.tailleOctets > 0 && p.tailleOctets < TAILLE_MAX_SIGNATURE;
}

/** Range les pièces d'un message en deux tas, dans leur ordre d'origine. PUR. */
export function trierPieces<T extends PieceATrier>(pieces: readonly T[]): { vraies: T[]; signatures: T[] } {
  const vraies: T[] = [];
  const signatures: T[] = [];
  for (const p of pieces) (estImageDeSignature(p) ? signatures : vraies).push(p);
  return { vraies, signatures };
}
