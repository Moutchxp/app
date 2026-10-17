/**
 * ══ 🔴🔴 LOT CERTIFICAT-PHOTO — DE BOUT EN BOUT : LA PHOTO EST DANS LE PDF ÉMIS (base jetable, aucun envoi réel) ═════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_photo npx vitest run --config vitest.integration.config.ts \
 *     app/lib/tunnel/photoCertificat.itest.ts
 *
 * VRAIES routes (ingestion `/api/internaute`, dépôt `/api/internaute/photo`, émission `/api/certificat`), VRAIE base
 * (copie jetable), VRAIE recompression de la photo, VRAI certificat immuable, VRAI PDF. Ce qui est remplacé, et rien
 * d'autre : le STOCKAGE (un seau en mémoire à la place de MinIO), le RE-JEU géométrique (la base jetable n'a pas le
 * LiDAR ; le verdict n'est pas l'objet du test) et la carte IGN (réseau). Le mail : `after()` n'existe pas hors d'une
 * requête Next → l'envoi n'est pas programmé (aucun mail, ni réel ni intercepté).
 *
 *   ① parcours CORRIGÉ : dépôt de la photo et émission lancés ENSEMBLE, l'émission passant par `emettreApresPhoto`
 *      (exactement ce que fait la page) → le certificat a sa photo, et les octets de la photo sont DANS le PDF ;
 *   ② le DÉFAUT reproduit : émission avant la fin du dépôt → certificat sans photo, PDF sans photo (preuve que ①
 *      échouerait sans l'attente).
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SEAU = new Map<string, Buffer>();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class S3Client {
    async send(cmd: { input: { Key?: string; Body?: Buffer | Uint8Array } }) {
      const cle = cmd.input.Key ?? '';
      if (cmd instanceof orig.PutObjectCommand) { SEAU.set(cle, Buffer.from(cmd.input.Body as Uint8Array)); return {}; }
      if (cmd instanceof orig.GetObjectCommand) {
        const b = SEAU.get(cle);
        if (!b) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return { Body: { transformToByteArray: async () => new Uint8Array(b) } };
      }
      return {};
    }
  }
  return { ...orig, S3Client };
});
/* Re-jeu géométrique : un verdict SANS_VIS_A_VIS fixe (la base jetable n'a pas le LiDAR). */
vi.mock('../db/pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/pipeline')>()),
  analyserAdresse: async () => ({
    validation: { altitudeTerrainOrigineM: 31.2, altSolBdTopoM: null, batimentOrigine: null },
    resultat: {
      verdict: { verdict: 'SANS_VIS_A_VIS', distanceM: 120.5, obstacle: null },
      score: { total: 55.5, famille1: { detail: { moyenneProfondeurM: 98.1, pourcentageFaisceauxDegages: 80 } } },
    },
  }),
}));
/* Carte d'orientation : une petite image déposée par le VRAI dépôt, comme le ferait la carte IGN. */
vi.mock('../carte/publierCarteOrientation', () => ({
  publierCarteOrientation: async (internauteId: string, certificatId: number) => {
    const { default: sharp } = await import('sharp');
    const { deposer } = await import('../stockage');
    const { query } = await import('../db/client');
    const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#88aa88' } }).png().toBuffer();
    const { cle } = await deposer(png, 'image/png', { internauteId });
    await query('UPDATE certificat_acheminement SET carte_orientation_cle = $1 WHERE certificat_id = $2', [cle, certificatId]);
  },
}));

const baseJetable = (() => { try { return new URL(process.env.DATABASE_URL ?? '').pathname.startsWith('/svav_jetable'); } catch { return false; } })();

process.env.S3_ENDPOINT = 'http://seau-en-memoire.invalid';
process.env.S3_BUCKET = 'essai';
process.env.S3_ACCESS_KEY_ID = 'essai';
process.env.S3_SECRET_ACCESS_KEY = 'essai';
process.env.SITE_URL = 'https://sansvisavis.com';
process.env.SVAV_RECETTE = '1';
process.env.INTERNAUTE_TOKEN_SECRET ??= 'secret-de-test-photo-certificat-0123456789abcdef';

