import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { estHeic, formatImage, legendesDuTexte, nomFichierPhoto, paragraphesPhotos, refusPhotos, texteSansPhotos } from './photosCompteRendu';
import { preparerPhoto } from './photosCompteRenduServeur';

/**
 * 🔴🔴 Arno (13/11/2026, lot B) — les photos du compte rendu de pré-visite : LÉGENDE OBLIGATOIRE, structure « Photo 1 — légende », format lu
 * dans les octets (HEIC reconnu), et au serveur : réduite, ré-encodée en JPEG, 🔴 localisation GPS et métadonnées RETIRÉES.
 */
describe('la légende obligatoire', () => {
  it('chaque photo doit avoir une légende : la première sans légende est désignée (son rang) — rien ne part', () => {
    expect(refusPhotos([{ legende: 'Rayure parquet chambre' }, { legende: '  ' }, { legende: '' }])).toEqual({
      motif: 'La photo 2 n’a pas de légende : chaque photo doit être légendée avant l’envoi.', rang: 1 });
    expect(refusPhotos([{ legende: undefined }])?.rang).toBe(0);
    expect(refusPhotos([{ legende: 'x'.repeat(201) }])?.motif).toMatch(/dépasse 200/);
    expect(refusPhotos(Array.from({ length: 21 }, () => ({ legende: 'a' })))?.motif).toMatch(/Au plus 20 photos/);
    expect(refusPhotos([{ legende: 'Joint douche' }])).toBeNull();
    expect(refusPhotos([])).toBeNull();
  });
});

describe('la structure : le texte, puis « Photos », chaque photo numérotée avec sa légende', () => {
  it('paragraphes, nom de pièce jointe, relecture et texte sans la section', () => {
    const p = paragraphesPhotos([{ legende: 'Rayure parquet chambre' }, { legende: 'Joint de la douche à refaire' }]);
    expect(p).toEqual(['Photos', 'Photo 1 — Rayure parquet chambre\nPhoto 2 — Joint de la douche à refaire']);
    expect(nomFichierPhoto(0, 'Rayure parquet chambre')).toBe('Photo-1-rayure-parquet-chambre.jpg');
    expect(nomFichierPhoto(1, 'Joint de la douche à refaire !')).toBe('Photo-2-joint-de-la-douche-a-refaire.jpg');
    expect(nomFichierPhoto(2, '???')).toBe('Photo-3.jpg');
    const texte = `Logement en bon état.\n\n${p.join('\n\n')}\n\nMail envoyé par Arno`;
    expect(legendesDuTexte(texte)).toEqual(['Rayure parquet chambre', 'Joint de la douche à refaire']);
    expect(texteSansPhotos(texte)).toBe('Logement en bon état.\n\nMail envoyé par Arno');
    expect(legendesDuTexte('Sans photo')).toEqual([]);
    expect(texteSansPhotos('Photos de la cuisine à prévoir')).toBe('Photos de la cuisine à prévoir');
  });
});

describe('le format, par les octets', () => {
  it('JPEG, PNG, WebP, 🔴 HEIC (iPhone), AVIF ; autre chose : null', () => {
    const ftyp = (m: string) => new Uint8Array([0, 0, 0, 24, ...[...'ftyp'].map((c) => c.charCodeAt(0)), ...[...m].map((c) => c.charCodeAt(0))]);
    expect(formatImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(formatImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(formatImage(ftyp('heic'))).toBe('heic');
    expect(formatImage(ftyp('mif1'))).toBe('heic');
    expect(formatImage(ftyp('avif'))).toBe('avif');
    expect(formatImage(new TextEncoder().encode('%PDF-1.7 …'))).toBeNull();
    expect([estHeic('IMG_0001.HEIC', ''), estHeic('a.jpg', 'image/heic'), estHeic('a.jpg', 'image/jpeg')]).toEqual([true, true, false]);
  });
});

describe('🔴 au serveur : réduite, JPEG, GPS et métadonnées retirés', () => {
  const photoAvecGps = (l: number, h: number) => sharp({ create: { width: l, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .withExif({ IFD0: { Make: 'Apple', Model: 'iPhone 15' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 53/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 15/1 0/1' } })
    .jpeg().toBuffer();
  it('la photo d’origine porte bien un GPS ; préparée : PLUS AUCUNE métadonnée EXIF (ni GPS, ni appareil)', async () => {
    const brute = await photoAvecGps(800, 600);
    expect((await sharp(brute).metadata()).exif).toBeDefined();
    expect((await sharp(brute).metadata()).exif!.toString('latin1')).toContain('iPhone 15');
    const p = await preparerPhoto(brute);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const m = await sharp(p.octets).metadata();
    expect(m.format).toBe('jpeg');
    expect(m.exif).toBeUndefined();
    expect(p.octets.toString('latin1')).not.toMatch(/iPhone 15|GPS/);
  });
  it('réduite à 1 600 px au plus (proportions gardées), ~500 Ko au plus ; jamais agrandie', async () => {
    const p = await preparerPhoto(await photoAvecGps(4032, 3024));
    expect(p).toMatchObject({ ok: true, largeur: 1600, hauteur: 1200 });
    if (p.ok) expect(p.octets.byteLength).toBeLessThanOrEqual(500 * 1024);
    expect(await preparerPhoto(await photoAvecGps(400, 300))).toMatchObject({ ok: true, largeur: 400, hauteur: 300 });
  });
  it('un PNG devient un JPEG ; un fichier qui n’est pas une image, un HEIC non converti, une photo vide : refusés, motif clair', async () => {
    const png = await sharp({ create: { width: 50, height: 40, channels: 4, background: '#0a0' } }).png().toBuffer();
    const p = await preparerPhoto(png);
    expect(p.ok && (await sharp(p.octets).metadata()).format).toBe('jpeg');
    expect(await preparerPhoto(new TextEncoder().encode('%PDF-1.7 pas une image'))).toEqual({ ok: false, motif: 'Ce fichier n’est pas une photo (JPEG, PNG, WebP ou HEIC de l’iPhone).' });
    const heic = new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect(await preparerPhoto(heic)).toMatchObject({ ok: false, motif: expect.stringContaining('HEIC non convertie') });
    expect(await preparerPhoto(new Uint8Array())).toEqual({ ok: false, motif: 'La photo est vide.' });
    expect(await preparerPhoto(new Uint8Array(11 * 1024 * 1024))).toMatchObject({ ok: false, motif: expect.stringContaining('dépasse 10 Mo') });
  });
});
