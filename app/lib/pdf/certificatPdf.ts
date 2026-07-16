import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { toBuffer as qrToBuffer } from 'qrcode';
import { MENTION_EMETTEUR } from './mentions';

/**
 * GÉNÉRATEUR PUR du PDF du certificat (Lot 6b) — REPRODUIT `docs/modele/certificat-savv-v15.html`.
 *
 * PUR : aucune base, aucun réseau. Seule exception : les ACTIFS de marque sur disque (logos + polices OFL,
 * `app/lib/pdf/actifs/`), CONSTANTS et versionnés → le PDF ne dépend d'aucun réseau. Toutes les DONNÉES sont injectées.
 *
 * UNE PAGE A4. Positionnement ABSOLU (aucun flux) → aucune pagination automatique : le document tient sur une page.
 *
 * DÉTERMINISME : CreationDate/ModDate + ID (dérivé du dict Info par pdfkit) FIGÉS sur `emisLe` ; polices embarquées
 * depuis des fichiers constants ; QR déterministe. Mêmes entrées → mêmes octets (testé).
 *
 * DEUX MOTEURS, DEUX SOURCES (jamais mélangés) : VERDICT = LiDAR HD, 1 axe, seuil 40 m ; FAISCEAUX = BD TOPO, 180°,
 * portée 200 m. Le LOGO porte la marque, JAMAIS le verdict ; seule la pastille suit `verdictCertifie` (règle du modèle).
 */

// ── Actifs (disque, constants) ──
const ACTIFS = join(process.cwd(), 'app', 'lib', 'pdf', 'actifs');
const A = (nom: string) => readFileSync(join(ACTIFS, nom));

// ── Charte (globals.css / modèle, en dur : un PDF ne lit pas le CSS) ──
const ROUGE = '#a30402';
const NEUTRE = '#f3f4f6';
const NEUTRE_BORD = '#e6e7e9';
const ENCRE = '#1c1917';
const GRIS = '#5c554d';
const GRIS_CLAIR = '#8a857c';
const GRIS_TRES_CLAIR = '#a29c92';
const SCORE_DEN = '#b0aa9f';
const BLANC = '#ffffff';

// ── Géométrie A4 (points ; le modèle raisonne en px @96dpi → 1px = 0.75pt) ──
const PT_MM = 2.834645669;
const PAGE_W = 595.28;
const MX = 15 * PT_MM; // marge latérale (15 mm)
const MY = 16 * PT_MM; // marge haut/bas (16 mm)
const X0 = MX;
const CW = PAGE_W - 2 * MX; // largeur de contenu
const px = (n: number) => n * 0.75; // px modèle → pt

// ── Noms de polices pdfkit → fichier d'actif ──
const POLICES: Record<string, string> = {
  sg700: 'SpaceGrotesk-Bold.otf', // Space Grotesk 700
  ps400: 'PublicSans-Regular.ttf',
  ps600: 'PublicSans-SemiBold.ttf',
  mono400: 'IBMPlexMono-Regular.ttf',
  mono500: 'IBMPlexMono-Medium.ttf',
  mono600: 'IBMPlexMono-SemiBold.ttf',
  mono700: 'IBMPlexMono-Bold.ttf',
};

