/**
 * GÉNÉRATEUR de la carte d'orientation (SERVEUR) — Lot 5.
 *
 * Régénère la carte du certificat DEPUIS lat/lon/azimut persistés (jamais une capture front) : mosaïque de tuiles
 * IGN « Plan IGN » (WMTS Géoplateforme, licence ouverte Etalab) + overlay vectoriel (faisceau, cône, origine,
 * Nord, ATTRIBUTION GRAVÉE). Rendu cohérent avec l'écran de validation (même géométrie GEOMETRIE_VALIDATION, mêmes
 * couleurs : faisceau rouge #dc2626, cône bleu métier #2563eb/#3b82f6). La géodésie vient du module PUR partagé
 * (`geodesieAffichage.destination`) — JAMAIS une 3e implémentation (filet du verrou geodesieAffichage.test).
 *
 * PUR de tout état applicatif : ni base, ni stockage, ni React. Le réseau (fetch des tuiles) est INJECTABLE
 * (`opts.fetchTuile`) → testable sans réseau. Le dépôt + l'écriture de la clé sont ailleurs (`publierCarteOrientation`).
 */
import sharp, { type OverlayOptions } from 'sharp';
import { destination, GEOMETRIE_VALIDATION } from '../geodesieAffichage';

const TILE_PX = 256;
export const ZOOM = 18; // document imprimé : finesse ~0,39 m/px (l'IGN n'a aucun plafond WMTS), cf. recon R4
const TILEMATRIXSET = 'PM'; // WebMercator EPSG:3857 (recon R1 : URL GetTile testée)
const LAYER = 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2';

/** Demi-fenêtre de cadrage (m) : rayon du faisceau + 12 % de MARGE → la pointe du faisceau (250 m, sur l'axe) ne
 *  touche pas le bord (sinon l'arrowhead serait rogné). Origine au centre. Fenêtre ~560 m → ~49 tuiles z18, ~1427 px. */
const DEMI_FENETRE_M = GEOMETRIE_VALIDATION.rayonM * 1.12; // 280 m

/** Tolérance aux tuiles manquantes : voir en-tête `genererCarteOrientation`. */
const SEUIL_ECHEC_TUILES = 0.25; // > 25 % de tuiles perdues → carte jugée non fiable → échec (carte NULL)

/** Attribution IGN, GRAVÉE dans l'image (survit à l'extraction/recadrage/capture). Source déclarée par le service. */
const ATTRIBUTION = '© IGN / Géoplateforme — Plan IGN';

/** Erreur d'une carte trop trouée pour faire foi (tuile centrale absente, ou trop d'échecs). */
export class ErreurCarteIncomplete extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurCarteIncomplete';
  }
}

// ── Projection WebMercator (slippy map standard, EPSG:3857) ──
function tailleMonde(z: number): number {
  return TILE_PX * 2 ** z;
}
function lonVersX(lon: number, ws: number): number {
  return ((lon + 180) / 360) * ws;
}
function latVersY(lat: number, ws: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * ws;
}

export interface Cadre {
  zoom: number;
  ws: number; // taille du monde en px au zoom
  left: number; // bord gauche de la fenêtre en px MONDE
  top: number; // bord haut de la fenêtre en px MONDE
  outW: number; // largeur de sortie (px)
  outH: number; // hauteur de sortie (px)
  tMinX: number;
  tMaxX: number;
  tMinY: number;
  tMaxY: number;
  centerTile: { x: number; y: number }; // tuile contenant l'origine (obligatoire → sinon carte non fiable)
  tuiles: { x: number; y: number; dx: number; dy: number }[]; // dx/dy = offset sur le canvas d'assemblage
}

/**
 * CADRAGE PUR (aucun réseau) : centre (lat,lon) → fenêtre carrée de côté 2·DEMI_FENETRE_M au zoom ZOOM, plage de
 * tuiles à récupérer, et offsets d'assemblage. Testable en valeurs figées.
 */
