/**
 * MODULE « GESTION » — LOT DRIVE-3 : LIRE LE CONTENU D'UNE PIÈCE DANS LE DRIVE. IMPUR (réseau), LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒🔒 CE MODULE N'ÉMET QUE DES `GET`, ET JAMAIS SUR AUTRE CHOSE QUE NOS PROPRES COPIES.
 *
 * « Documents clients scannés » est en production et INTOUCHABLE. La garantie ne repose pas sur une promesse mais sur
 * l'ORIGINE DE L'IDENTIFIANT : `driveFileIdDeLaPiece` ne rend que des identifiants tirés de `gestion_piece_drive` avec
 * `origine = 'copie'`, c'est-à-dire des fichiers que le programme a lui-même créés dans « 00 Arrivée des mails »,
 * derrière le double garde-fou. Aucun autre identifiant n'entre dans ce module, et un test le vérifie.
 *
 * 🔒 AUCUNE ÉCRITURE. Ni `POST`, ni `PATCH`, ni `PUT`, ni `DELETE`, ni `trashed`, ni `addParents`, ni partage. Ce
 * fichier ne sait pas écrire dans Drive : il ne connaît que `files/{id}` en lecture.
 *
 * ═══ 🔴 POURQUOI LE FLUX PASSE PAR LE SERVEUR, ET NON PAR UN LIEN DRIVE ══════════════════════════════════════════
 * C'est la même décision que pour MinIO (lot 4c), et pour les deux mêmes raisons :
 *   ① un lien Drive suppose que la personne ait un compte Google autorisé sur ce Drive — ce qui n'est pas le cas de
 *      tout le monde, et surtout pas de l'application elle-même ;
 *   ② un lien est un laissez-passer transmissible vers le bail ou le RIB d'un locataire. Servir par l'application
 *      replace le contrôle d'accès à CHAQUE ouverture : le droit `gestion` est relu en base à chaque requête.
 * L'utilisateur ne voit donc aucune différence — même nom, même type, mêmes octets. Tout au plus un délai.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';

const API = 'https://www.googleapis.com/drive/v3';

export interface DepsLecture { fetch: typeof fetch }

export type IssueLectureDrive =
  | { ok: true; octets: Buffer; md5: string }
  | { ok: false; motif: string; code?: number };

/**
 * LES OCTETS D'UN FICHIER DRIVE. `alt=media` est la SEULE forme qui rende du contenu — et elle est en lecture.
 *
 * ⚠️ L'EMPREINTE EST RECALCULÉE SUR CE QU'ON A REÇU, pas lue dans les métadonnées. C'est ce qui permet à l'appelant
 * de vérifier qu'il sert bien l'objet attendu, et non un fichier remplacé entre-temps.
 *
 * ⚠️ PAS DE PLAFOND DE TAILLE ICI. La plus grosse pièce du dépôt fait quelques mégaoctets, et le même contenu passait
 * déjà par la mémoire du serveur quand il venait de MinIO : ajouter une limite ici changerait le comportement d'une
 * pièce qui marche aujourd'hui.
 */
export async function lireContenuDrive(
  driveFileId: string, jeton: string, deps: DepsLecture,
): Promise<IssueLectureDrive> {
  const id = (driveFileId ?? '').trim();
  if (id === '') return { ok: false, motif: 'aucun identifiant de fichier Drive' };

  const res = await deps.fetch(
    `${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    { method: 'GET', headers: { Authorization: `Bearer ${jeton}` } });

  if (!res.ok) {
    const texte = await res.text().catch(() => '');
    return { ok: false, code: res.status, motif: motifLecture(res.status, texte) };
  }
  const octets = Buffer.from(await res.arrayBuffer());
  return { ok: true, octets, md5: createHash('md5').update(octets).digest('hex') };
}

/** Un motif LISIBLE par quelqu'un qui n'a pas écrit le code. « HTTP 404 » seul n'apprend rien. PUR. */
export function motifLecture(status: number, texte = ''): string {
  if (status === 401) return 'la connexion Google a expiré';
  if (status === 403) return `Google a refusé la lecture (403) : ${texte.slice(0, 160)}`;
  if (status === 404) return 'le fichier n’existe plus dans le Drive';
  if (status === 429 || status >= 500) return `Drive n’a pas répondu (${status}) — à réessayer dans un instant`;
  return `Google a refusé la lecture (code ${status})`;
}

/**
 * LE MESSAGE MONTRÉ À L'UTILISATEUR quand la lecture Drive échoue. PUR.
 *
 * 🔴 JAMAIS UN FAUX « INTROUVABLE », ET JAMAIS UN ÉCRAN VIDE. La pièce EXISTE, sa copie EXISTE : ce qui a échoué est
 * la lecture, à l'instant. Le dire ainsi, avec le lien vers la copie, permet à la personne d'aller la chercher
 * elle-même dans le Drive plutôt que de croire le document perdu.
 */
export function messageIndisponible(driveFileId: string, motif: string): string {
  return `Pièce momentanément indisponible (${motif}). Copie Drive : ${lienDrive(driveFileId)}`;
}

/** Le lien d'ouverture d'un fichier dans le Drive — pour qu'un humain aille le voir. PUR. */
export function lienDrive(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent((driveFileId ?? '').trim())}/view`;
}