// ── Type d'entrée (modèle MOINS les retraits ; tas A NULLABLE) ──
export type LigneKv = [string, string];
export interface DemandeurPdf {
  nom?: string | null;
  adresse?: string | null; // modèle : <b>nom</b> · adresse<br>email · téléphone (adresse = celle du bien, seule dispo)
  email?: string | null;
  telephone?: string | null;
}
export interface BienPdf {
  adresse: string | null;
  cadastre: string | null;
  type: string | null;
  usage: string | null; // nullable (tas A : residence_principale via join)
}
export interface PhotoMetaPdf {
  azimut: string | null;
  mode: string | null; // nullable (tas A : mode_origine via join) — "snapping façade" | "GPS libre"
  champ: string;
}
export interface DonneesCertificatPdf {
  numero: string;
  reference: string;
  emission: string; // date + heure fr, pré-formatée
  dateAnalyse: string;
  porteeAnalyse: string; // "200 m" — DÉRIVÉ du moteur par l'appelant (jamais retapé)
  champAnalyseDeg: string; // "180°" — DÉRIVÉ du moteur ; nommé dans la légende de la carte
  coneCentralDeg: string; // "90°" — découpage d'AFFICHAGE (2 × 45°), nommé dans la légende de la carte
  siteWeb: string;
  urlVerification: string; // "sansvisavis.com/verifier"
  verdictCertifie: boolean;
  score: { valeur: number; note: string };
  demandeur: DemandeurPdf | null; // null = non-couplage RGPD (aucun demandeur)
  bien: BienPdf;
  photo: PhotoMetaPdf;
  // Lignes clé/valeur DÉJÀ construites par l'appelant (retraits + lignes nulles omis en amont).
  empreinteCoordonnees: LigneKv[]; // Latitude, Longitude, Alt. terrain, Alt. sol
  empreintePosition: LigneKv[]; // Étage, Dernier étage, Sous-plafond (OBLIGATOIRE), Hauteur de vision (MOTEUR), Champ analysé
  empreinteCaracteristiques: LigneKv[]; // Surface, Pièces, Chambres, Année, [Extérieur]
  analyseResultat: LigneKv[]; // Obstacle face détecté, Moyenne faisceaux, Analyses LiDAR (rangée g-3, colonne 1)
  qualiteVue: LigneKv[]; // Dégagement, Ouverture, Végétation, Patrimoine, Ciel (rangée g-3, colonne 2 ; « — » : pas de source)
  nuisances: LigneKv[]; // Ligne HT, ICPE, Antenne, Axe routier, Source d'eau (rangée g-3, colonne 3 ; « — » : pas de source)
  carteLegende: string;
  pied: string;
  emisLe: Date; // FIGE CreationDate/ModDate/ID
  jeton: string; // n'apparaît QUE dans le QR (le modèle n'imprime pas le code en clair) ; jamais dans un log
  urlBase: string;
  cartePng: Buffer;
  photoJpeg: Buffer | null;
}

/** URL encodée dans le QR : numéro + jeton. */
export function urlQr(urlBase: string, numero: string, jeton: string): string {
  const base = urlBase.replace(/\/+$/, '');
  return `${base}/verifier?n=${encodeURIComponent(numero)}&j=${encodeURIComponent(jeton)}`;
}

/** Label de score — RÈGLE DU MODÈLE (verbatim) : ≥75 « Vue exceptionnelle » ; ≥60 « Excellente vue » ; sinon aucun. */
export function scoreLabel(v: number): string | null {
  return v >= 75 ? 'Vue exceptionnelle' : v >= 60 ? 'Excellente vue' : null;
}

/** Jeton groupé 4 par 4 (16 car. → « XXXX XXXX XXXX XXXX »), pour saisie manuelle sans téléphone. */
export function jeton4x4(j: string): string {
  return (j.match(/.{1,4}/g) ?? [j]).join(' ');
}

function collecter(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const m: Buffer[] = [];
    doc.on('data', (c: Buffer) => m.push(c));
    doc.on('end', () => resolve(Buffer.concat(m)));
    doc.on('error', reject);
  });
}