const SUFFIXE = Date.now().toString(36);
const projet = {
  versionTunnel: 1,
  payload: { typeBien: 'Appartement', surface: '60', nbPieces: 3, epoque: '1970-1990', terrasse: false, balcon: true, jardin: false, adresseResidence: null },
  verdict: 'SANS_VIS_A_VIS', score: 55.5, etage: 2, dernierEtage: false, residencePrincipale: true,
  communeInsee: '92004', lat: 48.90699661314679, lon: 2.269452638779335, adresseSaisie: 'essai photo certificat',
  adresseNormalisee: 'essai photo certificat', azimutDeg: 351.83333333333337, hauteurSousPlafondM: 2.7,
  hauteurVisionM: 2 * (2.7 + 0.3) + 1.65, modeOrigine: 'semi_auto',
};
const requete = (b: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

let photoDataUrl = '';
beforeAll(async () => {
  if (!baseJetable) return;
  const { default: sharp } = await import('sharp');
  // Une vraie photo (dégradé de couleurs), comme celle du téléphone : JPEG en data URL.
  const w = 640; const h = 480; const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { px[i * 3] = (i % w) % 256; px[i * 3 + 1] = Math.floor(i / w) % 256; px[i * 3 + 2] = 128; }
  const jpeg = await sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  photoDataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
});
afterAll(async () => { if (baseJetable) await (await import('../db/client')).closePool(); });

async function ingerer(email: string): Promise<{ jeton: string; projetId: number }> {
  const { POST } = await import('../../api/internaute/route');
  const r = await POST(requete({ identite: { prenom: 'Essai', nom: 'Photo', email, telephone: '+33612345678' }, consentements: [], projet }));
  const d = (await r.json()) as { jetonEmission?: string; projetId?: number };
  expect(r.status).toBe(200);
  return { jeton: d.jetonEmission!, projetId: d.projetId! };
}
const deposerPhoto = async (jeton: string, projetId: number) => {
  const { POST } = await import('../../api/internaute/photo/route');
  const r = await POST(requete({ jeton, projetId, photo: photoDataUrl }));
  expect(await r.json()).toMatchObject({ ok: true, depose: true });
};
const emettre = async (jeton: string, projetId: number): Promise<boolean> => {
  const { POST } = await import('../../api/certificat/route');
  const r = await POST(requete({ jeton, projetId }));
  return r.ok;
};
async function pdfEtPhoto(projetId: number): Promise<{ pdf: Buffer; photo: Buffer | null; images: number }> {
  const { query } = await import('../db/client');
  const { rows } = await query<{ photo_cle: string | null; pdf_cle: string | null }>(
    `SELECT c.photo_cle, a.pdf_cle FROM certificat c JOIN certificat_acheminement a ON a.certificat_id = c.id WHERE c.projet_id = $1`, [projetId]);
  expect(rows[0]?.pdf_cle).toBeTruthy();
  const pdf = SEAU.get(rows[0].pdf_cle!)!;
  return { pdf, photo: rows[0].photo_cle ? SEAU.get(rows[0].photo_cle) ?? null : null, images: (pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length };
}

describe.skipIf(!baseJetable)('🔴 la photo du tunnel est DANS le certificat PDF émis', () => {
  let imagesAvecPhoto = 0;
  it('① parcours corrigé : dépôt et émission lancés ensemble, l’émission attend la photo → photo dans le PDF', async () => {
    const { emettreApresPhoto } = await import('./photoAvantEmission');
    const { jeton, projetId } = await ingerer(`photo.ok.${SUFFIXE}@exemple.test`);
    const depot = deposerPhoto(jeton, projetId); // lancé, NON attendu (comme la page)
    expect(await emettreApresPhoto(depot, () => emettre(jeton, projetId))).toBe(true);
    const { pdf, photo, images } = await pdfEtPhoto(projetId);
    expect(photo).not.toBeNull();
    expect(pdf.indexOf(photo!)).toBeGreaterThan(0); // les octets JPEG de la photo sont embarqués tels quels dans le PDF
    imagesAvecPhoto = images;
    // Pour la vérification à l'œil (facultatif) : le PDF émis, déposé là où on le demande (.captures/…).
    if (process.env.PHOTO_PDF_SORTIE) (await import('node:fs')).writeFileSync(process.env.PHOTO_PDF_SORTIE, pdf);
  }, 120_000);

  it('② le défaut reproduit : émission avant la fin du dépôt → certificat et PDF SANS photo', async () => {
    const { jeton, projetId } = await ingerer(`photo.course.${SUFFIXE}@exemple.test`);
    expect(await emettre(jeton, projetId)).toBe(true); // ce que faisait l'internaute connecté depuis a285cedc
    await deposerPhoto(jeton, projetId); // la photo arrive APRÈS : le certificat immuable ne la verra jamais
    const { photo, images } = await pdfEtPhoto(projetId);
    expect(photo).toBeNull();
    expect(images).toBe(imagesAvecPhoto - 1); // exactement une image de moins : la photo
  }, 120_000);
});
