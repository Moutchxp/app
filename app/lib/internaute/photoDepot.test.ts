import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { decoderBase64, estImage, degraderPhoto, COTE_LONG_MAX_PX } from './photoDepot';

describe('decoderBase64', () => {
  it('data URL → Buffer non vide', () => {
    const b64 = Buffer.from('abc').toString('base64');
    const buf = decoderBase64(`data:image/jpeg;base64,${b64}`);
    expect(buf).not.toBeNull();
    expect(buf!.toString()).toBe('abc');
  });
  it('base64 nu (sans préfixe) → Buffer', () => {
    const buf = decoderBase64(Buffer.from('xyz').toString('base64'));
    expect(buf!.toString()).toBe('xyz');
  });
  it.each([['non-string', 42], ['null', null], ['undefined', undefined], ['vide', '']])('%s → null', (_l, v) => {
    expect(decoderBase64(v)).toBeNull();
  });
});

describe('estImage — type MIME RÉEL déduit du contenu', () => {
  it('vrai JPEG → true', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    expect(await estImage(jpeg)).toBe(true);
  });
  it('vrai PNG → true', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#00000000' } }).png().toBuffer();
    expect(await estImage(png)).toBe(true);
  });
  it('octets quelconques (non-image) → false', async () => {
    expect(await estImage(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(false);
  });
});

describe('degraderPhoto — master JPEG, orientation appliquée, EXIF/GPS retirés', () => {
  it('applique l’orientation EXIF DANS les pixels (120×60 orient. 6 → 60×120)', async () => {
    const entree = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#a30402' } })
      .jpeg()
      .withMetadata({ orientation: 6 }) // 6 = rotation 90° → l'image « logique » est 60×120
      .toBuffer();
    const meta = await sharp(await degraderPhoto(entree)).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(60); // dimensions PIVOTÉES (orientation cuite dans les pixels)
    expect(meta.height).toBe(120);
  });

  it('RETIRE toute métadonnée EXIF (l’entrée en a, la sortie n’en a plus → GPS parti avec)', async () => {
    const entree = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#2e9e5b' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { ImageDescription: 'test-exif-gps' } } })
      .toBuffer();
    expect((await sharp(entree).metadata()).exif).toBeInstanceOf(Buffer); // l'ENTRÉE porte un bloc EXIF
    const metaSortie = await sharp(await degraderPhoto(entree)).metadata();
    expect(metaSortie.exif).toBeUndefined(); // la SORTIE n'a AUCUN EXIF (orientation + GPS inclus → retirés)
    expect(metaSortie.orientation).toBeUndefined();
  });

  it('borne le côté long à 1600 px (grande image réduite, sans agrandir une petite)', async () => {
    const grande = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#333333' } }).jpeg().toBuffer();
    const m = await sharp(await degraderPhoto(grande)).metadata();
    expect(Math.max(m.width!, m.height!)).toBe(COTE_LONG_MAX_PX); // 3000 → 1600
    const petite = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#333333' } }).jpeg().toBuffer();
    const mp = await sharp(await degraderPhoto(petite)).metadata();
    expect(mp.width).toBe(100); // pas d'agrandissement
    expect(mp.height).toBe(80);
  });
});

/**
 * 🔴 LOT CERTIFICAT-PHOTO (Arno, 17/10/2026) — deux photos de 4 Ko en production (certificats 474 et 475). Le dépôt ne
 * doit JAMAIS fabriquer une miniature ni une image vide : une photo du téléphone ressort au côté long 1600 px, avec ses
 * détails. Et une vue de NUIT, presque uniforme, pèse naturellement quelques Ko une fois recompressée (mesuré ici).
 */
describe('🔴 la photo déposée n’est ni une miniature ni une image vide', () => {
  const scene = (w: number, h: number, lum: number, bruit: number) => {
    const px = Buffer.alloc(w * h * 3);
    let x = 12345;
    for (let i = 0; i < px.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff; // pseudo-aléa déterministe
      px[i] = Math.max(0, Math.min(255, lum + Math.round(((x % 1000) / 1000 - 0.5) * bruit)));
    }
    return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  };
  /* Une vue de jour : façades (blocs), ciel (dégradé), détails fins (rayures) — ce qui survit à la réduction. */
  const vueDeJour = (w: number, h: number) => {
    const px = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const facade = (Math.floor(x / 64) + Math.floor(y / 48)) % 3;
      px[i] = y < h / 3 ? 120 + Math.floor((80 * y) / h) : 60 + facade * 50 + ((x >> 2) % 2) * 25;
      px[i + 1] = y < h / 3 ? 160 : 70 + facade * 40 + ((y >> 2) % 2) * 25;
      px[i + 2] = y < h / 3 ? 220 : 50 + facade * 30;
    }
    return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  };
  it('photo de jour d’un iPhone (4032 × 3024) : 1600 × 1200, détails conservés, bien plus que 4 Ko', async () => {
    const out = await degraderPhoto(await vueDeJour(4032, 3024));
    const m = await sharp(out).metadata();
    const s = await sharp(out).stats();
    expect([m.width, m.height]).toEqual([1600, 1200]);
    expect(s.channels[0].stdev).toBeGreaterThan(20); // pas une image vide (uniforme)
    expect(out.byteLength).toBeGreaterThan(20_000);
  });
  it('photo déjà petite (1280 × 720) : jamais agrandie, jamais réduite en miniature', async () => {
    const m = await sharp(await degraderPhoto(await vueDeJour(1280, 720))).metadata();
    expect([m.width, m.height]).toEqual([1280, 720]);
  });
  it('vue de NUIT presque noire (1920 × 1440) : pleine taille, mais quelques Ko seulement — c’est normal', async () => {
    const out = await degraderPhoto(await scene(1920, 1440, 4, 6));
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([1600, 1200]);
    expect(out.byteLength).toBeLessThan(40_000);
  });
});
