/**
 * MODULE « GESTION » — LOT 5-PJ-A : CE QU'ON SAIT D'UNE PIÈCE JOINTE SANS L'OUVRIR. Module PUR — aucune I/O, aucune
 * base, aucun réseau, et surtout AUCUN import serveur.
 *
 * 🔴 CE FICHIER EST ATTEINT PAR LE NAVIGATEUR. Il est importé par un composant `'use client'` : s'il tirait `pg`
 * (donc `dns`), webpack refuserait de construire la page et TOUTE l'application tomberait, écran de connexion compris
 * (incident du 24/09/2026). Il ne doit donc jamais rien importer d'autre que du pur. Le garde de graphe
 * `app/lib/garde/clientBoundary.guard.test.ts` le surveille.
 *
 * ⚠️ TOUT CE QUI EST ICI PORTE SUR DES DONNÉES VENUES DE L'EXTÉRIEUR — un nom de fichier et un type MIME écrits par
 * l'expéditeur du mail. Aucune de ces valeurs n'est crue sur parole : on en dérive un AFFICHAGE, jamais une décision
 * de sécurité (celles-là se prennent côté serveur, sur les octets).
 */

/**
 * 🔴 LA TAILLE SE FORMATE AVEC `formaterTaille` (ecran.ts), ET NULLE PART AILLEURS. Elle existe depuis le lot 4c, en
 * unités décimales — celles du Finder et des boîtes mail, donc celles que l'utilisateur comparera. En écrire une
 * seconde ici donnerait « 120 Ko » à côté de « 120 ko » dans le même écran, et deux vérités à corriger le jour où
 * l'on changera d'avis. Elle est réexportée pour que les appelants de ce module n'aient qu'un import.
 */
export { formaterTaille } from './ecran';
import { formaterTaille as taille } from './ecran';

/** La sorte d'une pièce, du point de vue de l'AFFICHAGE — pas du point de vue de la sécurité. */
export type SortePiece = 'pdf' | 'image' | 'video' | 'autre';

/** Les types d'image dont on sait faire une miniature. Liste FERMÉE : un type absent d'ici reçoit une icône. */
const IMAGES_MINIATURABLES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
]);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS, POINT 2 — LES VIDÉOS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (03/10/2026), fil 36593 / message 57422 : « VIDEO-2026-09-3….mp4 », 8,2 Mo, affichée en tuile
   grise « MP4 » — sans image, sans lecture, sans rien.

   🔴 CE QUE LA BASE DIT (relevé le 03/10/2026) : 117 vidéos, 1,1 Go — 80 `.mp4` (`video/mp4`, 783 Mo) et 37
   `.mov` (`video/quicktime`, 337 Mo). Aucun autre format.

   RÈGLE D'ARNO : « Formats : mp4, mov, webm, m4v, 3gp. » La liste est FERMÉE, comme celle des images : un type
   absent d'ici garde son icône, et aucun octet n'est ouvert pour lui.

   ⚠️ CETTE SORTE NE DÉCIDE QUE DE L'AFFICHAGE. Elle ne dit pas qu'on sait DÉCODER le fichier — c'est le
   navigateur qui tranchera, et il dira non pour un `.mov` HEVC d'iPhone dans Chrome. L'écran a donc un message
   pour ce cas-là (`MESSAGE_VIDEO_ILLISIBLE`), et jamais un cadre noir sans explication. */

/**
 * Les types vidéo que l'on PRÉSENTE comme des vidéos. Liste FERMÉE (règle d'Arno).
 *
 * ⚠️ `video/quicktime` EST DANS LA LISTE alors que Chrome ne le lit pas toujours : un `.mov` reste une vidéo, et
 * la bonne réponse est de lui offrir un lecteur qui DIT qu'il ne sait pas la lire, jamais de la déguiser en
 * fichier quelconque. Safari, lui, les lit.
 */
const VIDEOS = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2',
]);

