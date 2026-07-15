import PDFDocument from 'pdfkit';
import { toBuffer as qrToBuffer } from 'qrcode';
import {
  MENTION_EMETTEUR,
  MENTION_MARQUE,
  MENTION_DEFINITION,
  MENTION_DECOUPLAGE,
  MENTION_PORTEE,
  mentionVerifiabilite,
} from './mentions';

/**
 * GÉNÉRATEUR PUR du PDF du certificat (Lot 6a) — miroir de `orientationCarte.ts` : aucune base, aucun stockage,
 * aucun réseau, aucun disque. TOUTES les entrées sont INJECTÉES (le raccordement est le lot 6b).
 *
 * DÉTERMINISME (exigence dure) : mêmes entrées → MÊMES OCTETS. `CreationDate`/`ModDate` et l'ID du document (dérivé
 * par pdfkit du dictionnaire Info) sont FIGÉS sur `emisLe` ; Title/Author/Creator/Producer sont constants ; les
 * polices sont les 14 standard du PDF (aucun fichier embarqué) ; le QR est déterministe. Prouvé par test.
 *
 * CHARTE : rouge de marque, encre/gris neutre, aucun bleu (le seul bleu est DANS l'image de la carte, non touché).
 *
 * ⚠️ Le jeton n'apparaît QUE dans le QR (via `urlQr`). L'URL en clair imprimée sous le QR (`urlClaire`) ne porte
 * QUE le numéro — jamais le jeton. Aucun log : ce module n'écrit rien nulle part.
 */

// Charte SVAV (valeurs de globals.css, en dur car un PDF ne lit pas le CSS).
const ROUGE = '#a30402';
const ENCRE = '#16202c';
const GRIS = '#454545';
const MUET = '#5c6573';
const LIGNE = '#e6e8ec';

const PAGE_W = 595.28; // A4 en points
const MARGE = 50;
const CONTENU_W = PAGE_W - 2 * MARGE;

export interface DonneesCertificatPdf {
  numero: string;
  emisLe: Date; // FIGE CreationDate/ModDate/ID → déterminisme
  verdict: string; // 'SANS_VIS_A_VIS' (seul émis)
  adresse: string | null;
  etage: number | null;
  jeton: string; // n'apparaît QUE dans le QR
  cartePng: Buffer; // carte d'orientation (PNG) injectée
  photoJpeg: Buffer | null; // photo (JPEG) injectée, ou null → document correct sans elle
  urlBase: string; // ex. https://www.sansvisavis.com
}

/** URL encodée dans le QR : numéro + jeton (le jeton ne vit QUE là). */
export function urlQr(urlBase: string, numero: string, jeton: string): string {
  const base = urlBase.replace(/\/+$/, '');
  return `${base}/verifier?n=${encodeURIComponent(numero)}&j=${encodeURIComponent(jeton)}`;
}

/** URL en clair imprimée sous le QR : numéro SEUL, JAMAIS le jeton (pour qui n'a pas de téléphone). */
export function urlClaire(urlBase: string, numero: string): string {
  const base = urlBase.replace(/\/+$/, '');
  return `${base}/verifier?n=${encodeURIComponent(numero)}`;
}

/** Date d'émission lisible en français, ancrée Europe/Paris (jour mois année). */
function dateFr(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
}

/** Étage (null / 0 gérés). */
function libelleEtage(etage: number | null): string {
  if (etage === null) return 'Non renseigné';
  if (etage === 0) return 'Rez-de-chaussée';
  return `${etage}ᵉ étage`;
}

/** Verdict → libellé de bannière (majuscules, seul SANS_VIS_A_VIS est émis ; les autres gérés par prudence). */
function libelleVerdict(verdict: string): string {
  if (verdict === 'SANS_VIS_A_VIS') return 'SANS VIS-À-VIS';
  if (verdict === 'VIS_A_VIS') return 'VIS-À-VIS';
  return verdict.toUpperCase();
}

/** Attache la collecte du flux pdfkit AVANT tout rendu ; le Buffer se résout au `doc.end()` de l'appelant. */
function collecter(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    doc.on('data', (c: Buffer) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
  });
}

