import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { genererCertificatPdf, urlQr, scoreLabel, jeton4x4, type DonneesCertificatPdf } from './certificatPdf';
import { MENTION_EMETTEUR, MENTION_DEFINITION, MENTION_DECOUPLAGE, MENTION_MARQUE } from './mentions';

const JETON = 'ABCDEFGHJKMNPQRS';
const EMIS = new Date('2026-07-14T12:32:00.000Z');

/**
 * Assertion de DÉTERMINISME INSTRUMENTÉE — l'égalité reste `Buffer.equals` INTÉGRALE (jamais affaiblie). Le flake historique
 * (échec intermittent en suite complète, cause NON ÉTABLIE, générateur prouvé déterministe) était MUET : `expect(a.equals(b))`
 * ne disait rien de la divergence. Ici, en cas d'inégalité, on produit un message exploitable (longueurs, nombre d'octets
 * divergents, 5 premiers offsets, contexte ASCII ±60 du 1er) ET on dépose les DEUX buffers dans os.tmpdir() (noms horodatés)
 * pour analyse hors ligne. L'écriture disque est enveloppée : si elle échoue, on le SIGNALE — jamais elle ne masque l'échec
 * d'origine (l'`expect` final rejoue et fait échouer l'assertion dans tous les cas).
 */
