/**
 * GÉNÉRATEUR de la carte d'orientation (SERVEUR) — VUE EN HAUT.
 *
 * Régénère la carte du certificat DEPUIS lat/lon/azimut persistés (jamais une capture front) : mosaïque de tuiles
 * IGN « Plan IGN » (WMTS Géoplateforme, licence ouverte Etalab), PIVOTÉE de -azimut (l'axe du verdict pointe TOUJOURS
 * vers le HAUT, origine en bas-centre), + overlay vectoriel (cône, axe, origine, Nord tournant, ATTRIBUTION gravée
 * horizontale APRÈS rotation). Le cône reprend l'esthétique de l'écran de validation (aplat #3b82f6 @0.25, contour
 * #2563eb, axe #dc2626) MAIS garde la GÉOMÉTRIE MOTEUR (champ 180°, portée 200 m) passée par l'appelant.
 *
 * CADRAGE : sur la BBOX de la géométrie dessinée (pas le point d'origine) ; le zoom est DÉRIVÉ de la bbox et du
 * ratio du cartouche → aucun « ZOOM = 18 » en dur (changer la portée ne casse plus la carte en silence). La sortie
 * est produite AU RATIO DU CARTOUCHE (231,12 × 142,5 pt) → `cover` ne rogne rien côté PDF.
 *
 * PUR de tout état applicatif : ni base, ni stockage, ni React. Le réseau (fetch des tuiles) est INJECTABLE
 * (`opts.fetchTuile`) → testable sans réseau. DÉTERMINISTE : mêmes lat/lon/azimut/tuiles → mêmes octets (sharp pur).
 */
import sharp, { type OverlayOptions } from 'sharp';
// GEOMETRIE_VALIDATION = géométrie cosmétique de l'écran (repli TRACE_VALIDATION). L'overlay VUE EN HAUT est dessiné
// ANALYTIQUEMENT dans le repère de sortie (trig autour de l'origine, à l'échelle `mppOut` — donc aligné sur la carte),
// sans projection géodésique : `destination` n'est pas nécessaire ici (elle reste le verrou partagé de FaisceauMap).
import { GEOMETRIE_VALIDATION } from '../geodesieAffichage';

const TILE_PX = 256;
const TILEMATRIXSET = 'PM'; // WebMercator EPSG:3857
const LAYER = 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2';

// Sortie au RATIO du cartouche du certificat (certificatPdf : mW ≈ 231,12 pt × mediaH 142,5 pt). Pixels choisis pour
// ~312 dpi à l'impression. Le ratio EXACT évite tout rognage sous `cover` (la carte remplit le cartouche pile).
const OUT_W = 1000;
const OUT_H = Math.round((OUT_W * 142.5) / 231.12); // 617 — ratio cartouche

const MARGE_FRAC = 0.06; // marge autour de la bbox (fraction de la plus grande dimension)
const MARGE_BAS_M = 24; // dégagement sous l'origine → elle reste au-dessus de la bande d'attribution (26 px de haut)

const SEUIL_ECHEC_TUILES = 0.25; // > 25 % de tuiles perdues → carte jugée non fiable → échec (carte NULL)
const ATTRIBUTION = '© IGN / Géoplateforme — Plan IGN';

/** Erreur d'une carte trop trouée pour faire foi (tuile centrale absente, ou trop d'échecs). */
export class ErreurCarteIncomplete extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurCarteIncomplete';
  }
}

/**
 * Géométrie du tracé PASSÉE au dessin (aucun chiffre en dur) : demi-ouverture du champ, rayon de l'axe, rayon du
 * champ, échantillonnage de l'arc. Le CERTIFICAT passe la géométrie MOTEUR (cf. `publierCarteOrientation`). Le
 * paramètre `geom` est REQUIS partout → le compilateur refuse l'oubli, jamais de repli silencieux vers la cosmétique.
 * L'écran `FaisceauMap` a son PROPRE rendu Leaflet et n'appelle PAS ce module.
 */
export interface GeometrieTrace {
  demiAngleDeg: number; // demi-ouverture du champ dessiné (moteur : 90° → champ 180°)
  rayonAxeM: number; // longueur de l'axe (faisceau / verdict)
  rayonChampM: number; // rayon du champ (cône)
  arcPoints: number; // nombre de points d'échantillonnage de l'arc
}

