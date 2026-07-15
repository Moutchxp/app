import sharp from 'sharp';

/**
 * Dégradation et validation de la photo du tunnel AVANT dépôt objet. Pièces PURES (aucun accès base, aucun réseau)
 * → testables directement. Le fichier finit dans un document remis à un tiers : on APPLIQUE l'orientation EXIF puis
 * on RETIRE toutes les métadonnées (sharp ne recopie PAS l'EXIF par défaut → GPS/EXIF absents de la sortie).
 */

/** Borne d'ENTRÉE (avant dégradation) : rejette un payload absurde. La borne de SORTIE est celle du module stockage. */
export const MAX_ENTREE_OCTETS = 25 * 1024 * 1024;
/** Côté long maximal du master (px). */
export const COTE_LONG_MAX_PX = 1600;
/** Qualité JPEG du master (cible ~300 Ko sur une photo réelle). */
const QUALITE_JPEG = 75;
/** Formats d'image acceptés en ENTRÉE (déduits du CONTENU, jamais de la déclaration du client). */
const FORMATS_IMAGE: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff', 'gif']);

/** Décode une data URL (`data:image/jpeg;base64,…`) OU un base64 nu en Buffer. `null` si absent/illisible. */
export function decoderBase64(photo: unknown): Buffer | null {
  if (typeof photo !== 'string' || photo.length === 0) return null;
  const virgule = photo.startsWith('data:') ? photo.indexOf(',') : -1;
  const b64 = virgule >= 0 ? photo.slice(virgule + 1) : photo;
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** Type MIME RÉEL déduit du CONTENU via sharp — `false` si ce n'est pas une image connue (ou contenu illisible). */
export async function estImage(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer).metadata();
    return !!meta.format && FORMATS_IMAGE.has(meta.format);
  } catch {
    return false;
  }
}

/**
 * Master unique JPEG : `rotate()` applique l'orientation EXIF DANS les pixels, puis (aucun `withMetadata`) sharp
 * n'écrit AUCUNE métadonnée → EXIF/GPS retirés. Côté long ≤ 1600 px (sans agrandir), qualité 75 (mozjpeg).
 */
export async function degraderPhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: COTE_LONG_MAX_PX, height: COTE_LONG_MAX_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITE_JPEG, mozjpeg: true })
    .toBuffer();
}
