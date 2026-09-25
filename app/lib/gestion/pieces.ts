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
export type SortePiece = 'pdf' | 'image' | 'autre';

/** Les types d'image dont on sait faire une miniature. Liste FERMÉE : un type absent d'ici reçoit une icône. */
const IMAGES_MINIATURABLES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
]);

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
  // Un type absent ou générique (`application/octet-stream`) est fréquent : on se rabat sur l'extension du NOM, qui
  //   ne décide ici que de l'affichage — jamais de ce qu'on fait des octets.
  if (t === '' || t === 'application/octet-stream') {
    const ext = extensionDuNom(nomFichier);
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
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