/** Géométrie COSMÉTIQUE de l'écran de validation, EXPORTÉE pour qu'un appelant qui la veut la passe EN CONSCIENCE. */
export const TRACE_VALIDATION: GeometrieTrace = {
  demiAngleDeg: GEOMETRIE_VALIDATION.demiConeDeg,
  rayonAxeM: GEOMETRIE_VALIDATION.rayonM,
  rayonChampM: GEOMETRIE_VALIDATION.rayonConeM,
  arcPoints: GEOMETRIE_VALIDATION.arcPoints,
};

// ── Projection WebMercator (slippy map standard, EPSG:3857) ──
const RAD = Math.PI / 180;
function mppAt(lat: number, z: number): number {
  return (156543.03392 * Math.cos(lat * RAD)) / 2 ** z;
}
function lonToWorldX(lon: number, z: number): number {
  return ((lon + 180) / 360) * (TILE_PX * 2 ** z);
}
function latToWorldY(lat: number, z: number): number {
  const s = Math.sin(lat * RAD);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * (TILE_PX * 2 ** z);
}

/**
 * CADRAGE PUR (aucun réseau) — VUE EN HAUT. La géométrie est raisonnée dans le repère REDRESSÉ (origine en (0,0),
 * « haut » = direction azimut). BBOX = demi-disque du champ (± demiAngle à rayonChamp) + pointe de l'axe. On étend la
 * bbox au RATIO du cartouche (l'origine reste en bas-centre), on en DÉRIVE la résolution `mppOut`, puis un zoom source
 * ENTIER au moins aussi fin. Renvoie tout le nécessaire à l'assemblage/rotation/recadrage.
 */
export function cadrerVueEnHaut(lat: number, geom: GeometrieTrace) {
  const { demiAngleDeg, rayonAxeM, rayonChampM } = geom;
  // Extrêmes de la géométrie (repère redressé, mètres) : arc du champ + pointe de l'axe.
  let xmin = 0, xmax = 0, ymax = rayonAxeM;
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const th = (-demiAngleDeg + (i * 2 * demiAngleDeg) / n) * RAD;
    xmin = Math.min(xmin, rayonChampM * Math.sin(th));
    xmax = Math.max(xmax, rayonChampM * Math.sin(th));
    ymax = Math.max(ymax, rayonChampM * Math.cos(th));
  }
  const marge = MARGE_FRAC * Math.max(xmax - xmin, ymax);
  const left = xmin - marge;
  const right = xmax + marge;
  const bottom = -MARGE_BAS_M; // origine (y=0) légèrement au-dessus du bord bas
  const top = ymax + marge;
  // Étendre au ratio du cartouche (origine gardée en bas-centre : l'excédent va en HAUT / sur les côtés).
  const ratio = OUT_W / OUT_H;
  let wM = right - left, hM = top - bottom;
  if (wM / hM > ratio) hM = wM / ratio; // limité par la largeur → plus de ciel au-dessus de l'axe
  else wM = hM * ratio;
  const winBottom = bottom;
  const mppOut = wM / OUT_W;
  // Origine en pixels de sortie (bas-centre) : x centré, y près du bas.
  const ox = OUT_W / 2;
  const oy = OUT_H - (0 - winBottom) / mppOut; // y de l'origine (repère écran, 0 en haut)
  // Zoom source ENTIER au moins aussi fin que mppOut (on ne fait que réduire ensuite).
  const zSrc = Math.max(3, Math.min(20, Math.ceil(Math.log2((156543.03392 * Math.cos(lat * RAD)) / mppOut))));
  const mppSrc = mppAt(lat, zSrc);
  // Rayon source à couvrir autour de l'origine : plus grande distance origine → coin de la fenêtre de sortie.
  const coins: [number, number][] = [[0, 0], [OUT_W, 0], [0, OUT_H], [OUT_W, OUT_H]];
  let rMax = 0;
  for (const [pxc, pyc] of coins) {
    const dx = (pxc - ox) * mppOut;
    const dy = (oy - pyc) * mppOut;
    rMax = Math.max(rMax, Math.hypot(dx, dy));
  }
  const rSrcM = rMax * 1.04;
  return { mppOut, ox, oy, zSrc, mppSrc, rSrcM };
}

