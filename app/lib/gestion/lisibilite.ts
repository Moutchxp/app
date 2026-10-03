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
  /**
   * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — « LES OCTETS SONT DÉJÀ DANS LE CORPS » ═════════════════════════════
   *
   * `gestion_piece.integree` (migration 296), calculée une fois au dépôt : l'empreinte de cette image figure
   * parmi celles des images `data:` du corps. C'est le critère EXACT d'Arno — « référencée par un cid: du
   * HTML » —, lu à travers ce que mailparser a déjà fait pour nous (voir `imageDansLeCorps.ts`).
   *
   * ⚠️ ABSENTE OU `null` ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LETTRE. Sans la migration 296, sans la passe de
   * rattrapage, ou sur une pièce sans empreinte, on retombe sur la règle de nom/taille ci-dessous. Ne pas savoir
   * n'est pas une raison de retirer une pièce d'un compteur.
   */
  integree?: boolean | null;
}

/** Au-delà, une image n'est plus un logo de signature : c'est une photo qu'on a voulu envoyer. */
export const TAILLE_MAX_SIGNATURE = 10 * 1024;

/**
 * ══ 🔴 LES TROIS MORCEAUX DE LA RÈGLE, ÉCRITS UNE SEULE FOIS ════════════════════════════════════════════════════
 *
 * Ils servent DEUX FOIS : à `estImageDeSignature` juste en dessous (en TypeScript, sur une pièce qu'on tient), et
 * à `sqlEstVraiePiece` (en SQL, pour filtrer une liste avant de la découper en pages). Les écrire deux fois
 * donnerait deux définitions de « pièce jointe » — et c'est exactement le défaut qu'Arno a signalé : la recherche
 * « Pièce jointe = Avec » comptait les logos de signature, l'écran ne les comptait pas, et la ligne trouvée
 * affichait un trombone GRIS (« les pièces sont ailleurs ») sur un mail censé en porter une.
 *
 * ⚠️ LES MOTIFS SONT DES CHAÎNES, PAS DES `RegExp` LITTÉRALES, et c'est ce qui rend les deux rendus possibles :
 * la même syntaxe se compile en `RegExp` ici et se colle dans un `~*` de PostgreSQL là-bas. On s'en tient donc au
 * sous-ensemble commun (classes, alternatives, ancres, `[\w.-]`) — aucune construction propre à JavaScript.
 */
const EXTENSIONS_IMAGE = '(png|jpe?g|gif|bmp|webp)';
const PREFIXES_DE_SIGNATURE = '(image|oledata|logo|signature|outlook-)';
/** Les noms que produisent Outlook et consorts pour les images intégrées. */
const NOMS_DE_SIGNATURE = new RegExp(`^${PREFIXES_DE_SIGNATURE}[\\w.-]*\\.${EXTENSIONS_IMAGE}$`, 'i');
const EXTENSION_IMAGE_FINALE = new RegExp(`\\.${EXTENSIONS_IMAGE}$`, 'i');

/**
 * ══ 🔴🔴 LA MÊME RÈGLE, EN SQL : « cette pièce est-elle une VRAIE pièce ? » ═══════════════════════════════════
 *
 * Rendue depuis les MÊMES motifs et la MÊME constante de taille que `estImageDeSignature`. Ce n'est pas une
 * seconde écriture « équivalente » : c'est le même texte, rendu dans l'autre langue. Changer un préfixe de
 * signature change les deux du même geste.
 *
 * 🔴 À QUOI ÇA SERT, ET POURQUOI ÇA NE POUVAIT PAS SE FAIRE EN TypeScript. La recherche pagine : elle lit
 * vingt-cinq lignes et s'arrête. Filtrer les fausses pièces APRÈS la lecture rendrait des pages de dix-neuf
 * lignes, et un total qui ne correspondrait à rien. La condition doit donc entrer dans le `WHERE`.
 *
 * ⚠️ LES JUMEAUX macOS (« ._bail.pdf ») SONT ÉCARTÉS ICI AUSSI — c'est une règle DIFFÉRENTE (ce ne sont pas des
 * pièces mal rangées, ce sont des doubles techniques), déjà écrite en SQL dans `piecesVraiesDesFils`. Les deux
 * conditions se posent ensemble, parce que « vraie pièce » veut dire les deux.
 *
 * ⚠️ `~*` (insensible à la casse) ET NON `~` : les mêmes noms arrivent en « IMAGE001.PNG » aussi souvent qu'en
 * minuscules, et le motif JavaScript porte déjà le drapeau `i`.
 */
