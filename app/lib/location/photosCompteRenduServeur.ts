import 'server-only';
import sharp from 'sharp';
import { formatImage } from './photosCompteRendu';
import { PIECE_MAX_OCTETS } from './validationSortie';

/**
 * 🔴 Arno (13/11/2026) — UNE PHOTO REÇUE, PRÉPARÉE AU SERVEUR (même si l'écran l'a déjà fait : rien n'est cru sur parole) : le format lu
 * dans ses octets (tout ce qui n'est pas une image est refusé) ; réorientée, réduite à 1 600 px au plus, ré-encodée en JPEG d'environ
 * 500 Ko ; 🔴 TOUTES ses métadonnées retirées (EXIF, dont la LOCALISATION GPS ; `sharp` n'en recopie aucune). Le HEIC est converti par
 * l'iPhone ; un HEIC arrivé tel quel (le serveur ne sait pas le décoder) est refusé avec un message clair.
 */
export const COTE_MAX_PX = 1600;
export const CIBLE_OCTETS = 500 * 1024;

export type IssuePhoto = { ok: true; octets: Buffer; largeur: number; hauteur: number } | { ok: false; motif: string };

export async function preparerPhoto(o: Uint8Array): Promise<IssuePhoto> {
  if (o.byteLength === 0) return { ok: false, motif: 'La photo est vide.' };
  if (o.byteLength > PIECE_MAX_OCTETS) return { ok: false, motif: `La photo dépasse ${Math.round(PIECE_MAX_OCTETS / (1024 * 1024))} Mo.` };
  const f = formatImage(o);
  if (f === null || f === 'gif') return { ok: false, motif: 'Ce fichier n’est pas une photo (JPEG, PNG, WebP ou HEIC de l’iPhone).' };
  if (f === 'heic') return { ok: false, motif: 'Photo HEIC non convertie : prenez-la depuis l’iPhone (Safari la convertit en JPEG) ou exportez-la en JPEG.' };
  try {
    for (const qualite of [82, 72, 62, 52]) {
      const { data, info } = await sharp(o, { failOn: 'error' }).rotate().resize({ width: COTE_MAX_PX, height: COTE_MAX_PX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: qualite, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      if (data.byteLength <= CIBLE_OCTETS || qualite === 52) return { ok: true, octets: data, largeur: info.width, hauteur: info.height };
    }
  } catch { /* image illisible */ }
  return { ok: false, motif: 'La photo est illisible.' };
}