export function cadrer(lat: number, lon: number): Cadre {
  const ws = tailleMonde(ZOOM);
  const cx = lonVersX(lon, ws);
  const cy = latVersY(lat, ws);
  const res = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** ZOOM; // m/px à cette latitude
  const halfPx = DEMI_FENETRE_M / res;
  const left = cx - halfPx;
  const top = cy - halfPx;
  const right = cx + halfPx;
  const bottom = cy + halfPx;
  const tMinX = Math.floor(left / TILE_PX);
  const tMaxX = Math.floor(right / TILE_PX);
  const tMinY = Math.floor(top / TILE_PX);
  const tMaxY = Math.floor(bottom / TILE_PX);
  const tuiles: Cadre['tuiles'] = [];
  for (let ty = tMinY; ty <= tMaxY; ty++) {
    for (let tx = tMinX; tx <= tMaxX; tx++) {
      tuiles.push({ x: tx, y: ty, dx: (tx - tMinX) * TILE_PX, dy: (ty - tMinY) * TILE_PX });
    }
  }
  return {
    zoom: ZOOM, ws, left, top, outW: Math.round(2 * halfPx), outH: Math.round(2 * halfPx),
    tMinX, tMaxX, tMinY, tMaxY,
    centerTile: { x: Math.floor(cx / TILE_PX), y: Math.floor(cy / TILE_PX) },
    tuiles,
  };
}

/** Projette (lat,lon) → pixel LOCAL de la fenêtre (0,0 = coin haut-gauche de l'image de sortie). PUR. */
export function projeter(lat: number, lon: number, cadre: Cadre): [number, number] {
  return [lonVersX(lon, cadre.ws) - cadre.left, latVersY(lat, cadre.ws) - cadre.top];
}

/** Échappe le texte inséré dans le SVG (attribution). */
function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Géométrie du tracé PASSÉE au dessin (plus AUCUN chiffre en dur ici) : demi-ouverture du champ, rayon de l'axe,
 * rayon du champ, échantillonnage de l'arc. Le CERTIFICAT passe la géométrie MOTEUR (cf. `publierCarteOrientation`).
 * Le paramètre `geom` est REQUIS partout (aucun défaut) → le compilateur refuse l'oubli, jamais de repli silencieux
 * vers la cosmétique. L'écran `FaisceauMap` a son PROPRE rendu Leaflet et n'appelle PAS cette fonction.
 */
export interface GeometrieTrace {
  demiAngleDeg: number; // demi-ouverture du champ dessiné (moteur : 90° → champ 180°)
  rayonAxeM: number; // longueur de l'axe (faisceau / verdict)
  rayonChampM: number; // rayon du champ (arc de bord + dégradé)
  arcPoints: number; // nombre de points d'échantillonnage de l'arc
}

/** Géométrie COSMÉTIQUE de l'écran de validation, EXPORTÉE pour qu'un appelant qui la veut la passe EN CONSCIENCE.
 *  Ce n'est PAS un défaut : `geom` est requis → aucun repli automatique vers ces valeurs sur le chemin du certificat. */
export const TRACE_VALIDATION: GeometrieTrace = {
  demiAngleDeg: GEOMETRIE_VALIDATION.demiConeDeg,
  rayonAxeM: GEOMETRIE_VALIDATION.rayonM,
  rayonChampM: GEOMETRIE_VALIDATION.rayonConeM,
  arcPoints: GEOMETRIE_VALIDATION.arcPoints,
};

/**
 * OVERLAY SVG (px LOCAUX de la fenêtre), forme F3 : CHAMP analysé en dégradé radial (dense à l'origine, transparent
 * à la portée → la carte reste lisible au loin) + ARC DE BORD bleu métier (il PORTE l'affirmation « analysé jusqu'à
 * la portée sur le champ »), AXE du verdict (rouge), point d'origine, flèche Nord, ATTRIBUTION gravée. Toute la
 * géométrie vient du paramètre `geom` — aucun chiffre de champ/portée en dur. Sommets projetés via `destination()`
 * puis `projeter()`. PUR, testable sans réseau.
 */
