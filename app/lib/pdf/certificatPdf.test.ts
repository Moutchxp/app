import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { genererCertificatPdf, urlQr, urlClaire, type DonneesCertificatPdf } from './certificatPdf';
import { MENTION_EMETTEUR, MENTION_DEFINITION, MENTION_DECOUPLAGE, MENTION_MARQUE } from './mentions';

const JETON = 'ABCDEFGHJKMNPQRS';
const EMIS = new Date('2026-07-15T09:30:00.000Z');

let cartePng: Buffer;
let photoJpeg: Buffer;
beforeAll(async () => {
  cartePng = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#dddddd' } }).png().toBuffer();
  photoJpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
});

function donnees(over: Partial<DonneesCertificatPdf> = {}): DonneesCertificatPdf {
  return {
    numero: 'SAVV-2026-000007',
    emisLe: EMIS,
    verdict: 'SANS_VIS_A_VIS',
    adresse: '12 rue des Fleurs, 92004',
    etage: 3,
    jeton: JETON,
    cartePng,
    photoJpeg,
    urlBase: 'https://www.sansvisavis.com',
    ...over,
  };
}

describe('urlQr / urlClaire — le jeton ne vit QUE dans le QR', () => {
  it('urlQr contient le numéro ET le jeton', () => {
    const u = urlQr('https://x.com', 'SAVV-2026-000007', JETON);
    expect(u).toContain('n=SAVV-2026-000007');
    expect(u).toContain(`j=${JETON}`);
  });
  it('urlClaire contient le numéro mais JAMAIS le jeton', () => {
    const u = urlClaire('https://x.com', 'SAVV-2026-000007');
    expect(u).toContain('n=SAVV-2026-000007');
    expect(u).not.toContain(JETON);
    expect(u).not.toContain('j=');
  });
  it('slash final de l’URL de base normalisé (pas de //verifier)', () => {
    expect(urlClaire('https://x.com/', 'N')).toBe('https://x.com/verifier?n=N');
  });
});

describe('genererCertificatPdf — PDF valide', () => {
  it('avec photo → PDF valide (%PDF … %%EOF), poids non trivial', async () => {
    const buf = await genererCertificatPdf(donnees());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('SANS photo (null) → document correct quand même', async () => {
    const buf = await genererCertificatPdf(donnees({ photoJpeg: null }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('adresse et étage null → pas de crash, PDF valide', async () => {
    const buf = await genererCertificatPdf(donnees({ adresse: null, etage: null, photoJpeg: null }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('genererCertificatPdf — DÉTERMINISME (exigence dure)', () => {
  it('deux générations, MÊMES entrées → MÊMES octets', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees());
    expect(a.equals(b)).toBe(true);
  });

  it('emisLe différent → octets différents (CreationDate/ModDate/ID figés dessus)', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees({ emisLe: new Date('2026-07-16T09:30:00.000Z') }));
    expect(a.equals(b)).toBe(false);
  });

  it('jeton différent → octets différents (le QR reflète le jeton)', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees({ jeton: 'ZZZZZZZZZZZZZZZZ' }));
    expect(a.equals(b)).toBe(false);
  });
});

describe('mentions légales — faits présents', () => {
  // Les mentions emploient des espaces INSÉCABLES (typographie FR) → `\s` matche aussi U+00A0.
  it('émetteur CRITERIMMO + RCS + garantie GALIAN + carte T', () => {
    expect(MENTION_EMETTEUR).toContain('CRITERIMMO');
    expect(MENTION_EMETTEUR).toMatch(/521\s514\s968/);
    expect(MENTION_EMETTEUR).toContain('GALIAN');
    expect(MENTION_EMETTEUR).toContain('42475T');
  });
  it('définition normative : 40 mètres + géométrique', () => {
    expect(MENTION_DEFINITION).toMatch(/40\smètres/);
    expect(MENTION_DEFINITION).toContain('géométrique');
  });
  it('découplage explicite photo/verdict', () => {
    expect(MENTION_DECOUPLAGE.toLowerCase()).toContain('photographique');
    expect(MENTION_DECOUPLAGE.toLowerCase()).toContain('géométrie');
  });
  it('marque déposée de CRITERIMMO', () => {
    expect(MENTION_MARQUE).toContain('marque déposée');
    expect(MENTION_MARQUE).toContain('CRITERIMMO');
  });
});
