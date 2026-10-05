/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — « CETTE PIÈCE EST-ELLE DÉJÀ DANS LE DRIVE ? » Module PUR ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « sous chaque miniature de pièce jointe, à DROITE des pictos existants (œil,
 * téléchargement, Drive ▲), un picto “base de données”. Il n'apparaît QUE si cette pièce est déjà dans le Drive.
 * Bulle au survol : “Pièce jointe dans le Drive”, avec “(N emplacements)” si plusieurs. Clic : un emplacement →
 * ouvre notre fenêtre Drive positionnée dans le dossier qui contient le document, le fichier mis en évidence ;
 * plusieurs → un petit menu listant les chemins (Drive › … › dossier, nom du fichier). »
 *
 * ═══ 🔴🔴 LA SOURCE EST LA MÊME QUE CELLE DE LA PASTILLE VERTE ET DE LA LOUPE ════════════════════════════════════
 *
 * Arno l'a posé comme contrainte, et c'est la bonne : « une seule source de vérité, pas de recalcul différent ».
 * Les trois voies sont donc celles du lot EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE :
 *
 *   ① LE REGISTRE DES DÉPÔTS (`gestion_piece_drive`) — ce que CETTE application a rangé. Exact : on relit ce
 *      qu'on a fait, on ne devine rien.
 *   ② LE MÊME REGISTRE, PAR EMPREINTE (md5) — la pièce revenue sous un autre nom, qui n'a aucun dépôt à son nom
 *      mais dont les octets sont déjà quelque part. C'est le cas d'Arno, et c'est ce qui a fondé le lot.
 *   ③ L'INDEX DES EMPREINTES (`gestion_drive_empreinte`) — les fichiers du Drive que l'application n'a JAMAIS
 *      touchés. Seule voie possible : `files.list` avec `q=md5Checksum='…'` répond HTTP 400 (mesuré).
 *
 * ⚠️ « N emplacements CONNUS », jamais « N emplacements ». L'index est un reflet : un fichier rangé à la main
 * dans un coin du Drive qu'aucun balayage n'a encore lu n'y est pas. Promettre l'exhaustivité ferait conclure
 * « il n'est nulle part ailleurs » d'une recherche qui n'a pas eu lieu — c'est déjà la règle de la loupe.
 *
 * ⚠️ AUCUN APPEL GOOGLE POUR RÉPONDRE. Tout se lit en base, et c'est ce qui permet au picto de paraître à
 * l'ouverture du mail sans rien ralentir. Le clic, lui, a le droit de coûter : on vient de le demander.
 *
 * 🔒 CE MODULE NE SAIT NI LIRE NI ÉCRIRE : pas un `fetch`, pas une ligne de SQL. Il NOMME et il MET EN FORME.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Par quelle voie un emplacement a été reconnu. Les deux sont exactes, elles ne disent pas la même chose. */
export type VoieEmplacement = 'registre' | 'empreinte';

/** Un endroit du Drive où ce contenu se trouve déjà. */
export interface EmplacementPiece {
  /** L'identifiant Drive du FICHIER (pas du dossier) : c'est lui qu'on met en évidence. */
  driveFileId: string;
  /** Le nom du fichier LÀ-BAS, qui n'est pas toujours celui de la pièce — c'est tout le propos du lot. */
  nom: string;
  /** Le dossier qui le contient. Chaîne vide = inconnu : on ne sait alors pas où se poser. */
  dossierId: string;
  dossierNom: string | null;
  /** Le chemin, du parent IMMÉDIAT vers la racine. Vide = on n'a pas su remonter. */
  chemin: readonly { id: string; nom: string }[];
  voie: VoieEmplacement;
}

/** Ce qu'une pièce a dans le Drive. Une pièce sans emplacement n'apparaît pas dans la réponse. */
export interface StatutPieceDrive {
  pieceId: number;
  emplacements: EmplacementPiece[];
}

/**
 * ⚠️ LA MÊME BORNE QUE LA LOUPE (`OCCURRENCES_MAX`), et pour la même raison : au-delà de cinquante, la question
 * n'est plus « où est-il ? » mais « pourquoi y en a-t-il tant ? ». Le menu reste lisible, et la requête bornée.
 */
export const EMPLACEMENTS_MAX = 50;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le mot du picto, tel qu'Arno l'a écrit. Il sert la bulle ET le lecteur d'écran. */
export const MOT_PIECE_DANS_LE_DRIVE = 'Pièce jointe dans le Drive';

/**
 * LA BULLE DU PICTO. PUR.
 *
 * ⚠️ « (N emplacements) » SEULEMENT S'IL Y EN A PLUSIEURS (demande d'Arno). « (1 emplacement) » serait du bruit :
 * le picto ne paraît que lorsqu'il y en a au moins un, et le dire ne distingue rien.
 */
export function bullePieceDansLeDrive(nombre: number): string {
  return nombre > 1 ? `${MOT_PIECE_DANS_LE_DRIVE} (${nombre} emplacements)` : MOT_PIECE_DANS_LE_DRIVE;
}

/** Le titre du petit menu, quand il y a plusieurs emplacements. PUR. */
export function titreMenuEmplacements(nombre: number): string {
  return `${nombre} emplacements connus dans le Drive`;
}