/** Les extensions correspondantes, pour les mails qui n'annoncent aucun type (ou `application/octet-stream`). */
const EXTENSIONS_VIDEO = ['mp4', 'mov', 'webm', 'm4v', '3gp', '3g2'];

/**
 * 🔴 CE QU'ON ÉCRIT QUAND LE NAVIGATEUR NE SAIT PAS LIRE LE FORMAT (demande d'Arno, mot pour mot).
 *
 * ⚠️ IL EST SUIVI D'UN BOUTON « Télécharger », et les deux vont ensemble : un message qui constate sans proposer
 * laisse devant un cul-de-sac. C'est la règle de `messageSansApercu`, appliquée ici.
 */
export const MESSAGE_VIDEO_ILLISIBLE = 'Ce format ne se lit pas dans le navigateur';

/** Cette pièce est-elle une vidéo, au sens de l'affichage ? PUR. */
export function estVideo(typeMime: string | null | undefined, nomFichier = ''): boolean {
  return sortePiece(typeMime, nomFichier) === 'video';
}

/** Type MIME normalisé : minuscules, sans le `; charset=…`. Même règle que `stockage/index.ts`. PUR. */
export function typeNormalise(typeMime: string | null | undefined): string {
  return (typeMime ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * La sorte d'une pièce.
 *
 * 🔴 NI HTML NI SVG NE SONT JAMAIS DES « IMAGES » ICI, et ce n'est pas un oubli : un SVG est un document qui peut
 * porter du script, et un HTML reçu en pièce jointe est du code écrit par un inconnu. Les rendre reviendrait à
 * exécuter chez nous ce qu'un tiers nous a envoyé. Ils reçoivent une icône, comme un .zip. PUR.
 */
export function sortePiece(typeMime: string | null | undefined, nomFichier = ''): SortePiece {
  const t = typeNormalise(typeMime);
  if (t === 'application/pdf') return 'pdf';
  if (IMAGES_MINIATURABLES.has(t)) return 'image';
  if (VIDEOS.has(t)) return 'video';
  // Un type absent ou générique (`application/octet-stream`) est fréquent : on se rabat sur l'extension du NOM, qui
  //   ne décide ici que de l'affichage — jamais de ce qu'on fait des octets.
  if (t === '' || t === 'application/octet-stream') {
    const ext = extensionDuNom(nomFichier);
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
    if (EXTENSIONS_VIDEO.includes(ext)) return 'video';
  }
  return 'autre';
}

/** L'extension du nom de fichier, en minuscules et sans le point. Vide s'il n'y en a pas. PUR. */
export function extensionDuNom(nomFichier: string | null | undefined): string {
  const nom = (nomFichier ?? '').trim();
  const point = nom.lastIndexOf('.');
  if (point <= 0 || point === nom.length - 1) return '';
  const ext = nom.slice(point + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/**
 * L'ÉTIQUETTE DE TYPE affichée sur la carte d'une pièce sans miniature : « XML », « DOCX », « ZIP ». En toutes
 * lettres et en majuscules — c'est le seul repère qui reste quand il n'y a pas d'image, et « fichier » n'en est pas
 * un. Repli sur le type MIME quand le nom n'a pas d'extension, et « FICHIER » en tout dernier recours. PUR.
 */
export function etiquetteType(nomFichier: string | null | undefined, typeMime: string | null | undefined): string {
  const ext = extensionDuNom(nomFichier);
  if (ext !== '') return ext.toUpperCase();
  const t = typeNormalise(typeMime);
  const sousType = t.includes('/') ? t.split('/')[1] : '';
  const propre = sousType.replace(/^vnd\..*[.+-]/, '').replace(/[^a-z0-9]/g, '');
  return propre !== '' && propre.length <= 8 ? propre.toUpperCase() : 'FICHIER';
}

/**
 * TRONQUE UN NOM DE FICHIER PAR LE MILIEU, en gardant l'extension. « releve-sepa-2026-09-camt053.xml » →
 * « releve-sepa…camt053.xml ». Couper par la fin donnerait « releve-sepa-2026-0… », qui ne dit plus ni de quoi il
 * s'agit, ni de quel type. Le nom COMPLET reste disponible ailleurs (attribut `title`, libellé accessible). PUR.
 */
export function tronquerNom(nomFichier: string, max = 28): string {
  const nom = (nomFichier ?? '').trim();
  if (nom.length <= max) return nom;
  const ext = extensionDuNom(nom);
  const suffixe = ext === '' ? '' : `.${ext}`;
  const base = ext === '' ? nom : nom.slice(0, nom.length - suffixe.length);
  const place = max - suffixe.length - 1; // 1 pour l'ellipse
  if (place < 6) return `${nom.slice(0, Math.max(1, max - 1))}…`;
  const debut = Math.ceil(place * 0.62);
  const fin = place - debut;
  return `${base.slice(0, debut)}…${fin > 0 ? base.slice(-fin) : ''}${suffixe}`;
}

/**
 * PLAFOND DE L'ARCHIVE. Au-delà, « Tout télécharger » ne s'essaie pas : il DIT pourquoi. Une archive de 400 Mo
 * fabriquée à la volée occupe la mémoire du serveur et finit en délai dépassé côté navigateur — l'échec arriverait
 * après une minute d'attente, c'est-à-dire au pire moment.
 */
export const PLAFOND_ARCHIVE_OCTETS = 200 * 1024 * 1024;

/** Une pièce, vue par l'affichage. Le sous-ensemble strictement nécessaire : ce module n'a pas besoin du reste. */
export interface PieceAffichee {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  disponible: boolean;
  motifNonStocke: string | null;
  /**
   * 🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES — cette image était posée DANS le corps du mail. Elle est une pièce
   * comme les autres (même miniature, même œil, même ⤓, même ▲), et elle le DIT : « intégrée au mail ».
   *
   * ⚠️ FACULTATIVE : `undefined`/`null` ⇒ aucune mention, et la carte est celle d'avant ce lot. Sans la
   * migration 296 (colonne `gestion_piece.integree`), rien ne change nulle part.
   */
  integree?: boolean | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES (09/10/2026) — CE QU'UNE IMAGE DU CORPS AFFICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA MENTION, écrite UNE fois. Arno : « la mention discrète “intégrée au mail” ».
 *
 * 🔴 ELLE DIT D'OÙ VIENT LA PIÈCE, PAS CE QU'ELLE VAUT. Une photo collée dans le corps est une pièce entière :
 * elle se visualise, se télécharge et se range comme les autres. La mention sert à comprendre pourquoi on la
 * voit AUSSI dans le corps du mail — sans elle, on croirait à un doublon.
 */
export const MENTION_IMAGE_INTEGREE = 'intégrée au mail';

/**
 * Les libellés de remplacement d'une partie MIME SANS nom de fichier, tels que le dépôt les écrit. Comparés en
 * minuscules : un fichier réellement nommé « (sans nom).png » garde donc son nom.
 */
const SANS_NOM: readonly string[] = ['', '(sans nom)', '(sans titre)'];

/**
 * LE NOM D'UNE IMAGE INTÉGRÉE : le sien, sinon « Image intégrée N.jpg ». PUR.
 *
 * Arno : « son nom (nom d'origine, sinon “Image intégrée 1.jpg”) ».
 *
 * 🔴 LE RANG EST CELUI DE L'APPELANT, et il commence à 1 : c'est un numéro qu'on LIT, pas un index. Mesuré sur
 * la base le 09/10/2026 : **28** images intégrées de plus de 30 Ko arrivent sous le libellé « (sans nom) » —
 * assez pour que le cas existe, trop peu pour qu'on devine un nom à leur place.
 *
 * ⚠️ L'EXTENSION SUIT LE TYPE RÉEL, jamais « .jpg » par défaut : un PNG nommé « .jpg » s'ouvre de travers dans
 * la moitié des outils, et c'est le nom qu'on retrouvera dans le Drive.
 */
export function nomImageIntegree(
  nomFichier: string | null | undefined, rang: number, typeMime?: string | null,
): string {
  const nom = (nomFichier ?? '').trim();
  if (!SANS_NOM.includes(nom.toLowerCase())) return nom;
  const sousType = (typeMime ?? '').toLowerCase().split('/')[1]?.split(';')[0]?.trim() ?? '';
  const ext = sousType === '' ? 'jpg' : (sousType === 'jpeg' ? 'jpg' : sousType);
  return `Image intégrée ${Math.max(1, Math.trunc(rang))}.${ext}`;
}

/** Le poids total des pièces RÉELLEMENT disponibles : celles qui entreraient dans l'archive. PUR. */
export function poidsTotal(pieces: readonly PieceAffichee[]): number {
  return pieces.filter((p) => p.disponible).reduce((t, p) => t + (p.tailleOctets ?? 0), 0);
}

/** Ce que « Tout télécharger » peut faire, et sinon POURQUOI il ne le fait pas. PUR. */
export type EtatArchive =
  | { possible: true; nombre: number; octets: number }
  | { possible: false; motif: string };

export function etatArchive(pieces: readonly PieceAffichee[], plafond = PLAFOND_ARCHIVE_OCTETS): EtatArchive {
  const dispo = pieces.filter((p) => p.disponible);
  if (dispo.length === 0) return { possible: false, motif: 'aucune pièce conservée' };
  const octets = poidsTotal(pieces);
  if (octets > plafond) {
    return {
      possible: false,
      // Le motif donne les DEUX chiffres : sans le plafond, « trop volumineux » n'apprend rien et ne se contourne pas.
      motif: `trop volumineux pour une archive (${taille(octets)}, maximum ${taille(plafond)}) — télécharge les pièces une par une`,
    };
  }
  return { possible: true, nombre: dispo.length, octets };
}

/**
 * LE NOM DU FICHIER .zip : « 2026-09-25 — Fenêtre cassée.zip ».
 *
 * Tout ce qui pourrait abîmer un nom de fichier ou un en-tête HTTP est retiré : séparateurs de chemin, caractères
 * interdits par Windows, guillemets, antislashs, retours à la ligne, et les caractères de contrôle. Le résultat est
 * borné en longueur — certains objets de mail font trois lignes. PUR.
 */
export function nomArchive(dateISO: string | null | undefined, objet: string | null | undefined): string {
  const jour = (dateISO ?? '').slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : '';
  const propre = (objet ?? '')
    // eslint-disable-next-line no-control-regex -- les caractères de contrôle sont précisément ce qu'on retire
    .replace(/[ -]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  const morceaux = [date, propre].filter((m) => m !== '');
  const base = morceaux.length > 0 ? morceaux.join(' — ') : 'pieces-jointes';
  return `${base}.zip`;
}

/**
 * LE NOM D'UNE PIÈCE DANS L'ARCHIVE, et l'évitement des DOUBLONS. Deux pièces d'un même mail peuvent porter le même
 * nom (« image001.png » deux fois, c'est le cas ordinaire d'une signature) : sans numérotation, l'archive n'en
 * contiendrait qu'une, ou pire, deux entrées identiques que les logiciels traitent différemment. PUR.
 *
 * ⚠️ Le nom vient d'un tiers : les séparateurs de chemin sont retirés, pour qu'une pièce nommée `../../etc/passwd`
 * ne devienne jamais un chemin à l'extraction (« zip slip »).
 */
export function nomsSansDoublon(noms: readonly string[]): string[] {
  const vus = new Map<string, number>();
  return noms.map((brut) => {
    const nom = (brut || 'piece-jointe')
      // eslint-disable-next-line no-control-regex -- idem : on retire les caractères de contrôle, on ne les matche pas par hasard
      .replace(/[ -]/g, '')
      .replace(/[/\\]/g, '_')
      .replace(/^\.+/, '_')
      .trim() || 'piece-jointe';
    const cle = nom.toLowerCase();
    const n = vus.get(cle) ?? 0;
    vus.set(cle, n + 1);
    if (n === 0) return nom;
    const ext = extensionDuNom(nom);
    const suffixe = ext === '' ? '' : `.${ext}`;
    const base = ext === '' ? nom : nom.slice(0, nom.length - suffixe.length);
    return `${base} (${n + 1})${suffixe}`;
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — DEUX GESTES DISTINCTS SUR UNE MINIATURE, ÉCRITS UNE SEULE FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (03/10/2026) : « Le clic simple sur la miniature n'ouvre plus la visionneuse. » Les deux gestes
   deviennent explicites et SÉPARÉS :

     · l'ŒIL, dans la rangée d'actions → la VISIONNEUSE MAISON (colonne des pages, page 1 d'abord, Précédent /
       Suivant sur toute la conversation) ;
     · le DOUBLE-CLIC sur la miniature → le DOCUMENT ENTIER dans un NOUVEL ONGLET, rendu par le navigateur.

   🔴 POURQUOI UNE ADRESSE ÉCRITE ICI PLUTÔT QUE DANS CHAQUE ÉCRAN. Deux écrans montrent des miniatures de pièces
   (le bloc d'un message, le récapitulatif de la conversation) et ils doivent ouvrir EXACTEMENT la même chose. Une
   adresse recopiée dérive : il a suffi d'un `?telecharger=1` de trop pour qu'un écran force l'enregistrement là où
   l'autre affiche.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * L'ADRESSE DU DOCUMENT ENTIER, tel qu'un onglet doit l'afficher. PUR.
 *
 * 🔴 SANS `?telecharger=1`, ET C'EST TOUT L'OBJET DE CETTE FONCTION. La route sert `Content-Disposition: inline`
 * par défaut et bascule en `attachment` avec ce paramètre : le poser ici ferait enregistrer le fichier au lieu de
 * l'afficher, ce qu'Arno exclut explicitement (« contenu servi en inline, pas en téléchargement forcé »).
 *
 * 🔴 ET C'EST LA MÊME SOURCE QUE LE TÉLÉCHARGEMENT : la route lit MinIO, puis notre copie Drive, puis Gmail en
 * dernier recours, et répond sous le NOM D'USAGE (celui du stylo ✎) quand il y en a un. Rien à redire ici — tout
 * cela vit côté serveur, et le dupliquer donnerait deux vérités.
 *
 * ⚠️ ELLE VAUT POUR TOUS LES TYPES. Un PDF et une image s'affichent ; un `.xml` ou un `.docx` suivent le
 * comportement du navigateur, qui l'enregistre le plus souvent. C'est la règle qu'Arno demande, et la seule qui
 * n'oblige pas à tenir une seconde liste de types à côté de `sortePiece`.
 */
export function lienDocumentEntier(pieceId: number): string {
  return `/api/admin/gestion/pieces/${pieceId}`;
}

/**
 * CE QUE LA MINIATURE PROMET, en infobulle. PUR.
 *
 * ⚠️ IL FAUT L'ÉCRIRE. Un double-clic ne se devine pas : sans ce mot, la miniature devient une image inerte pour
 * qui ne tente pas le geste — et l'œil juste en dessous, lui, ne dit rien du nouvel onglet.
 */
export const AIDE_DOUBLE_CLIC = 'Double-cliquez pour ouvrir le document dans un nouvel onglet';

/** Le mot de l'œil, écrit une fois : il est le MÊME dans les deux écrans qui en portent un. PUR. */
export const AIDE_OEIL_PIECE = 'Visualiser';
