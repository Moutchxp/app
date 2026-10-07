/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « DUPLIQUER EN VIGNETTE ». Module PUR ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « Nouvelle entrée du menu clic droit sur une ligne de fichier : crée dans la
 * colonne de gauche une vignette “pièce à ranger”, identique à celle d'une pièce jointe qui vient d'arriver
 * (miniature, nom, taille, œil, crayon ✎, case). Le fichier d'origine et ses rangements existants ne changent
 * JAMAIS. Ranger cette vignette = COPIER le fichier dans le dossier choisi, autant de fois que voulu. »
 *
 * ═══ 🔴 POURQUOI UN TYPE À PART, ET NON UN `PieceARanger` DE PLUS ═══════════════════════════════════════════════
 *
 * Une pièce jointe est identifiée par un `pieceId` — une ligne de NOTRE base, dont on connaît les octets, le nom
 * d'usage, l'historique de dépôt. Une vignette dupliquée est identifiée par un `driveFileId` — un fichier du
 * Drive, dont nous ne possédons rien. Les confondre aurait deux conséquences, et aucune n'est rattrapable :
 *
 *   ① LE RANGEMENT N'EST PAS LE MÊME GESTE. Une pièce se dépose (`/pieces/{id}/drive`, on envoie des octets) ;
 *      une vignette dupliquée se COPIE d'un dossier à l'autre (`files.copy`, aucun octet ne repasse par nous).
 *      Un identifiant commun aurait fait prendre l'un pour l'autre au premier refactor.
 *   ② 🔴🔴 LA SIGNATURE DE SESSION NE DOIT PAS BOUGER. Arno : « la vignette dupliquée reste dans la session en
 *      cours. Elle ne change pas la signature de session (l'arbre ne se referme pas). » `signatureSession` est
 *      calculée sur les `pieces` du message ; tant que les vignettes vivent ailleurs, elle ne peut pas bouger —
 *      c'est une garantie de construction, pas une précaution d'écriture.
 *
 * ═══ 🔴 CE QUE LA VIGNETTE NE FAIT PAS, ET C'EST ESSENTIEL ══════════════════════════════════════════════════════
 *
 * Elle ne touche JAMAIS au fichier d'origine. Dupliquer n'écrit rien : c'est un geste d'ÉCRAN, qui pose une
 * vignette dans une colonne. L'écriture n'arrive qu'au rangement, et c'est une COPIE — le fichier source reste où
 * il est, avec ses rangements existants, et la copie naît ailleurs.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une vignette posée dans la colonne de gauche à partir d'un fichier du Drive. */
export interface VignetteDupliquee {
  /** La clé d'écran : stable, lisible, et distincte d'un `pieceId` au premier coup d'œil. */
  cle: string;
  /** Le fichier SOURCE dans le Drive. C'est lui qu'on copiera, et lui qu'on ne touchera jamais. */
  driveFileId: string;
  nom: string;
  tailleOctets: number | null;
  typeMime: string | null;
  /** L'adresse Drive du fichier source, quand on la connaît : elle sert au lien « ouvrir », à rien d'autre. */
  lien?: string | null;
  /**
   * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — L'EMPREINTE DE CONTENU DU DOCUMENT SOURCE.
   *
   * Elle sert à UNE chose : reconnaître qu'un AUTRE fichier de l'arbre est le même document, pour ne pas en
   * poser une seconde vignette (demande d'Arno : « même source OU même empreinte »).
   *
   * ⚠️ `null` EST NORMAL : un document Google natif n'a pas d'empreinte. On ne reconnaît alors que par la source,
   * et c'est la bonne réponse — on ne devine pas.
   */
  md5?: string | null;
}

/**
 * LA CLÉ D'UNE VIGNETTE. PUR.
 *
 * ⚠️ LE PRÉFIXE N'EST PAS DÉCORATIF : il garantit qu'une clé de vignette ne pourra jamais être confondue avec un
 * identifiant Drive nu dans un `Set` d'écran — et il se lit dans le DOM quand on inspecte une ligne.
 */
export function cleVignette(driveFileId: string): string {
  return `dup:${driveFileId.trim()}`;
}

/**
 * ══ 🔴 AJOUTER UNE VIGNETTE — IDEMPOTENT PAR FICHIER SOURCE. PUR. ═══════════════════════════════════════════════
 *
 * Dupliquer deux fois le même fichier ne pose PAS deux vignettes, et c'est voulu : une seule vignette se range
 * « autant de fois que voulu » (Arno), donc une seconde n'apporterait rien et doublerait la case à cocher, le
 * compteur et le fantôme du glisser. On remonte en revanche la vignette existante en TÊTE, pour que le geste ait
 * un effet visible — sans quoi un second clic paraîtrait n'avoir rien fait.
 *
 * ⚠️ UN IDENTIFIANT VIDE N'ENTRE PAS : il ne désigne aucun fichier, et sa vignette ne saurait rien copier.
 */
export function ajouterVignette(
  liste: readonly VignetteDupliquee[], v: VignetteDupliquee,
): VignetteDupliquee[] {
  if (v.driveFileId.trim() === '') return [...liste];
  const sans = liste.filter((x) => x.driveFileId !== v.driveFileId);
  return [{ ...v, cle: cleVignette(v.driveFileId) }, ...sans];
}

/** RETIRER une vignette de la colonne. PUR. Le fichier du Drive, lui, n'est pas touché. */
export function retirerVignette(
  liste: readonly VignetteDupliquee[], cle: string,
): VignetteDupliquee[] {
  return liste.filter((x) => x.cle !== cle);
}

/** Cette vignette est-elle déjà posée ? PUR. Sert au menu, qui le DIT plutôt que de proposer deux fois. */
export function dejaDupliquee(liste: readonly VignetteDupliquee[], driveFileId: string): boolean {
  return liste.some((x) => x.driveFileId === driveFileId.trim());
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le libellé de l'entrée du menu. PUR. */
export const MOT_DUPLIQUER = 'Dupliquer en vignette';

/**
 * CE QUE LA VIGNETTE PROMET, en infobulle. PUR.
 *
 * ⚠️ ELLE DIT « COPIER », ET PAS « DÉPLACER ». C'est toute la différence du geste : le fichier d'origine reste où
 * il est. Quelqu'un qui croirait déplacer irait ensuite chercher le document là où il n'est plus — alors qu'il y
 * est toujours.
 */
export function aideVignette(nom: string): string {
  return `Copie de « ${nom} » à ranger. L’original ne bouge pas : chaque rangement en crée une copie de plus.`;
}

/**
 * LE COMPTE RENDU d'une copie rangée depuis une vignette. PUR.
 *
 * ⚠️ IL NOMME LE DOSSIER : « copié » tout court laisserait chercher où.
 */
export function motCopieRangee(nom: string, dossier: string): string {
  return `« ${nom} » copié dans « ${dossier} ». L’original n’a pas bougé.`;
}

/**
 * ══ 🔴 LE RÉSUMÉ DE LA COLONNE quand elle porte des vignettes dupliquées. PUR. ══════════════════════════════════
 *
 * ⚠️ IL EST DIT À PART DES PIÈCES DU MESSAGE, et c'est important à l'œil : ce ne sont pas des pièces « à ranger »
 * au sens du poste de tri — elles ne quittent aucune file et ne manqueront à personne si on ferme la fenêtre. Les
 * additionner au compteur des pièces aurait annoncé un travail à faire qui n'existe pas.
 */
export function resumeVignettes(n: number): string | null {
  if (n <= 0) return null;
  return n > 1
    ? `${n} copies à ranger (l’original reste en place)`
    : '1 copie à ranger (l’original reste en place)';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — LES PIÈCES D'OÙ L'ON VIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (07/10/2026, fil 36558) : un clic sur l'icône verte « Dans le Drive » d'une miniature ouvre
   l'écran du Drive — « mais la pièce ne figure nulle part en haut de la colonne de gauche ». On y voit les
   emplacements (« Dossier du bien », « Mon Drive », « Drives partagés », « Récents ») et rien du document qu'on
   vient de cliquer. Seul le bandeau « CE DOCUMENT EST ICI » en parle.

   🔴 LA CAUSE, LUE DANS LE CODE : la colonne de gauche ne montre des vignettes QU'EN MODE « ranger » — les pièces
   du message et les copies dupliquées. Le picto vert ouvre la fenêtre en mode « consulter », qui n'en a jamais
   porté. Le document était donc là sans être nulle part. */

/**
 * LE TITRE DISCRET DE LA SECTION. Arno : « avec un titre discret “Pièce(s) sélectionnée(s)” ».
 *
 * ⚠️ IL DIT COMBIEN dès qu'il y en a plusieurs : on arrive parfois d'une sélection de six pièces, et le nombre
 * est la première chose qu'on vérifie.
 */
export function titrePiecesSources(n: number): string | null {
  if (n <= 0) return null;
  return n > 1 ? `${n} pièces sélectionnées` : '1 pièce sélectionnée';
}

/**
 * 🔴 L'ÉTAT D'UNE PIÈCE QUI N'EST PAS ENCORE DANS LE DRIVE. Arno le demande en toutes lettres, et il a raison de
 * le vouloir ÉCRIT : une vignette sans loupe et sans compteur ne dit pas, à elle seule, si l'on n'a pas encore
 * cherché ou si l'on a cherché sans trouver.
 */
export const MOT_PAS_ENCORE_DANS_LE_DRIVE = 'pas encore dans le Drive';