export async function genererCertificatPdf(d: DonneesCertificatPdf): Promise<Buffer> {
  const qrPng = await qrToBuffer(urlQr(d.urlBase, d.numero, d.jeton), {
    type: 'png',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: ENCRE, light: '#ffffff' },
  });

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0, // positionnement absolu
    autoFirstPage: true,
    info: {
      Title: `Certificat Sans Vis-à-Vis ${d.numero}`,
      Author: 'CRITERIMMO',
      Creator: 'Sans Vis-à-Vis',
      Producer: 'Sans Vis-à-Vis',
      CreationDate: d.emisLe,
      ModDate: d.emisLe,
    },
  });
  const sortie = collecter(doc);
  for (const [nom, fichier] of Object.entries(POLICES)) doc.registerFont(nom, A(fichier));

  // ── Helpers de dessin ──
  const esc = (s: string) => s; // pdfkit n'interprète pas de balisage : le texte est littéral (échappement inutile ici)
  const txt = (
    s: string,
    x: number,
    y: number,
    police: string,
    taille: number,
    couleur: string,
    opts: PDFKit.Mixins.TextOptions = {},
  ) => {
    doc.font(police).fontSize(taille).fillColor(couleur).text(esc(s), x, y, { lineBreak: false, ...opts });
  };
  const panneau = (x: number, y: number, w: number, h: number, bord = false) => {
    doc.roundedRect(x, y, w, h, px(10)).fill(NEUTRE);
    if (bord) doc.roundedRect(x, y, w, h, px(10)).lineWidth(0.6).stroke(NEUTRE_BORD);
  };
  const titrePanneau = (x: number, y: number, s: string, couleur = ROUGE) =>
    txt(s.toUpperCase(), x, y, 'mono600', px(8.5), couleur, { characterSpacing: 0.5 });
  /** Rend des lignes « clé : valeur » (clé mono400 gris, valeur mono600 encre). Renvoie la hauteur consommée. */
  const kvBloc = (x: number, y: number, w: number, rows: LigneKv[], taille = px(9.5)) => {
    const lh = taille * 1.8;
    rows.forEach(([k, v], i) => {
      const yy = y + i * lh;
      doc.font('mono400').fontSize(taille).fillColor(GRIS).text(`${k} : `, x, yy, { continued: true, lineBreak: false });
      doc.font('mono600').fillColor(ENCRE).text(v, { lineBreak: false });
    });
    return rows.length * lh;
  };

  const label = scoreLabel(d.score.valeur);
  const certifie = d.verdictCertifie === true;

  let y = MY;

  // ══════════ EN-TÊTE : logo (marque) + identifiants ══════════
  const logoLongH = px(48);
  doc.image(A('logo-long.png'), X0, y, { height: logoLongH }); // ratio conservé (900×202)
  // Deux id-blocks alignés à droite.
  const idBox = (labelTxt: string, valeur: string, ref: boolean, rightX: number): number => {
    const fs = px(12);
    const padH = px(11);
    const wBox = doc.font('mono600').fontSize(fs).widthOfString(valeur) + 2 * padH;
    const bx = rightX - wBox;
    const boxY = y + px(13);
    const boxH = px(23);
    if (ref) doc.roundedRect(bx, boxY, wBox, boxH, px(4)).fill(ROUGE);
    else doc.roundedRect(bx, boxY, wBox, boxH, px(4)).fill(NEUTRE).roundedRect(bx, boxY, wBox, boxH, px(4)).lineWidth(0.8).stroke(ROUGE);
    txt(labelTxt.toUpperCase(), bx, y, 'mono600', px(7.5), GRIS_CLAIR, { width: wBox, align: 'right', characterSpacing: 0.6 });
    txt(valeur, bx, boxY + px(6.5), 'mono600', fs, ref ? BLANC : ROUGE, { width: wBox, align: 'center' });
    return bx; // bord gauche → pour poser le bloc suivant à sa gauche
  };
  const gapId = px(9);
  const leftOfRef = idBox('Réf. publique', d.reference, true, X0 + CW);
  idBox('N° de certificat', d.numero, false, leftOfRef - gapId);

  y += logoLongH; // fin de l'en-tête

  // Filet rouge.
  y += px(14);
  doc.rect(X0, y, CW, px(2)).fill(ROUGE);
  y += px(2) + px(16);

  // ══════════ VERDICT (LiDAR) | SCORE ══════════
  const gap = px(12);
  const wVerdict = (CW - gap) * (1.4 / 2.4);
  const wScore = (CW - gap) * (1.0 / 2.4);
  const hV = px(96);
  panneau(X0, y, wVerdict, hV);
  panneau(X0 + wVerdict + gap, y, wScore, hV);

  // -- Verdict : sceau (marque + pastille) + libellé --
  const pad = px(13);
  const sealS = px(68);
  const sealX = X0 + pad;
  const sealY = y + (hV - sealS) / 2;
  doc.image(A('logo-rond.png'), sealX, sealY, { width: sealS, height: sealS }); // LOGO = marque
  // Pastille d'état (SEULE à suivre le verdict).
  const bS = px(23);
  const bx = sealX + sealS - bS + px(3);
  const by = sealY + sealS - bS + px(3);
  doc.circle(bx + bS / 2, by + bS / 2, bS / 2).fill(certifie ? ROUGE : GRIS_CLAIR);
  doc.circle(bx + bS / 2, by + bS / 2, bS / 2).lineWidth(px(2)).stroke(BLANC);
  if (certifie) {
    // Coche vectorielle blanche (Space Grotesk n'a pas forcément « ✓ »).
    const cx = bx + bS / 2, cy = by + bS / 2, r = bS * 0.28;
    doc.moveTo(cx - r, cy).lineTo(cx - r * 0.2, cy + r * 0.7).lineTo(cx + r, cy - r * 0.7).lineWidth(px(2)).lineCap('round').lineJoin('round').stroke(BLANC);
  } else {
    const cx = bx + bS / 2, cy = by + bS / 2, r = bS * 0.28;
    doc.moveTo(cx - r, cy).lineTo(cx + r, cy).lineWidth(px(2)).lineCap('round').stroke(BLANC);
  }
  const vTextX = sealX + sealS + px(14);
  const vTextW = X0 + wVerdict - pad - vTextX;
  txt("Résultat de l'analyse", vTextX, sealY + px(6), 'mono600', px(9.5), GRIS_CLAIR, { characterSpacing: 0.6, width: vTextW });
  txt(certifie ? 'Sans Vis-à-Vis® certifié' : 'Non certifié', vTextX, sealY + px(22), 'sg700', px(24), certifie ? ROUGE : ENCRE, { width: vTextW });
  txt('LiDAR HD · 1 axe de visée · seuil 40 m', vTextX, sealY + sealS - px(12), 'mono400', px(8), GRIS_CLAIR, { width: vTextW });

  // -- Score --
  const sx = X0 + wVerdict + gap;
  txt('Score global', sx, y + pad, 'mono600', px(9.5), GRIS_CLAIR, { width: wScore, align: 'center', characterSpacing: 0.6 });
  const numY = y + pad + px(16);
  doc.font('sg700').fontSize(px(36)).fillColor(ENCRE);
  const numW = doc.widthOfString(String(d.score.valeur));
  const denW = doc.font('mono400').fontSize(px(14)).widthOfString('/100');
  const totalW = numW + px(3) + denW;
  const numX = sx + (wScore - totalW) / 2;
  txt(String(d.score.valeur), numX, numY, 'sg700', px(36), ENCRE);
  txt('/100', numX + numW + px(3), numY + px(16), 'ps400', px(14), SCORE_DEN);
  const afterNumY = numY + px(38);
  if (label) {
    const lw = doc.font('ps600').fontSize(px(11.5)).widthOfString(label) + 2 * px(12);
    const lx = sx + (wScore - lw) / 2;
    doc.roundedRect(lx, afterNumY, lw, px(19), px(5)).fill(ROUGE);
    txt(label, lx, afterNumY + px(4.5), 'ps600', px(11.5), BLANC, { width: lw, align: 'center' });
  } else {
    txt(d.score.note, sx + pad, afterNumY, 'ps400', px(9), GRIS_CLAIR, { width: wScore - 2 * pad, align: 'center' });
  }

  y += hV + px(12);

  // ══════════ DEMANDEUR | BIEN (demandeur omis si null → bien pleine largeur) ══════════
  const champsDem = d.demandeur ? [d.demandeur.nom, d.demandeur.email, d.demandeur.telephone].filter(Boolean) : [];
  const aDemandeur = champsDem.length > 0;
  const hInfo = px(66); // deux lignes de contenu (modèle) : nom·adresse / email·téléphone
  const dyTitre = px(15); // titre → 1re ligne de contenu
  const dyLigne = px(14); // interligne contenu
  if (aDemandeur) {
    const wCol = (CW - gap) / 2;
    panneau(X0, y, wCol, hInfo);
    panneau(X0 + wCol + gap, y, wCol, hInfo);
    titrePanneau(X0 + pad, y + pad, 'Demandeur');
    // Modèle : <b>nom</b> · adresse (ligne 1) ; email · téléphone (ligne 2).
    const dx = X0 + pad;
    const l1y = y + pad + dyTitre;
    const nomTxt = d.demandeur?.nom || null;
    const adr = d.demandeur?.adresse || null;
    const contact = [d.demandeur?.email, d.demandeur?.telephone].filter(Boolean).join(' · ');
    if (nomTxt) {
      doc.font('ps600').fontSize(px(10.5)).fillColor(ENCRE).text(nomTxt, dx, l1y, { continued: !!adr, lineBreak: false });
      if (adr) doc.font('ps400').fillColor(GRIS).text(` · ${adr}`, { lineBreak: false });
    } else if (adr) {
      txt(adr, dx, l1y, 'ps400', px(10.5), GRIS, { width: wCol - 2 * pad });
    }
    if (contact) txt(contact, dx, l1y + dyLigne, 'ps400', px(10.5), GRIS, { width: wCol - 2 * pad });
    // Bien (droite)
    const bxc = X0 + wCol + gap;
    titrePanneau(bxc + pad, y + pad, 'Identification du bien');
    bienBloc(bxc + pad, y + pad + dyTitre, wCol - 2 * pad);
  } else {
    panneau(X0, y, CW, hInfo);
    titrePanneau(X0 + pad, y + pad, 'Identification du bien');
    bienBloc(X0 + pad, y + pad + dyTitre, CW - 2 * pad);
  }
  function bienBloc(bx2: number, by2: number, w: number) {
    const l1 = [d.bien.adresse, d.bien.cadastre ? `Cadastre : ${d.bien.cadastre}` : null].filter(Boolean).join(' · ');
    const l2 = [d.bien.type, d.bien.usage].filter(Boolean).join(' · '); // usage nullable
    doc.font('ps400').fontSize(px(10.5)).fillColor(GRIS);
    let yy = by2;
    if (l1) { doc.text(l1, bx2, yy, { width: w, lineBreak: true }); yy = doc.y; } // MESURE la hauteur enroulée (jamais un y fixe)
    if (l2) doc.text(l2, bx2, yy, { width: w, lineBreak: true });
  }

  y += hInfo + px(12);

  // ══════════ EMPREINTE GÉOMÉTRIQUE (3 colonnes) ══════════
  const rowsMax = Math.max(d.empreinteCoordonnees.length, d.empreintePosition.length, d.empreinteCaracteristiques.length);
  const hEmp = pad + px(12) + px(11) + rowsMax * px(9.5) * 1.8 + pad * 0.4;
  panneau(X0, y, CW, hEmp);
  titrePanneau(X0 + pad, y + pad, 'Empreinte géométrique unique du bien');
  const col = (CW - 2 * pad) / 3;
  const capY = y + pad + px(15);
  const kvY = capY + px(11);
  const cols: [string, LigneKv[]][] = [
    ['Coordonnées', d.empreinteCoordonnees],
    ['Position de vue', d.empreintePosition],
    ['Caractéristiques', d.empreinteCaracteristiques],
  ];
  cols.forEach(([cap, rows], i) => {
    const cx = X0 + pad + i * col;
    txt(cap.toUpperCase(), cx, capY, 'mono600', px(8), GRIS_CLAIR, { characterSpacing: 0.5 });
    kvBloc(cx, kvY, col - px(6), rows);
  });
  y += hEmp + px(12);

  // ══════════ RANGÉE g-3 : RÉSULTAT DÉTAILLÉ | QUALITÉ DE VUE | NUISANCES VISUELLES (modèle) ══════════
  // Colonnes 2 et 3 = « — » partout (pas de source moteur) : convention du modèle (qualiteVue), aucune valeur inventée.
  const g3cols: [string, LigneKv[]][] = [
    ['Résultat détaillé', d.analyseResultat],
    ['Qualité de vue', d.qualiteVue],
    ['Nuisances visuelles', d.nuisances],
  ];
  const g3rows = Math.max(...g3cols.map(([, r]) => r.length));
  const hG3 = pad + px(13) + g3rows * px(9.5) * 1.8 + pad * 0.4;
  const w3 = (CW - 2 * gap) / 3;
  g3cols.forEach(([titre, rows], i) => {
    const cx = X0 + i * (w3 + gap);
    panneau(cx, y, w3, hG3);
    titrePanneau(cx + pad, y + pad, titre);
    kvBloc(cx + pad, y + pad + px(15), w3 - 2 * pad, rows);
  });
  y += hG3 + px(12);

  // ══════════ PHOTO | CARTE ══════════
  const wCol2 = (CW - gap) / 2;
  const mediaH = px(190); // modèle : .media{height:190px}
  const hMedia = pad + px(10) + px(12) + mediaH + px(8) + px(22) + pad * 0.2;
  panneau(X0, y, wCol2, hMedia);
  panneau(X0 + wCol2 + gap, y, wCol2, hMedia);
  // Photo
  txt('Photo de la vue', X0 + pad, y + pad, 'mono600', px(8), GRIS_CLAIR, { characterSpacing: 0.5 });
  const mY = y + pad + px(14);
  const mW = wCol2 - 2 * pad;
  mediaImage(X0 + pad, mY, mW, mediaH, d.photoJpeg, `photo de la vue · ${d.photo.champ}`);
  const pSub = [
    d.photo.azimut ? `Azimut : ${d.photo.azimut}` : null,
    `Champ : ${d.photo.champ}`,
    d.photo.mode ? `Placement du point : ${d.photo.mode}` : null,
  ].filter(Boolean).join(' · ');
  txt(pSub, X0 + pad, mY + mediaH + px(8), 'mono400', px(8.5), GRIS, { width: mW });
  // Carte
  const cX = X0 + wCol2 + gap;
  txt('Carte de localisation', cX + pad, y + pad, 'mono600', px(8), GRIS_CLAIR, { characterSpacing: 0.5 });
  mediaImage(cX + pad, mY, mW, mediaH, d.cartePng, d.carteLegende);
  txt(`Champ ${d.champAnalyseDeg} / ${d.porteeAnalyse} · cône central ${d.coneCentralDeg} (affichage)`, cX + pad, mY + mediaH + px(8), 'mono400', px(8.5), GRIS, { width: mW });
  y += hMedia + px(12);

  function mediaImage(ix: number, iy: number, iw: number, ih: number, img: Buffer | null, legende: string) {
    doc.save();
    doc.roundedRect(ix, iy, iw, ih, px(6)).clip();
    if (img) {
      doc.image(img, ix, iy, { cover: [iw, ih], align: 'center', valign: 'center' });
    } else {
      doc.rect(ix, iy, iw, ih).fill(NEUTRE);
      txt(legende, ix, iy + ih / 2 - px(6), 'mono500', px(9), GRIS_TRES_CLAIR, { width: iw, align: 'center' });
    }
    doc.restore();
  }

  // ══════════ BANDEAU RÉFÉRENCE PUBLIQUE ══════════
  const hRef = px(46);
  panneau(X0, y, CW, hRef);
  doc.rect(X0, y, px(3), hRef).fill(ROUGE); // liseré gauche
  // Référence INSÉCABLE (modèle : .ref-code{white-space:nowrap}) : on MESURE sa largeur et on lui réserve la place.
  const refW = doc.font('mono700').fontSize(px(15)).widthOfString(d.reference) + px(6);
  const refTxtW = CW - 2 * pad - refW - px(10);
  doc.font('ps400').fontSize(px(9.5)).fillColor(GRIS).text(
    `Référence à reprendre dans votre annonce. Indiquez-la dans le texte de l'annonce : toute personne pourra vérifier sur ${d.urlVerification} que l'analyse provient de nos services et correspond à l'annonce.`,
    X0 + pad, y + px(9), { width: refTxtW, lineBreak: true },
  );
  txt(d.reference, X0 + CW - pad - refW, y + (hRef - px(15)) / 2, 'mono700', px(15), ROUGE, { width: refW, align: 'right', characterSpacing: 0.3, lineBreak: false });
  y += hRef + px(12);

  // ══════════ PIED — modèle .foot : dates + pied (gauche) · site · QR « Vérifier ce certificat » (droite) ══════════
  y += px(2);
  doc.rect(X0, y, CW, 0.6).fill(NEUTRE_BORD); // .foot { border-top }
  y += px(11);
  const qrS = px(52); // modèle .qr { 52px }
  const qrX = X0 + CW - qrS;
  doc.image(qrPng, qrX, y, { width: qrS, height: qrS });
  const capX = qrX - px(86);
  txt('VÉRIFIER CE CERTIFICAT', capX, y + px(14), 'mono600', px(7.5), GRIS_CLAIR, { width: px(80), align: 'right', characterSpacing: 0.4, lineBreak: true });
  // foot-txt (gauche) : dates + analyse, puis le site (rouge) et le pied de page.
  const footW = capX - X0 - px(12);
  doc.font('ps400').fontSize(px(10)).fillColor(GRIS).text(
    `Date d'émission : ${d.emission} · Date d'analyse : ${d.dateAnalyse} · Analyse géométrique : ${d.porteeAnalyse}`,
    X0, y, { width: footW, lineBreak: true },
  );
  doc.font('mono700').fontSize(px(11)).fillColor(ROUGE).text(d.siteWeb, X0, doc.y + px(1), { continued: true, lineBreak: false });
  doc.font('ps400').fontSize(px(9)).fillColor(GRIS).text(`   ${d.pied}`, { lineBreak: false });
  // Coordonnées de la SARL CRITERIMMO — remplace le pavé de mentions (fine print, tout en bas).
  const yC = Math.max(y + qrS, doc.y) + px(7);
  doc.rect(X0, yC, CW, 0.6).fill(NEUTRE_BORD);
  doc.font('mono400').fontSize(px(6.8)).fillColor(GRIS_CLAIR).text(MENTION_EMETTEUR, X0, yC + px(4), { width: CW, lineBreak: true });

  doc.end();
  return sortie;
}
