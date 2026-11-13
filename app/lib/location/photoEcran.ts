/**
 * 🔴 Arno (13/11/2026, lot B) — LA PHOTO AVANT SON ENVOI, DANS LE NAVIGATEUR (iPhone) : le HEIC (que Safari sait lire) et tout autre format
 * sont REDESSINÉS en JPEG, réduits à 1 600 px au plus, ~500 Ko ; un redessin ne recopie AUCUNE métadonnée (ni EXIF, ni localisation GPS).
 * Le serveur refait le même contrôle (`preparerPhoto`). Les fonctions du navigateur sont injectables (épreuves). ⚠️ AUCUN IMPORT SERVEUR.
 */
import { estHeic } from './photosCompteRendu';

export const COTE_MAX_ECRAN = 1600;
export const CIBLE_ECRAN = 500 * 1024;
/** Le plafond d'une photo AVANT conversion (une photo d'iPhone fait 2 à 6 Mo) ; après : celui du serveur (10 Mo), jamais atteint. */
export const BRUTE_MAX = 30 * 1024 * 1024;

export interface ImageDecodee { largeur: number; hauteur: number; source: CanvasImageSource }
export interface DepsPhoto {
  decoder: (f: Blob) => Promise<ImageDecodee>;
  encoder: (img: ImageDecodee, largeur: number, hauteur: number, qualite: number) => Promise<Blob>;
}

export type IssueConversion = { ok: true; blob: Blob; nom: string; largeur: number; hauteur: number } | { ok: false; motif: string };

/** Les dimensions réduites (côté le plus long ≤ 1 600 px, jamais agrandies). PUR. */
export function dimensionsReduites(l: number, h: number, max = COTE_MAX_ECRAN): { largeur: number; hauteur: number } {
  const r = Math.min(1, max / Math.max(l, h, 1));
  return { largeur: Math.max(1, Math.round(l * r)), hauteur: Math.max(1, Math.round(h * r)) };
}

export async function convertirPhoto(f: File, deps: DepsPhoto = depsNavigateur()): Promise<IssueConversion> {
  const heic = estHeic(f.name, f.type);
  if (!heic && !/^image\//i.test(f.type || '')) return { ok: false, motif: `« ${f.name} » n’est pas une photo.` };
  if (f.size > BRUTE_MAX) return { ok: false, motif: `« ${f.name} » est trop lourde (au-delà de ${BRUTE_MAX / (1024 * 1024)} Mo).` };
  let img: ImageDecodee;
  try { img = await deps.decoder(f); } catch {
    return { ok: false, motif: heic ? `« ${f.name} » : photo HEIC illisible par ce navigateur — prenez-la depuis l’iPhone (Safari la convertit) ou exportez-la en JPEG.`
      : `« ${f.name} » : photo illisible.` };
  }
  const d = dimensionsReduites(img.largeur, img.hauteur);
  let blob: Blob | null = null;
  for (const q of [0.82, 0.72, 0.62, 0.52]) {
    blob = await deps.encoder(img, d.largeur, d.hauteur, q);
    if (blob.size <= CIBLE_ECRAN) break;
  }
  if (blob === null) return { ok: false, motif: `« ${f.name} » : conversion impossible.` };
  return { ok: true, blob, nom: `${f.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, largeur: d.largeur, hauteur: d.hauteur };
}

/** Le contenu d'une photo en base64 (pour la route). */
export async function enBase64(b: Blob): Promise<string> {
  const o = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(s);
}

function depsNavigateur(): DepsPhoto {
  return {
    decoder: async (f) => {
      // L'orientation EXIF est appliquée par le navigateur (« from-image »), puis perdue au redessin : la photo reste droite, sans métadonnées.
      if (typeof createImageBitmap === 'function') {
        try { const b = await createImageBitmap(f, { imageOrientation: 'from-image' }); return { largeur: b.width, hauteur: b.height, source: b }; } catch { /* repli : <img> */ }
      }
      const url = URL.createObjectURL(f);
      try {
        const i = new Image(); i.src = url; await i.decode();
        return { largeur: i.naturalWidth, hauteur: i.naturalHeight, source: i };
      } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    },
    encoder: (img, l, h, q) => new Promise((ok, ko) => {
      const c = document.createElement('canvas'); c.width = l; c.height = h;
      const ctx = c.getContext('2d'); if (!ctx) { ko(new Error('canvas')); return; }
      ctx.drawImage(img.source, 0, 0, l, h);
      c.toBlob((b) => (b ? ok(b) : ko(new Error('jpeg'))), 'image/jpeg', q);
    }),
  };
}
