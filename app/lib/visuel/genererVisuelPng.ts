import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { toBuffer as qrToBuffer } from 'qrcode';

/**
 * GÉNÉRATEUR PUR du VISUEL D'ANNONCE (PNG 4:3) — miroir de `app/lib/pdf/`.
 *
 * PUR : aucune base, aucun réseau. Seule dépendance disque = le logo de marque (actif constant, partagé avec le PDF).
 * Toutes les DONNÉES sont injectées. On construit un SVG (charte SVAV) puis on le rastérise via `sharp` (libvips/librsvg)
 * en PNG. DÉTERMINISTE : ni horodatage, ni aléa → mêmes entrées ⇒ mêmes octets (le QR `qrcode` est lui-même déterministe).
 *
 * QR = URL de VÉRIFICATION PAR RÉFÉRENCE : `${urlBase}/verifier?ref=<reference>&doc=visuel`. JAMAIS le numéro, JAMAIS le
 * jeton (la voie référence ne débloque que le set NON NOMINATIF, sans adresse).
 */

// ── Charte (mêmes hex que le PDF, app/lib/pdf/certificatPdf.ts — aucune couleur nouvelle, aucun bleu) ──
const ROUGE = '#a30402';
const NEUTRE = '#f3f4f6';
const NEUTRE_BORD = '#e6e7e9';
const ENCRE = '#1c1917';
const GRIS = '#5c554d';
const GRIS_CLAIR = '#8a857c';
const BLANC = '#ffffff';
const POLICE = 'Helvetica, Arial, sans-serif'; // polices système (non embarquées) : suffisant, déterministe par machine

const LOGO_ROND_B64 = readFileSync(join(process.cwd(), 'app', 'lib', 'pdf', 'actifs', 'logo-rond.png')).toString('base64');

const W = 1200;
const H = 900; // 4:3

export interface DescriptifVisuelPng {
  ville: string | null;
  typeBien: string | null;
  surfaceM2: number | null;
  pieces: number | null;
  anneeOuEpoque: string | null;
  etage: number | null;
  dernierEtage: boolean | null;
  exterieur: string | null;
}

export interface DonneesVisuel {
  verdict: string; // le visuel n'est produit que pour SANS_VIS_A_VIS ; conservé pour cohérence
  score: number | null;
  reference: string;
  urlBase: string;
  descriptif: DescriptifVisuelPng;
}

/** Échappement XML (le SVG est du XML : texte utilisateur littéral, jamais interprété comme balisage). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** URL du QR : référence publique + doc=visuel. Jamais numéro ni jeton. */
export function urlVisuel(urlBase: string, reference: string): string {
  return `${urlBase.replace(/\/+$/, '')}/verifier?ref=${encodeURIComponent(reference)}&doc=visuel`;
}

/**
 * Parts du descriptif, dans l'ordre : Ville · Type · Surface · Pièces · Étage · Dernier étage · Année · Extérieur.
 * Champs `null` OMIS. Choix d'affichage MARKETING (visuel d'annonce) : « Dernier étage » n'apparaît QUE si vrai, et
 * l'extérieur « Aucun » est omis (on ne met en avant que les atouts). Jamais d'adresse.
 */
export function partsDescriptif(d: DescriptifVisuelPng): string[] {
  const p: string[] = [];
  if (d.ville) p.push(d.ville);
  if (d.typeBien) p.push(d.typeBien);
  if (d.surfaceM2 !== null) p.push(`${String(d.surfaceM2).replace('.', ',')} m²`);
  if (d.pieces !== null) p.push(`${d.pieces} pièce${d.pieces > 1 ? 's' : ''}`);
  if (d.etage !== null) p.push(d.etage === 0 ? 'Rez-de-chaussée' : `${d.etage}ᵉ étage`);
  if (d.dernierEtage === true) p.push('Dernier étage');
  if (d.anneeOuEpoque) p.push(d.anneeOuEpoque);
  if (d.exterieur && d.exterieur !== 'Aucun') p.push(d.exterieur);
  return p;
}