export function sqlEstVraiePiece(alias = 'p', avecIntegree = false): string {
  const estImage = `(lower(coalesce(${alias}.type_mime, '')) LIKE 'image/%'`
    + ` OR ${alias}.nom_fichier ~* '\\.${EXTENSIONS_IMAGE}$')`;
  const nomDeSignature = `${alias}.nom_fichier ~* '^${PREFIXES_DE_SIGNATURE}[\\w.-]*\\.${EXTENSIONS_IMAGE}$'`;
  const tropPetite = `(${alias}.taille_octets IS NOT NULL AND ${alias}.taille_octets > 0`
    + ` AND ${alias}.taille_octets < ${TAILLE_MAX_SIGNATURE})`;
  /**
   * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LA MÊME UNION QU'EN TypeScript, DANS LE MÊME ORDRE.
   *
   * ⚠️ `avecIntegree` EST UN DRAPEAU, PAS UNE SONDE : cette fonction est PURE (elle rend du texte), et une sonde
   * la rendrait asynchrone pour tous ses appelants. C'est l'appelant qui interroge le schéma et le dit ici —
   * exactement le patron de `sqlNomAffiche`.
   */
  const integree = avecIntegree ? `coalesce(${alias}.integree, false) OR ` : '';
  // Une pièce est VRAIE quand elle n'est pas un jumeau macOS, et qu'elle n'est pas une image de signature.
  return `${alias}.nom_fichier NOT LIKE '._%'`
    + ` AND NOT (${estImage} AND (${integree}${nomDeSignature} OR ${tropPetite}))`;
}

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
  const estImage = type.startsWith('image/') || EXTENSION_IMAGE_FINALE.test(nom);
  if (!estImage) return false;
  /**
   * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LE CRITÈRE EXACT PASSE EN PREMIER ═══════════════════════════════════
   *
   * « Ses octets sont déjà posés dans le corps » ne se devine pas : cela se vérifie, empreinte contre empreinte.
   * Quand on le sait, on n'a plus besoin de juger sur un nom ni sur une taille.
   *
   * 🔴 LES DEUX RÈGLES SE RÉUNISSENT, ELLES NE SE REMPLACENT PAS, et c'est un choix. Le recensement du
   * 03/10/2026 dit pourquoi : la règle exacte seule ÉCARTERAIT 2 345 images de plus (des pictos de 150 ko qu'on
   * comptait à tort), mais REMETTRAIT 871 au compte — des `wink.png` de 3 ko dont le corps ne porte pas les
   * octets, parce que le mail les désigne par une adresse distante. Les remettre serait une régression qu'Arno
   * n'a pas demandée. L'union n'écarte donc jamais moins qu'avant ce lot : aucune pièce ne RÉAPPARAÎT.
   */
  if (p.integree === true) return true;
  if (NOMS_DE_SIGNATURE.test(nom)) return true;
  return p.tailleOctets !== null && p.tailleOctets > 0 && p.tailleOctets < TAILLE_MAX_SIGNATURE;
}

/**
 * ══ 🔴🔴 LOT LECTURE-HTML-FIL-TROMBONE — CE QUE DIT LE TROMBONE D'UNE LIGNE DE LISTE. PUR. ════════════════════
 *
 * TROIS ÉTATS, DEMANDÉS PAR ARNO, et chacun répond à une question différente en parcourant la liste :
 *   · `ici`     — CE message-là porte une pièce. Le trombone est NOIR (blanc en thème Sombre) : on ouvre et on la
 *                 trouve. C'est le seul cas où l'on promet quelque chose.
 *   · `ailleurs`— la conversation en porte, mais pas le message affiché. Le trombone est GRIS : il invite à
 *                 chercher, il ne promet rien. C'est le défaut réparé — jusqu'ici le trombone comptait TOUT
 *                 l'échange, et l'on ouvrait un mail vide en croyant y trouver un bail.
 *   · `aucune`  — rien nulle part : pas de trombone du tout.
 *
 * ⚠️ LE NOMBRE AFFICHÉ EST CELUI DE L'ÉTAT. « 📎 2 » sur un trombone noir veut dire « deux pièces DANS CE
 * MESSAGE » ; sur un gris, « deux pièces AILLEURS ». Afficher le total dans les deux cas ferait lire « 2 » sur
 * une ligne dont le mail n'en porte qu'une.
 */
export type EtatTrombone =
  | { ou: 'ici'; nombre: number }
  | { ou: 'ailleurs'; nombre: number }
  | { ou: 'aucune' };

export function etatTrombone(piecesDuMessage: number, piecesAilleurs: number): EtatTrombone {
  if (piecesDuMessage > 0) return { ou: 'ici', nombre: piecesDuMessage };
  if (piecesAilleurs > 0) return { ou: 'ailleurs', nombre: piecesAilleurs };
  return { ou: 'aucune' };
}

/** L'infobulle du trombone, dans les mots d'Arno. PUR. */
export function motTrombone(e: EtatTrombone): string | null {
  if (e.ou === 'aucune') return null;
  const s = e.nombre > 1 ? 's' : '';
  return e.ou === 'ici'
    ? `Pièce${s} jointe${s} dans ce message`
    : `Pièce${s} jointe${s} ailleurs dans la conversation`;
}

/** Range les pièces d'un message en deux tas, dans leur ordre d'origine. PUR. */
export function trierPieces<T extends PieceATrier>(pieces: readonly T[]): { vraies: T[]; signatures: T[] } {
  const vraies: T[] = [];
  const signatures: T[] = [];
  for (const p of pieces) (estImageDeSignature(p) ? signatures : vraies).push(p);
  return { vraies, signatures };
}