/**
 * ══ LE CHEMIN D'UN EMPLACEMENT, LISIBLE. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « un petit menu listant les chemins (Drive › … › dossier, nom du fichier) ».
 *
 * 🔴 ON GARDE LA RACINE ET LE DOSSIER, ET L'ON CREUSE LE MILIEU. Le Drive du cabinet fait treize niveaux : un fil
 * d'Ariane complet passe à la ligne et cesse d'être lisible exactement là où il servirait. Les deux bouts sont ce
 * qui situe — d'où l'on part, et où l'on arrive.
 *
 * ⚠️ `chemin` ARRIVE DU PARENT VERS LA RACINE (c'est la forme de la loupe, et on ne la retourne pas en chemin) :
 * on l'inverse ICI, une fois, pour l'affichage.
 *
 * ⚠️ CHEMIN INCONNU : on dit le nom du dossier si on l'a, et « Emplacement connu » sinon. Jamais une flèche vide,
 * qui ferait croire à un chemin tronqué.
 */
export function cheminLisible(e: Pick<EmplacementPiece, 'chemin' | 'dossierNom'>, max = 3): string {
  const noms = [...e.chemin].reverse().map((d) => d.nom.trim()).filter((n) => n !== '');
  if (noms.length === 0) {
    const seul = (e.dossierNom ?? '').trim();
    return seul === '' ? 'Emplacement connu' : seul;
  }
  if (noms.length <= max) return noms.join(' › ');
  /* ⚠️ LE « … » COMPTE CE QU'IL CACHE : masquer sans le dire ferait croire que le dossier est à la racine. */
  const caches = noms.length - max;
  return [noms[0], `… (${caches})`, ...noms.slice(noms.length - (max - 1))].join(' › ');
}

/**
 * UNE LIGNE DU MENU : le chemin, puis le nom du fichier LÀ-BAS. PUR.
 *
 * 🔴 LE NOM DU FICHIER EST DIT, ET IL FAUT LE DIRE. Le document peut y être rangé sous un tout autre nom que la
 * pièce — c'est le cas qui a fondé ce lot. Afficher le seul chemin laisserait croire qu'on va retrouver le même
 * nom en arrivant.
 */
export function ligneEmplacement(e: EmplacementPiece, max = 3): string {
  const nom = e.nom.trim();
  const chemin = cheminLisible(e, max);
  return nom === '' ? chemin : `${chemin} · ${nom}`;
}

/**
 * COMBIEN D'EMPLACEMENTS POUR CETTE PIÈCE, dans un ensemble de statuts. PUR.
 *
 * ⚠️ `0` QUAND LA PIÈCE N'Y EST PAS : « pas d'emplacement » et « pièce inconnue » se traitent pareil à l'écran —
 * le picto ne paraît pas. Inventer une distinction obligerait l'appelant à la rendre visible.
 */
export function nbEmplacements(statuts: readonly StatutPieceDrive[], pieceId: number): number {
  return statuts.find((s) => s.pieceId === pieceId)?.emplacements.length ?? 0;
}

/** Les emplacements d'une pièce, ou une liste vide. PUR. */
export function emplacementsDe(
  statuts: readonly StatutPieceDrive[], pieceId: number,
): readonly EmplacementPiece[] {
  return statuts.find((s) => s.pieceId === pieceId)?.emplacements ?? [];
}

/**
 * ══ 🔴 OÙ LA FENÊTRE DRIVE DOIT S'OUVRIR POUR CET EMPLACEMENT. PUR. ══════════════════════════════════════════════
 *
 * Le DOSSIER qui contient le document, et son nom pour l'attente — le serveur rendra la chaîne complète, comme
 * pour « Ouvrir le Drive du bien ».
 *
 * ⚠️ `null` QUAND ON NE CONNAÎT PAS LE DOSSIER : on ne s'ouvre pas « quelque part », on reste à la racine et le
 * repère fera le reste. Un identifiant inventé mènerait à une erreur Google.
 */
export function dossierDeLEmplacement(e: EmplacementPiece): { id: string; nom: string } | null {
  const id = e.dossierId.trim();
  if (id === '') return null;
  const nom = (e.dossierNom ?? '').trim();
  return { id, nom: nom === '' ? (e.chemin[0]?.nom ?? 'Dossier') : nom };
}

/**
 * ══ 🔴🔴 COMBIEN DE PIÈCES AU PLUS PAR DEMANDE À `/pieces-drive` ═════════════════════════════════════════════════
 *
 * Une adresse n'est pas une demande : `?pieces=` avec dix mille identifiants n'est pas une page d'écran, et
 * au-delà d'une quinzaine de milliers de caractères les serveurs refusent l'en-tête. La route BORNE donc, et
 * l'écran DÉCOUPE — les deux lisent ce nombre-ci, qui est la raison pour laquelle il a quitté la route.
 *
 * ⚠️ IL A CHANGÉ DE MAISON AU LOT HISTORIQUE-BIEN-11, POINT 5, ET LA RAISON COMPTE. Jusque-là, le résumé des
 * pièces ne couvrait que la page du fil (100 mails au plus) : une seule demande suffisait toujours, et la borne
 * de la route n'était qu'un garde-fou. Depuis que le résumé couvre TOUTE la sélection, le cas réel la dépasse —
 * mesuré le 05/10/2026 : **2 biens sur 338 portent plus de 300 pièces**, le plus fourni en portant **782**
 * (bien 282), soit trois tranches. Si l'écran ne découpait pas, la route tronquerait EN SILENCE et le picto
 * « déjà dans le Drive » manquerait sur les suivantes, sans que rien ne le dise.
 */
export const PIECES_DRIVE_MAX = 300;