export function construireSvg(
  cadre: Cadre,
  lat: number,
  lon: number,
  azimutDeg: number,
  geom: GeometrieTrace, // REQUIS : chaque appelant passe SA géométrie (le certificat = moteur), jamais de défaut
): string {
  const { demiAngleDeg, rayonAxeM, rayonChampM, arcPoints } = geom;
  const [ox, oy] = projeter(lat, lon, cadre);

  // Champ : origine + arc à rayonChampM (secteur ± demiAngleDeg autour de l'axe).
  const arc: [number, number][] = [];
  for (let i = 0; i < arcPoints; i++) {
    const b = azimutDeg - demiAngleDeg + (i * 2 * demiAngleDeg) / (arcPoints - 1);
    const [dlat, dlon] = destination(lat, lon, b, rayonChampM);
    arc.push(projeter(dlat, dlon, cadre));
  }
  const secteur = [[ox, oy] as [number, number], ...arc].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const arcBord = arc.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // Rayon du champ en pixels (dégradé radial) : distance origine → bord, mesurée sur l'axe.
  const [clat, clon] = destination(lat, lon, azimutDeg, rayonChampM);
  const [cxp, cyp] = projeter(clat, clon, cadre);
  const rChampPx = Math.hypot(cxp - ox, cyp - oy);

  // Faisceau / axe du verdict : origine → pointe à rayonAxeM.
  const [tlat, tlon] = destination(lat, lon, azimutDeg, rayonAxeM);
  const [tx, ty] = projeter(tlat, tlon, cadre);

  const { outW, outH } = cadre;
  // Flèche Nord (coin haut-droit), axe écran vertical.
  const nx = outW - 34;
  const ny0 = 24;
  const ny1 = 60;
  const attrH = 26;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">`,
    // Dégradé radial du champ (bleu métier) : opaque à l'origine, transparent à la portée.
    `<defs><radialGradient id="champ" gradientUnits="userSpaceOnUse" cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="${rChampPx.toFixed(2)}"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.3"/><stop offset="0.75" stop-color="#3b82f6" stop-opacity="0.1"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient></defs>`,
    // Champ analysé (remplissage dégradé, sans contour).
    `<polygon points="${secteur}" fill="url(#champ)" stroke="none"/>`,
    // Arc de bord (bleu métier) — PORTE l'affirmation « analysé jusqu'à la portée sur le champ ».
    `<path d="${arcBord}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>`,
    // Faisceau / axe du verdict (rouge SVAV).
    `<line x1="${ox.toFixed(2)}" y1="${oy.toFixed(2)}" x2="${tx.toFixed(2)}" y2="${ty.toFixed(2)}" stroke="#dc2626" stroke-width="4" stroke-linecap="round"/>`,
    // Point d'origine.
    `<circle cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="6" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>`,
    // Flèche Nord.
    `<line x1="${nx}" y1="${ny1}" x2="${nx}" y2="${ny0}" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/>`,
    `<polygon points="${nx},${ny0 - 4} ${nx - 5},${ny0 + 6} ${nx + 5},${ny0 + 6}" fill="#1f2937"/>`,
    `<text x="${nx}" y="${ny1 + 15}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1f2937" text-anchor="middle">N</text>`,
    // Attribution GRAVÉE (bande semi-opaque bas de carte → lisible sur tout fond, survit à l'extraction).
    `<rect x="0" y="${outH - attrH}" width="${outW}" height="${attrH}" fill="#000000" fill-opacity="0.55"/>`,
    `<text x="8" y="${outH - 8}" font-family="sans-serif" font-size="13" fill="#ffffff">${echapper(ATTRIBUTION)}</text>`,
    `</svg>`,
  ].join('');
}