/** Répartit les parts (jointes par « · ») sur des lignes centrées, sans jamais couper une part. */
function wrapParts(parts: string[], maxChars: number): string[] {
  const lignes: string[] = [];
  let cur = '';
  for (const part of parts) {
    const cand = cur ? `${cur}  ·  ${part}` : part;
    if (cand.length > maxChars && cur) {
      lignes.push(cur);
      cur = part;
    } else {
      cur = cand;
    }
  }
  if (cur) lignes.push(cur);
  return lignes;
}

function construireSvg(d: DonneesVisuel, qrB64: string): string {
  const scoreTxt = d.score === null ? '—' : String(Math.round(d.score));
  const lignesDescr = wrapParts(partsDescriptif(d.descriptif), 46);
  // Descriptif centré dans la colonne gauche, sous le score.
  const descrY0 = 560;
  const descrSvg = lignesDescr
    .map((l, i) => `<text x="380" y="${descrY0 + i * 46}" text-anchor="middle" font-family="${POLICE}" font-size="30" fill="${ENCRE}">${esc(l)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BLANC}"/>

  <!-- ══ Bandeau rouge : logo rond + titre ══ -->
  <rect x="0" y="0" width="${W}" height="150" fill="${ROUGE}"/>
  <clipPath id="logoRond"><circle cx="105" cy="75" r="52"/></clipPath>
  <image x="53" y="23" width="104" height="104" clip-path="url(#logoRond)" xlink:href="data:image/png;base64,${LOGO_ROND_B64}"/>
  <text x="200" y="90" font-family="${POLICE}" font-size="42" font-weight="bold" fill="${BLANC}">Ce bien est certifié Sans Vis-à-Vis®*</text>

  <!-- ══ Colonne gauche : encart blanc (score + descriptif) ══ -->
  <rect x="40" y="185" width="680" height="600" rx="20" fill="${BLANC}" stroke="${NEUTRE_BORD}" stroke-width="2"/>
  <rect x="270" y="215" width="220" height="42" rx="21" fill="${ROUGE}"/>
  <text x="380" y="243" text-anchor="middle" font-family="${POLICE}" font-size="20" font-weight="bold" fill="${BLANC}">Vue dégagée certifiée</text>
  <text x="380" y="430" text-anchor="middle" font-family="${POLICE}" font-size="150" font-weight="bold" fill="${ENCRE}">${esc(scoreTxt)}<tspan font-size="70" fill="${GRIS_CLAIR}">/100</tspan></text>
  <text x="380" y="490" text-anchor="middle" font-family="${POLICE}" font-size="26" fill="${GRIS}">Score de qualité de vue</text>
  ${descrSvg}

  <!-- ══ Colonne droite : panneau gris (QR + référence) ══ -->
  <rect x="750" y="185" width="410" height="600" rx="20" fill="${NEUTRE}"/>
  <rect x="810" y="250" width="290" height="290" rx="16" fill="${BLANC}" stroke="${NEUTRE_BORD}" stroke-width="2"/>
  <image x="830" y="270" width="250" height="250" xlink:href="data:image/png;base64,${qrB64}"/>
  <text x="955" y="595" text-anchor="middle" font-family="${POLICE}" font-size="24" fill="${GRIS}">Scannez pour authentifier</text>
  <text x="955" y="655" text-anchor="middle" font-family="${POLICE}" font-size="34" font-weight="bold" fill="${ROUGE}">${esc(d.reference)}</text>

  <!-- ══ Pied gris : renvoi vers la définition ══ -->
  <rect x="0" y="820" width="${W}" height="80" fill="${NEUTRE}"/>
  <text x="${W / 2}" y="868" text-anchor="middle" font-family="${POLICE}" font-size="22" fill="${GRIS_CLAIR}">* Consultez notre définition du Sans Vis-à-Vis en scannant le QR code.</text>
</svg>`;
}

export async function genererVisuelPng(d: DonneesVisuel): Promise<Buffer> {
  // QR déterministe (aucun horodatage). Encode la RÉFÉRENCE (jamais numéro/jeton).
  const qrPng = await qrToBuffer(urlVisuel(d.urlBase, d.reference), {
    type: 'png',
    margin: 1,
    errorCorrectionLevel: 'M',
    width: 250,
    color: { dark: ENCRE, light: BLANC },
  });
  const svg = construireSvg(d, qrPng.toString('base64'));
  return sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
}