/** URL WMTS d'une tuile (KVP). */
async function fetchTuileReseau(z: number, x: number, y: number): Promise<Buffer> {
  const url =
    `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${LAYER}` +
    `&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=${TILEMATRIXSET}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sansvisavis-certificat' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`WMTS HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * OVERLAY SVG (px de SORTIE, repère REDRESSÉ) : cône (aplat #3b82f6 @0.25 + contour #2563eb — esthétique de l'écran),
 * axe du verdict VERTICAL (#dc2626, vers le haut), origine (point rouge, liseré blanc pour le fond IGN), flèche NORD
 * qui TOURNE avec la carte (bearing 0 = (−sin az, −cos az) dans le repère redressé), ATTRIBUTION gravée HORIZONTALE
 * (bande basse — obligation légale, lisible après rotation). Analytique : dans le repère redressé, un cap β s'affiche
 * à l'angle (β − azimut) horaire depuis le haut. PUR.
 */
export function construireOverlayVueEnHaut(ox: number, oy: number, mpp: number, azimutDeg: number, geom: GeometrieTrace): string {
  const { demiAngleDeg, rayonAxeM, rayonChampM, arcPoints } = geom;
  const pt = (dist: number, capRelDeg: number): [number, number] => {
    const a = capRelDeg * RAD;
    return [ox + (dist / mpp) * Math.sin(a), oy - (dist / mpp) * Math.cos(a)];
  };
  // Cône : origine + arc à ± demiAngle (repère redressé → l'axe est à 0°).
  const sommets: [number, number][] = [[ox, oy]];
  for (let i = 0; i < arcPoints; i++) sommets.push(pt(rayonChampM, -demiAngleDeg + (i * 2 * demiAngleDeg) / (arcPoints - 1)));
  const conePts = sommets.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const [tx, ty] = pt(rayonAxeM, 0); // pointe de l'axe (droit vers le haut)

  // Flèche Nord (coin haut-droit), orientée vers le vrai Nord de la carte pivotée.
  const na = -azimutDeg * RAD; // direction écran du Nord : (sin(na), -cos(na)) = (-sin az, -cos az)
  const ndx = Math.sin(na), ndy = -Math.cos(na);
  const nX = OUT_W - 46, nY = 46, nLen = 30;
  const bx = nX + ndx * nLen, by = nY + ndy * nLen; // pointe
  const perpX = -ndy, perpY = ndx;
  const a1x = bx - ndx * 11 + perpX * 6, a1y = by - ndy * 11 + perpY * 6;
  const a2x = bx - ndx * 11 - perpX * 6, a2y = by - ndy * 11 - perpY * 6;
  const attrH = 26;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">`,
    // Cône — APLAT (esthétique de l'écran de validation : #3b82f6 @0.25, contour #2563eb w2).
    `<polygon points="${conePts}" fill="#3b82f6" fill-opacity="0.25" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>`,
    // Axe du verdict — vertical, rouge SVAV.
    `<line x1="${ox.toFixed(2)}" y1="${oy.toFixed(2)}" x2="${tx.toFixed(2)}" y2="${ty.toFixed(2)}" stroke="#dc2626" stroke-width="5" stroke-linecap="round"/>`,
    // Origine — point rouge (liseré blanc conservé pour la lisibilité sur fond IGN ; l'écran, sur OSM, n'en a pas).
    `<circle cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>`,
    // Flèche Nord (tourne avec la carte).
    `<line x1="${nX}" y1="${nY}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/>`,
    `<polygon points="${bx.toFixed(2)},${by.toFixed(2)} ${a1x.toFixed(2)},${a1y.toFixed(2)} ${a2x.toFixed(2)},${a2y.toFixed(2)}" fill="#1f2937"/>`,
    `<text x="${(nX - ndx * 12).toFixed(2)}" y="${(nY - ndy * 12 + 5).toFixed(2)}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1f2937" text-anchor="middle">N</text>`,
    // Attribution GRAVÉE, HORIZONTALE (bande basse) — survit à l'extraction/capture.
    `<rect x="0" y="${OUT_H - attrH}" width="${OUT_W}" height="${attrH}" fill="#000000" fill-opacity="0.55"/>`,
    `<text x="8" y="${OUT_H - 8}" font-family="sans-serif" font-size="13" fill="#ffffff">${echapper(ATTRIBUTION)}</text>`,
    `</svg>`,
  ].join('');
}

export interface OptionsGeneration {
  /** Injection réseau (tests). Défaut : WMTS Géoplateforme réel. Renvoie le PNG de la tuile ou throw. */
  fetchTuile?: (z: number, x: number, y: number) => Promise<Buffer>;
}

/**
 * Génère la carte d'orientation (PNG, VUE EN HAUT). Chaîne : cadrage bbox → mosaïque source (z dérivé) centrée sur
 * l'origine → ROTATION de -azimut (l'axe pointe en haut) → recadrage au ratio du cartouche → overlay (cône/axe/Nord/
 * attribution). La tuile CENTRALE (origine) est OBLIGATOIRE ; au-delà de 25 % de pertes → ErreurCarteIncomplete.
 */
export async function genererCarteOrientation(
  lat: number,
  lon: number,
  azimutDeg: number,
  geom: GeometrieTrace, // REQUIS : géométrie du tracé (certificat = moteur), jamais de défaut
  opts: OptionsGeneration = {},
): Promise<Buffer> {
  const fetchTuile = opts.fetchTuile ?? fetchTuileReseau;
  const { mppOut, ox, oy, zSrc, mppSrc, rSrcM } = cadrerVueEnHaut(lat, geom);

  // Mosaïque source NORD-EN-HAUT couvrant l'origine ± rSrc (+ 1 tuile de marge pour l'extraction carrée).
  const oX = lonToWorldX(lon, zSrc), oY = latToWorldY(lat, zSrc);
  const rPx = rSrcM / mppSrc + TILE_PX;
  const tMinX = Math.floor((oX - rPx) / TILE_PX), tMaxX = Math.floor((oX + rPx) / TILE_PX);
  const tMinY = Math.floor((oY - rPx) / TILE_PX), tMaxY = Math.floor((oY + rPx) / TILE_PX);
  const centreTx = Math.floor(oX / TILE_PX), centreTy = Math.floor(oY / TILE_PX);

  const tuiles: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let ty = tMinY; ty <= tMaxY; ty++)
    for (let tx = tMinX; tx <= tMaxX; tx++)
      tuiles.push({ x: tx, y: ty, dx: (tx - tMinX) * TILE_PX, dy: (ty - tMinY) * TILE_PX });

  const resultats = await Promise.allSettled(tuiles.map((t) => fetchTuile(zSrc, t.x, t.y)));
  const composites: OverlayOptions[] = [];
  let echecs = 0, centreOk = false;
  resultats.forEach((r, i) => {
    const t = tuiles[i];
    if (r.status === 'fulfilled') {
      composites.push({ input: r.value, left: t.dx, top: t.dy });
      if (t.x === centreTx && t.y === centreTy) centreOk = true;
    } else {
      echecs += 1;
      console.warn(`[carte-orientation] tuile z${zSrc} ${t.x}/${t.y} manquante (${(r.reason as Error)?.message ?? 'erreur'})`);
    }
  });
  if (!centreOk) throw new ErreurCarteIncomplete('tuile centrale (origine) manquante');
  if (echecs > tuiles.length * SEUIL_ECHEC_TUILES) throw new ErreurCarteIncomplete(`trop de tuiles manquantes : ${echecs}/${tuiles.length}`);

  const mosaW = (tMaxX - tMinX + 1) * TILE_PX, mosaH = (tMaxY - tMinY + 1) * TILE_PX;
  const mosa = await sharp({ create: { width: mosaW, height: mosaH, channels: 4, background: { r: 238, g: 238, b: 238, alpha: 1 } } })
    .composite(composites).png().toBuffer();

  // Carré centré EXACTEMENT sur l'origine (pour que sharp.rotate, qui tourne autour du centre, garde l'origine au centre).
  const oMosaX = oX - tMinX * TILE_PX, oMosaY = oY - tMinY * TILE_PX;
  const demiCarre = Math.round(rSrcM / mppSrc + TILE_PX / 2);
  const carre = await sharp(mosa)
    .extract({ left: Math.round(oMosaX) - demiCarre, top: Math.round(oMosaY) - demiCarre, width: 2 * demiCarre, height: 2 * demiCarre })
    .png().toBuffer();

  // Rotation -azimut → l'axe (direction azimut) pointe vers le HAUT. Origine reste au centre (rotation autour du centre).
  const tourne = await sharp(carre).rotate(-azimutDeg, { background: { r: 238, g: 238, b: 238, alpha: 1 } }).png().toBuffer();
  const meta = await sharp(tourne).metadata();
  const roX = meta.width! / 2, roY = meta.height! / 2;

  // Recadrage de la fenêtre de sortie (échelle mppSrc → mppOut), origine placée en (ox, oy).
  const k = mppSrc / mppOut; // px sortie par px source
  const cropW = Math.round(OUT_W / k), cropH = Math.round(OUT_H / k);
  const cropLeft = Math.round(roX - ox / k), cropTop = Math.round(roY - oy / k);
  const fond = await sharp(tourne)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize(OUT_W, OUT_H)
    .png().toBuffer();

  // Overlay vectoriel (rastérisé par librsvg via sharp), repère redressé.
  const svg = construireOverlayVueEnHaut(ox, oy, mppOut, azimutDeg, geom);
  return sharp(fond).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
}
