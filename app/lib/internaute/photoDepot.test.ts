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