function attendreIdentiques(a: Buffer, b: Buffer, libelle: string): void {
  if (a.equals(b)) return; // chemin nominal : silencieux
  let total = 0;
  const premiers: number[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) { total++; if (premiers.length < 5) premiers.push(i); }
  const o0 = premiers[0] ?? 0;
  const ascii = (buf: Buffer) =>
    buf.subarray(Math.max(0, o0 - 60), Math.min(buf.length, o0 + 60)).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  const lignes = [
    `DÉTERMINISME ROMPU — ${libelle}`,
    `longueur(a)=${a.length}  longueur(b)=${b.length}  octets divergents=${total}`,
    `5 premiers offsets divergents: ${premiers.join(', ')}`,
    `contexte ±60 octets au 1er offset (${o0}) :`,
    `  a='${ascii(a)}'`,
    `  b='${ascii(b)}'`,
  ];
  try {
    const slug = libelle.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
    const ts = new Date(EMIS).getTime() + total + o0; // suffixe stable-ish (pas d'horloge : reste unique par cas + divergence)
    const pa = join(tmpdir(), `svav-flake-${slug}-${ts}-a.pdf`);
    const pb = join(tmpdir(), `svav-flake-${slug}-${ts}-b.pdf`);
    writeFileSync(pa, a);
    writeFileSync(pb, b);
    lignes.push(`buffers dumpés :`, `  ${pa}`, `  ${pb}`);
  } catch (e) {
    lignes.push(`(échec d'écriture du dump — NON bloquant : ${e instanceof Error ? e.message : String(e)})`);
  }
  // L'assertion rejoue et échoue TOUJOURS (le dump ne la remplace pas) ; le message porte le diagnostic.
  expect(a.equals(b), lignes.join('\n')).toBe(true);
}

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
    coneCentralDeg: '90°',
    siteWeb: 'www.sansvisavis.com',
    urlVerification: 'sansvisavis.com/verifier',
    verdictCertifie: true,
    aUnCompte: true,
    anonymise: false,
    score: { valeur: 82, note: 'Le label de qualité s’affiche à partir de 60/100. Il n’affecte pas le verdict.' },
    demandeur: { nom: 'Jean Dupont', adresse: '34 rue de Turenne, 75003 Paris', email: 'jean.dupont@email.fr', telephone: '06 12 34 56 78' },
    bien: { adresse: '34 rue de Turenne, 75003 Paris', cadastre: '000 AB 123', type: 'Appartement', usage: 'Habitation principale' },
    photo: { azimut: '123,4°', mode: 'snapping façade', champ: '180° horizontal' },
    empreinteCoordonnees: [['Latitude', '48.858370'], ['Longitude', '2.362350'], ['Alt. terrain (NGF)', '35,2 m'], ['Alt. sol (BD TOPO)', '34,8 m']],
    empreintePosition: [['Étage', '5e étage'], ['Dernier étage', 'Non'], ['Sous-plafond déclaré', '2,50 m'], ['Hauteur de vision', '12,85 m'], ['Champ analysé', '180°']],
    empreinteCaracteristiques: [['Surface', '72,35 m²'], ['Pièces', '3'], ['Chambres', '—'], ['Année', '2008'], ['Extérieur', 'Balcon']],
    analyseResultat: [['Obstacle face détecté', '> 200 m'], ['Moyenne faisceaux', '187,4 m'], ['Analyses LiDAR', '—']],
    qualiteVue: [['Dégagement', '—'], ['Ouverture', '—'], ['Végétation', '—'], ['Patrimoine', '—'], ['Ciel', '—']],
    nuisances: [['Ligne haute tension', '—'], ['Site industriel (ICPE)', '—'], ['Antenne / Relais', '—'], ['Axe routier majeur', '—'], ["Source d'eau", '—']],
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

  it('urlQr — typeDoc absent → URL STRICTEMENT inchangée (pas de &doc)', () => {
    const u = urlQr('https://x.com/', 'SAVV-2026-000123', JETON, undefined);
    expect(u).toBe(`https://x.com/verifier?n=SAVV-2026-000123&j=${JETON}`);
    expect(u).not.toContain('doc=');
  });

  it('urlQr — typeDoc fourni → ajoute &doc=<type> (encodé) à la fin', () => {
    expect(urlQr('https://x.com/', 'SAVV-2026-000123', JETON, 'anonyme')).toBe(
      `https://x.com/verifier?n=SAVV-2026-000123&j=${JETON}&doc=anonyme`,
    );
    expect(urlQr('https://x.com/', 'SAVV-2026-000123', JETON, 'visuel')).toBe(
      `https://x.com/verifier?n=SAVV-2026-000123&j=${JETON}&doc=visuel`,
    );
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
    attendreIdentiques(a, b, 'nominal : deux générations identiques');
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

describe('genererCertificatPdf — gabarit ONE-SHOT (aUnCompte:false)', () => {
  it('PDF valide, UNE seule page', async () => {
    const buf = await genererCertificatPdf(donnees({ aUnCompte: false }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(nbPages(buf)).toBe(1);
    expect(buf.length).toBeGreaterThan(10000);
  });

  it('DÉTERMINISME : deux générations one-shot identiques → mêmes octets', async () => {
    const a = await genererCertificatPdf(donnees({ aUnCompte: false }));
    const b = await genererCertificatPdf(donnees({ aUnCompte: false }));
    attendreIdentiques(a, b, 'one-shot : deux générations identiques');
  });

  // ANTI-FUITE (le jeton ne transite que par le QR, ~urlQr) : en one-shot le QR est DÉCORATIF (chaîne neutre). Preuve
  // robuste (le flux PDF est compressé + polices sous-settées → une recherche de sous-chaîne serait un faux négatif) :
  // changer le jeton NE DOIT PAS changer d'un octet le PDF one-shot → le jeton n'y est jamais encodé.
  it('le JETON ne fuit jamais : changer le jeton ne change PAS le PDF one-shot', async () => {
    const a = await genererCertificatPdf(donnees({ aUnCompte: false, jeton: 'ABCDEFGHJKMNPQRS' }));
    const b = await genererCertificatPdf(donnees({ aUnCompte: false, jeton: 'ZZZZZZZZZZZZZZZZ' }));
    attendreIdentiques(a, b, 'one-shot : le jeton ne fuit pas (invariance)');
  });

  // Symétrie de non-régression : le gabarit COMPTE, lui, reflète le jeton (QR de vérification) → octets différents.
  it('le gabarit compte reflète le jeton (contraste avec one-shot)', async () => {
    const a = await genererCertificatPdf(donnees({ aUnCompte: true, jeton: 'ABCDEFGHJKMNPQRS' }));
    const b = await genererCertificatPdf(donnees({ aUnCompte: true, jeton: 'ZZZZZZZZZZZZZZZZ' }));
    expect(a.equals(b)).toBe(false);
  });
});

describe('genererCertificatPdf — variante ANONYMISÉE (aUnCompte:true, anonymise:true)', () => {
  const DEM_A = { nom: 'Jean Dupont', adresse: '34 rue de Turenne, 75003 Paris', email: 'jean.dupont@email.fr', telephone: '06 12 34 56 78' };
  const DEM_B = { nom: 'Zoé Martin', adresse: '34 rue de Turenne, 75003 Paris', email: 'zoe.martin@email.fr', telephone: '07 98 76 54 32' };

  it('PDF valide, UNE seule page', async () => {
    const buf = await genererCertificatPdf(donnees({ anonymise: true }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(nbPages(buf)).toBe(1);
    expect(buf.length).toBeGreaterThan(10000);
  });

  it('DÉTERMINISME : deux générations anonymisées identiques → mêmes octets', async () => {
    const a = await genererCertificatPdf(donnees({ anonymise: true }));
    const b = await genererCertificatPdf(donnees({ anonymise: true }));
    attendreIdentiques(a, b, 'anonymisé : deux générations identiques');
  });

  it('diffère du nominatif (badge « Version anonymisée » ajouté + bloc demandeur retiré)', async () => {
    const nominatif = await genererCertificatPdf(donnees({ anonymise: false }));
    const anonyme = await genererCertificatPdf(donnees({ anonymise: true }));
    expect(anonyme.equals(nominatif)).toBe(false);
  });

  // ANTI-FUITE (le flux PDF est compressé + polices sous-settées → une recherche de sous-chaîne serait un faux négatif) :
  // preuve robuste = INVARIANCE. En anonymisé, changer nom/email/téléphone du demandeur NE change PAS un octet (jamais rendus).
  it('non-fuite : nom/email/téléphone du demandeur n’influencent PAS le PDF anonymisé', async () => {
    const a = await genererCertificatPdf(donnees({ anonymise: true, demandeur: DEM_A }));
    const b = await genererCertificatPdf(donnees({ anonymise: true, demandeur: DEM_B }));
    attendreIdentiques(a, b, 'anonymisé : nom/email/téléphone du demandeur sans effet');
    // Robustesse du test : demandeur = null donne aussi le même rendu (aucune trace du demandeur).
    const c = await genererCertificatPdf(donnees({ anonymise: true, demandeur: null }));
    attendreIdentiques(c, a, 'anonymisé : demandeur null = même rendu');
  });

  // Contrôle positif (le test ci-dessus a du sens) : en NOMINATIF, changer le demandeur change bien les octets.
  it('contrôle positif : en nominatif, changer le demandeur change le PDF', async () => {
    const a = await genererCertificatPdf(donnees({ anonymise: false, demandeur: DEM_A }));
    const b = await genererCertificatPdf(donnees({ anonymise: false, demandeur: DEM_B }));
    expect(a.equals(b)).toBe(false);
  });

  // La réf. publique et le VRAI QR de vérification sont CONSERVÉS en anonymisé → le PDF reflète le jeton (QR présent).
  it('reste vérifiable : le PDF anonymisé reflète le jeton (QR de vérification conservé)', async () => {
    const a = await genererCertificatPdf(donnees({ anonymise: true, jeton: 'ABCDEFGHJKMNPQRS' }));
    const b = await genererCertificatPdf(donnees({ anonymise: true, jeton: 'ZZZZZZZZZZZZZZZZ' }));
    expect(a.equals(b)).toBe(false);
  });

  // `anonymise` n'a d'effet QUE si aUnCompte===true : sur un one-shot, il est ignoré (octets identiques).
  it('ignoré en one-shot : anonymise n’a aucun effet quand aUnCompte===false', async () => {
    const a = await genererCertificatPdf(donnees({ aUnCompte: false, anonymise: false }));
    const b = await genererCertificatPdf(donnees({ aUnCompte: false, anonymise: true }));
    attendreIdentiques(a, b, 'one-shot : anonymise ignoré');
  });
});

describe('genererCertificatPdf — QR par TYPE de document (typeDocument)', () => {
  it('typeDocument ABSENT → PDF byte-identique à un autre rendu sans type (QR nominatif inchangé)', async () => {
    const a = await genererCertificatPdf(donnees()); // pas de typeDocument
    const b = await genererCertificatPdf(donnees({ typeDocument: undefined }));
    attendreIdentiques(a, b, 'typeDocument absent : byte-identique au rendu sans type');
  });

  it('typeDocument:"anonyme" → le PDF DIFFÈRE du nominatif (le QR encode &doc=anonyme)', async () => {
    const nominatif = await genererCertificatPdf(donnees());
    const anonyme = await genererCertificatPdf(donnees({ typeDocument: 'anonyme' }));
    expect(anonyme.equals(nominatif)).toBe(false);
  });

  it('typeDocument:"visuel" → PDF encore différent (QR &doc=visuel), déterministe', async () => {
    const nominatif = await genererCertificatPdf(donnees());
    const visuel1 = await genererCertificatPdf(donnees({ typeDocument: 'visuel' }));
    const visuel2 = await genererCertificatPdf(donnees({ typeDocument: 'visuel' }));
    expect(visuel1.equals(nominatif)).toBe(false);
    attendreIdentiques(visuel1, visuel2, 'typeDocument visuel : déterministe'); // déterministe
  });

  it('ONE-SHOT : typeDocument est IGNORÉ (QR décoratif, jamais de doc)', async () => {
    const a = await genererCertificatPdf(donnees({ aUnCompte: false }));
    const b = await genererCertificatPdf(donnees({ aUnCompte: false, typeDocument: 'anonyme' }));
    attendreIdentiques(a, b, 'ONE-SHOT typeDocument ignoré');
  });
});

describe('mentions légales — faits présents (mentions.ts)', () => {
  it('émetteur CRITERIMMO + RCS + GALIAN', () => {
    expect(MENTION_EMETTEUR).toContain('CRITERIMMO');
    expect(MENTION_EMETTEUR).toMatch(/521\s514\s968/);
    expect(MENTION_EMETTEUR).toContain('GALIAN');
  });
  it('définition OFFICIELLE : aucun obstacle sur 40 m face au séjour, mesuré au LiDAR, végétation exclue', () => {
    expect(MENTION_DEFINITION).toMatch(/aucun obstacle/i);
    expect(MENTION_DEFINITION).toMatch(/40\smètres face au séjour/); // \s : tolère l'espace insécable typographique
    expect(MENTION_DEFINITION).toMatch(/g[ée]om[ée]triquement/);
    expect(MENTION_DEFINITION).toContain('LiDAR');
    expect(MENTION_DEFINITION).toMatch(/v[ée]g[ée]tation/i);
  });
  it('découplage photo/verdict + marque déposée', () => {
    expect(MENTION_DECOUPLAGE.toLowerCase()).toContain('photographique');
    expect(MENTION_MARQUE).toContain('marque déposée');
  });
});