/** Récupère une tuile PNG via le WMTS Géoplateforme (KVP). Timeout borné pour ne jamais suspendre l'émission. */
async function fetchTuileReseau(z: number, x: number, y: number): Promise<Buffer> {
  const url =
    `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${LAYER}` +
    `&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=${TILEMATRIXSET}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sansvisavis-certificat' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`WMTS HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface OptionsGeneration {
  /** Injection réseau (tests). Défaut : WMTS Géoplateforme réel. Renvoie le PNG de la tuile ou throw. */
  fetchTuile?: (z: number, x: number, y: number) => Promise<Buffer>;
}

/**
 * Génère la carte d'orientation (PNG). Chaîne : cadrage → récupération PARALLÈLE des tuiles → assemblage sur canvas
 * → recadrage centré → overlay SVG → PNG.
 *
 * TUILE MANQUANTE — comportement décidé : une tuile qui échoue N'ABAT PAS la carte (allSettled) ; sa zone reste le
 * fond neutre du canvas (trou clair au coin, acceptable). MAIS deux garde-fous rendent une carte trop trouée en
 * ÉCHEC (→ carte_orientation_cle NULL, re-fabricable) : (1) la tuile CENTRALE (celle de l'origine + base du
 * faisceau) est OBLIGATOIRE — sans elle le document perd son sujet ; (2) au-delà de SEUIL_ECHEC_TUILES (25 %) de
 * pertes, la carte est jugée non fiable. « Un trou blanc au coin vaut mieux que pas de carte ; une carte à moitié
 * vide ne vaut rien » : ces deux lignes tracent la frontière.
 */
export async function genererCarteOrientation(
  lat: number,
  lon: number,
  azimutDeg: number,
  geom: GeometrieTrace, // REQUIS : géométrie du tracé, passée EN CONSCIENCE par l'appelant (certificat = moteur)
  opts: OptionsGeneration = {},
): Promise<Buffer> {
  const cadre = cadrer(lat, lon);
  const fetchTuile = opts.fetchTuile ?? fetchTuileReseau;

  const resultats = await Promise.allSettled(cadre.tuiles.map((t) => fetchTuile(cadre.zoom, t.x, t.y)));

  const composites: OverlayOptions[] = [];
  let echecs = 0;
  let centreOk = false;
  resultats.forEach((r, i) => {
    const t = cadre.tuiles[i];
    if (r.status === 'fulfilled') {
      composites.push({ input: r.value, left: t.dx, top: t.dy });
      if (t.x === cadre.centerTile.x && t.y === cadre.centerTile.y) centreOk = true;
    } else {
      echecs += 1;
      console.warn(`[carte-orientation] tuile z${cadre.zoom} ${t.x}/${t.y} manquante (${(r.reason as Error)?.message ?? 'erreur'})`);
    }
  });

  if (!centreOk) throw new ErreurCarteIncomplete('tuile centrale (origine) manquante');
  if (echecs > cadre.tuiles.length * SEUIL_ECHEC_TUILES) {
    throw new ErreurCarteIncomplete(`trop de tuiles manquantes : ${echecs}/${cadre.tuiles.length}`);
  }

  // Assemblage : canvas neutre (les trous éventuels restent clairs) → mosaïque.
  const nx = cadre.tMaxX - cadre.tMinX + 1;
  const ny = cadre.tMaxY - cadre.tMinY + 1;
  const mosaique = await sharp({
    create: { width: nx * TILE_PX, height: ny * TILE_PX, channels: 4, background: { r: 238, g: 238, b: 238, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Recadrage exact centré sur l'origine.
  const cropLeft = Math.round(cadre.left - cadre.tMinX * TILE_PX);
  const cropTop = Math.round(cadre.top - cadre.tMinY * TILE_PX);
  const fond = await sharp(mosaique)
    .extract({ left: cropLeft, top: cropTop, width: cadre.outW, height: cadre.outH })
    .png()
    .toBuffer();

  // Overlay vectoriel (rastérisé par librsvg via sharp). Géométrie passée EN CONSCIENCE par l'appelant (jamais de défaut).
  const svg = construireSvg(cadre, lat, lon, azimutDeg, geom);
  return sharp(fond).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
}