export async function genererCertificatPdf(d: DonneesCertificatPdf): Promise<Buffer> {
  // QR déterministe (encre sur blanc → contraste, neutre, aucun bleu).
  const qrPng = await qrToBuffer(urlQr(d.urlBase, d.numero, d.jeton), {
    type: 'png',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: ENCRE, light: '#ffffff' },
  });

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGE,
    // Info FIGÉE sur emisLe → CreationDate/ModDate constants ET ID déterministe (pdfkit hashe le dict Info).
    info: {
      Title: `Certificat Sans Vis-à-Vis ${d.numero}`,
      Author: 'CRITERIMMO',
      Creator: 'Sans Vis-à-Vis',
      Producer: 'Sans Vis-à-Vis',
      CreationDate: d.emisLe,
      ModDate: d.emisLe,
    },
  });
  const sortie = collecter(doc); // listeners attachés AVANT le rendu ; on `end()` en toute fin.

  // ══ PAGE 1 — le certificat ══
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text("L'IMMOBILIER", MARGE, MARGE, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(ROUGE).text('SANS VIS-À-VIS®', MARGE, doc.y + 1);

  doc.moveDown(0.6);
  const yTrait = doc.y;
  doc.moveTo(MARGE, yTrait).lineTo(PAGE_W - MARGE, yTrait).lineWidth(1).strokeColor(LIGNE).stroke();

  // Identité : numéro + date d'émission.
  doc.moveDown(0.9);
  doc.font('Helvetica').fontSize(10).fillColor(MUET).text('CERTIFICAT N°', { characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(ENCRE).text(d.numero);
  doc.font('Helvetica').fontSize(10).fillColor(MUET).text(`Émis le ${dateFr(d.emisLe)}`);

  // Bannière du verdict (rouge contour, sobre).
  const yBanniere = doc.y + 12;
  doc.roundedRect(MARGE, yBanniere, CONTENU_W, 44, 6).lineWidth(1.5).strokeColor(ROUGE).stroke();
  doc.font('Helvetica-Bold').fontSize(17).fillColor(ROUGE).text(libelleVerdict(d.verdict), MARGE, yBanniere + 13, {
    width: CONTENU_W,
    align: 'center',
  });
  doc.y = yBanniere + 44;

  // Bien concerné.
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ENCRE).text('Bien concerné');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(11).fillColor(ENCRE).text(`Adresse : ${d.adresse ?? 'Non renseignée'}`);
  doc.text(`Étage : ${libelleEtage(d.etage)}`);

  // Carte (gauche) + photo (droite si présente). Images en colonnes ; libellés au-dessus.
  doc.moveDown(1);
  const colGap = 24;
  const colW = d.photoJpeg ? (CONTENU_W - colGap) / 2 : CONTENU_W * 0.62;
  const yLibImg = doc.y;
  doc.font('Helvetica').fontSize(8).fillColor(MUET).text("CARTE D'ORIENTATION", MARGE, yLibImg, { characterSpacing: 1 });
  if (d.photoJpeg) doc.text('PHOTO', MARGE + colW + colGap, yLibImg, { characterSpacing: 1 });
  const yImg = yLibImg + 12;
  doc.image(d.cartePng, MARGE, yImg, { fit: [colW, colW] });
  if (d.photoJpeg) doc.image(d.photoJpeg, MARGE + colW + colGap, yImg, { fit: [colW, colW] });
  doc.y = yImg + colW;

  // Vérifiabilité : QR + URL en clair (numéro seul).
  doc.moveDown(1.2);
  const yQr = doc.y;
  const qrTaille = 92;
  doc.image(qrPng, MARGE, yQr, { width: qrTaille });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(ENCRE).text('Vérifier ce certificat', MARGE + qrTaille + 16, yQr + 6);
  doc.font('Helvetica').fontSize(9).fillColor(MUET).text(
    'Scannez le QR, ou saisissez ce numéro sur la page de vérification. Le code figurant sur ce document est requis pour afficher le détail.',
    MARGE + qrTaille + 16,
    yQr + 22,
    { width: CONTENU_W - qrTaille - 16 },
  );
  doc.font('Helvetica').fontSize(8).fillColor(MUET).text(
    mentionVerifiabilite(urlClaire(d.urlBase, d.numero)),
    MARGE + qrTaille + 16,
    yQr + 62,
    { width: CONTENU_W - qrTaille - 16 },
  );

  // ══ PAGE 2 — mentions légales ══
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ENCRE).text('Mentions légales', MARGE, MARGE);
  doc.moveDown(0.6);
  const paragraphe = (titre: string, corps: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ENCRE).text(titre);
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(corps, { width: CONTENU_W, align: 'left' });
    doc.moveDown(0.7);
  };
  paragraphe('Définition du label', MENTION_DEFINITION);
  paragraphe('Rôle de l’analyse photographique', MENTION_DECOUPLAGE);
  paragraphe('Portée du document', MENTION_PORTEE);
  paragraphe('Marque', MENTION_MARQUE);
  paragraphe('Émetteur', MENTION_EMETTEUR);

  doc.end(); // finalise le flux → résout `collecter`
  return sortie;
}
