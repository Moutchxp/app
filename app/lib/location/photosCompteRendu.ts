/**
 * ══ 🔴🔴 LES PHOTOS DU COMPTE RENDU DE PRÉ-VISITE (Arno, 13/11/2026) — RÈGLES PURES ═════════════════════════════════════════════════════
 * Chaque photo a une LÉGENDE OBLIGATOIRE ; le compte rendu est structuré : le texte, puis « Photos », chaque photo numérotée avec sa légende
 * (« Photo 1 — Rayure parquet chambre ») ; dans le mail, chaque photo part en pièce jointe « Photo-1-rayure-parquet-chambre.jpg ».
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` ni `sharp` (partagé avec l'écran).
 */
export const PHOTOS_MAX = 20;
export const LEGENDE_MAX = 200;
export const TITRE_PHOTOS = 'Photos';

export interface PhotoCompteRendu { id: number; legende: string }

/** Le refus d'une liste de photos : la première photo sans légende (ou trop longue), trop de photos ; null : tout va. PUR. */
export function refusPhotos(photos: readonly { legende: string | null | undefined }[]): { motif: string; rang: number } | null {
  if (photos.length > PHOTOS_MAX) return { motif: `Au plus ${PHOTOS_MAX} photos par compte rendu.`, rang: PHOTOS_MAX };
  for (let i = 0; i < photos.length; i += 1) {
    const l = (photos[i].legende ?? '').trim();
    if (l === '') return { motif: `La photo ${i + 1} n’a pas de légende : chaque photo doit être légendée avant l’envoi.`, rang: i };
    if (l.length > LEGENDE_MAX) return { motif: `La légende de la photo ${i + 1} dépasse ${LEGENDE_MAX} caractères.`, rang: i };
  }
  return null;
}

/** « Photo 1 — Rayure parquet chambre ». PUR. */
export const lignePhoto = (rang: number, legende: string): string => `Photo ${rang + 1} — ${legende.trim()}`;

/** Les paragraphes de la section « Photos » (vide : aucune photo). PUR. */
export function paragraphesPhotos(photos: readonly { legende: string }[]): string[] {
  return photos.length === 0 ? [] : [TITRE_PHOTOS, photos.map((p, i) => lignePhoto(i, p.legende)).join('\n')];
}

/** « Photo-1-rayure-parquet-chambre.jpg » : ASCII, sans accent ni espace, 60 caractères de légende au plus. PUR. */
export function nomFichierPhoto(rang: number, legende: string): string {
  const s = legende.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return `Photo-${rang + 1}${s ? `-${s}` : ''}.jpg`;
}

/** Les légendes, relues dans le texte enregistré (section « Photos »), dans l'ordre. PUR. */
export function legendesDuTexte(texte: string | null): string[] {
  if (!texte) return [];
  const lignes = texte.split(/\r?\n/);
  const debut = lignes.findIndex((l) => l.trim() === TITRE_PHOTOS);
  if (debut < 0) return [];
  const r: string[] = [];
  for (const l of lignes.slice(debut + 1)) {
    const m = /^Photo (\d+) — (.+)$/.exec(l.trim());
    if (m) r[Number(m[1]) - 1] = m[2];
    else if (r.length > 0 && l.trim() !== '') break;
  }
  return r.filter((x) => typeof x === 'string');
}

/** Le format d'une image, par ses PREMIERS OCTETS (jamais par le nom ni le type annoncé). PUR. */
export type FormatImage = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'gif' | null;
export function formatImage(o: Uint8Array): FormatImage {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpeg';
  if (o.length >= 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'png';
  if (o.length >= 12 && String.fromCharCode(...o.slice(0, 4)) === 'RIFF' && String.fromCharCode(...o.slice(8, 12)) === 'WEBP') return 'webp';
  if (o.length >= 6 && String.fromCharCode(...o.slice(0, 6)) === 'GIF89a') return 'gif';
  if (o.length >= 12 && String.fromCharCode(...o.slice(4, 8)) === 'ftyp') {
    const marque = String.fromCharCode(...o.slice(8, 12));
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(marque)) return 'heic';
    if (marque === 'avif' || marque === 'avis') return 'avif';
  }
  return null;
}
/** Est-ce un fichier HEIC (iPhone), par son type ou son nom ? (l'écran le convertit en JPEG avant l'envoi). PUR. */
export const estHeic = (nom: string, type: string | null | undefined): boolean => /heic|heif/i.test(type ?? '') || /\.(heic|heif)$/i.test(nom);

/** Le texte enregistré SANS sa section « Photos » (la fenêtre montre les photos à part, chacune sous sa vignette). PUR. */
export function texteSansPhotos(texte: string): string {
  const lignes = texte.split(/\r?\n/);
  const i = lignes.findIndex((l) => l.trim() === TITRE_PHOTOS);
  if (i < 0) return texte;
  let j = i + 1;
  while (j < lignes.length && lignes[j].trim() === '') j += 1; // les paragraphes du mail sont séparés d'une ligne vide
  if (!/^Photo 1 — /.test((lignes[j] ?? '').trim())) return texte;
  while (j < lignes.length && /^Photo \d+ — /.test(lignes[j].trim())) j += 1;
  return [...lignes.slice(0, i), ...lignes.slice(j)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
