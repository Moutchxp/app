import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { genererCertificatPdf, urlQr, scoreLabel, jeton4x4, type DonneesCertificatPdf } from './certificatPdf';
import { MENTION_EMETTEUR, MENTION_DEFINITION, MENTION_DECOUPLAGE, MENTION_MARQUE } from './mentions';

const JETON = 'ABCDEFGHJKMNPQRS';
const EMIS = new Date('2026-07-14T12:32:00.000Z');

let cartePng: Buffer;
let photoJpeg: Buffer;
beforeAll(async () => {
  cartePng = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#dddddd' } }).png().toBuffer();
  photoJpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
});

function donnees(over: Partial<DonneesCertificatPdf> = {}): DonneesCertificatPdf {
  return {
    numero: 'SAVV-2026-000123',
    reference: 'SVAV-K7M2-9QX4',
    emission: '14 juillet 2026 à 14:32',
    dateAnalyse: '14 juillet 2026',
    porteeAnalyse: '200 m',
    champAnalyseDeg: '180°',
    siteWeb: 'www.sansvisavis.com',
    urlVerification: 'sansvisavis.com/verifier',
    verdictCertifie: true,
    score: { valeur: 82, note: 'Le label de qualité s’affiche à partir de 60/100. Il n’affecte pas le verdict.' },
    demandeur: { nom: 'Jean Dupont', email: 'jean.dupont@email.fr', telephone: '06 12 34 56 78' },
    bien: { adresse: '34 rue de Turenne, 75003 Paris', cadastre: '000 AB 123', type: 'Appartement', usage: 'Habitation principale' },
    photo: { azimut: '123,4°', mode: 'snapping façade', champ: '180° horizontal' },
    empreinteCoordonnees: [['Latitude', '48.858370'], ['Longitude', '2.362350'], ['Alt. terrain (NGF)', '35,2 m'], ['Alt. sol (BD TOPO)', '34,8 m']],
    empreintePosition: [['Étage', '4ᵉ étage'], ['Dernier étage', 'Non'], ['Sous-plafond déclaré', '2,50 m'], ['Hauteur de vision', '12,85 m'], ['Champ analysé', '180°']],
    empreinteCaracteristiques: [['Surface', '72,35 m²'], ['Pièces', '3'], ['Année', '2008'], ['Extérieur', 'Balcon']],
    analyseResultat: [['Obstacle face détecté', '> 200 m'], ['Moyenne faisceaux', '187,4 m']],
    carteLegende: 'Plan IGN · portée 200 m',
    pied: 'Certificat délivré par le système d’analyse géométrique Sans Vis-à-Vis®.',
    emisLe: EMIS,
    jeton: JETON,
    urlBase: 'https://www.sansvisavis.com',
    cartePng,
    photoJpeg,
    ...over,
  };
}

/** Nombre de pages (compte les objets /Page dans le flux). */
function nbPages(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('helpers purs', () => {
  it('urlQr encode numéro + jeton', () => {
    const u = urlQr('https://x.com/', 'SAVV-2026-000123', JETON);
    expect(u).toBe(`https://x.com/verifier?n=SAVV-2026-000123&j=${JETON}`);
  });

  it('scoreLabel — règle du modèle (75 / 60)', () => {
    expect(scoreLabel(82)).toBe('Vue exceptionnelle');
    expect(scoreLabel(75)).toBe('Vue exceptionnelle');
    expect(scoreLabel(74)).toBe('Excellente vue');
    expect(scoreLabel(60)).toBe('Excellente vue');
    expect(scoreLabel(59)).toBeNull();
  });

  it('jeton4x4 groupe 16 car. en 4 blocs de 4', () => {
    expect(jeton4x4('ABCDEFGHJKMNPQRS')).toBe('ABCD EFGH JKMN PQRS');
  });
});

describe('genererCertificatPdf — PDF valide, UNE page', () => {
  it('nominal → PDF valide (%PDF … %%EOF), une seule page', async () => {
    const buf = await genererCertificatPdf(donnees());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(nbPages(buf)).toBe(1);
    expect(buf.length).toBeGreaterThan(10000);
  });

  it('demandeur = null + tas A null (usage, mode, extérieur, photo) → PDF valide, une page, aucun "undefined"', async () => {
    const buf = await genererCertificatPdf(
      donnees({
        demandeur: null,
        bien: { adresse: '34 rue de Turenne, 75003 Paris', cadastre: null, type: 'Appartement', usage: null },
        photo: { azimut: '123,4°', mode: null, champ: '180° horizontal' },
        photoJpeg: null,
        empreinteCaracteristiques: [['Surface', '72,35 m²'], ['Pièces', '3'], ['Année', '2008']],
      }),
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nbPages(buf)).toBe(1);
    // Le flux est compressé, mais on s'assure qu'aucune fuite « undefined »/« null » ne traverse en clair.
    expect(buf.toString('latin1')).not.toContain('undefined');
  });

  it('verdict NON certifié → PDF valide, une page (pastille grise, pas le logo)', async () => {
    const buf = await genererCertificatPdf(donnees({ verdictCertifie: false }));
    expect(nbPages(buf)).toBe(1);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('genererCertificatPdf — DÉTERMINISME (exigence dure)', () => {
  it('deux générations, MÊMES entrées → MÊMES octets (polices embarquées comprises)', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees());
    expect(a.equals(b)).toBe(true);
  });

  it('emisLe différent → octets différents (CreationDate/ModDate/ID figés dessus)', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees({ emisLe: new Date('2026-07-15T12:32:00.000Z') }));
    expect(a.equals(b)).toBe(false);
  });

  it('jeton différent → octets différents (le QR reflète le jeton)', async () => {
    const a = await genererCertificatPdf(donnees());
    const b = await genererCertificatPdf(donnees({ jeton: 'ZZZZZZZZZZZZZZZZ' }));
    expect(a.equals(b)).toBe(false);
  });
});

describe('mentions légales — faits présents (mentions.ts)', () => {
  it('émetteur CRITERIMMO + RCS + GALIAN', () => {
    expect(MENTION_EMETTEUR).toContain('CRITERIMMO');
    expect(MENTION_EMETTEUR).toMatch(/521\s514\s968/);
    expect(MENTION_EMETTEUR).toContain('GALIAN');
  });
  it('définition : 40 mètres + géométrique', () => {
    expect(MENTION_DEFINITION).toMatch(/40\smètres/);
    expect(MENTION_DEFINITION).toContain('géométrique');
  });
  it('découplage photo/verdict + marque déposée', () => {
    expect(MENTION_DECOUPLAGE.toLowerCase()).toContain('photographique');
    expect(MENTION_MARQUE).toContain('marque déposée');
  });
});
