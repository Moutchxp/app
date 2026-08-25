/**
 * PROJ-2 — géométrie PURE du tracé manuel assisté d'une emprise de futur bâtiment, calée sur la parcelle. AUCUNE I/O.
 *
 * ⚠️ GARDE FONDAMENTALE (rappel — la vérité vit dans la migration 149 et le repo) : une emprise tracée est une
 * RECONSTITUTION, jamais une mesure. Ce module ne fait QUE de la géométrie de reconstitution ; il n'alimente NI le verdict
 * SVAV, NI une injection d'altitude, NI un certificat. Nommage explicite (reconstitution*).
 *
 * ESPACE PLAN = points PDF (unité user-space : 1 pt = 1/72 pouce = surface PHYSIQUE de la feuille). C'est ce que rend le
 * viewport pdf.js. Travailler en points de page rend l'ÉCHELLE DÉCLARÉE (« 1:200 » imprimé sur la feuille) directement
 * comparable à l'échelle implicite du calage. LAMBERT = mètres (EPSG:2154).
 *
 * 🔴 SIMILITUDE UNIQUEMENT (échelle + rotation + translation, SANS réflexion). PAS d'affine, PAS d'homographie : un plan
 * n'est ni étiré ni déformé. Une transformation à plus de paramètres ABSORBERAIT l'erreur de calage en déformant le dessin,
 * la masquant au lieu de la montrer. La similitude conforme se résout par les COMPLEXES : w = c·z + d (c = échelle·e^{iθ}).
 */

/** Point de l'espace PLAN (points PDF user-space, feuille physique). */
export interface PointPlan { x: number; y: number }
/** Point LAMBERT-93 (mètres, EPSG:2154). */
export interface PointLambert { x: number; y: number }
/** Une paire de calage : un point du plan et son correspondant réel en Lambert-93. */
export interface PaireCalage { plan: PointPlan; lambert: PointLambert }

/**
 * Similitude conforme plan→Lambert : (x,y) ↦ (a·x − b·y + tx, b·x + a·y + ty). `a,b` = partie réelle/imaginaire de c = a+ib
 * (|c| = échelle en m/pt, arg(c) = rotation). PAS de réflexion (holomorphe). Dérivée par MOINDRES CARRÉS complexes → exacte
 * sur 2 paires, sur-déterminée (résidu VISIBLE) au-delà.
 */
export interface Similitude { a: number; b: number; tx: number; ty: number }

// ── Constantes d'échelle (feuille physique) ──────────────────────────────────
export const M_PAR_POUCE = 0.0254;   // 1 pouce = 0,0254 m
export const PT_PAR_POUCE = 72;      // 1 pouce = 72 points PDF (user-space)
/** Mètres réels par point PDF pour une échelle déclarée « 1:R » (paper→real). Ex. 1:200 → 0,0254/72 × 200. */
export function echelleDeclareeMParPt(ratio: number): number {
  return (M_PAR_POUCE / PT_PAR_POUCE) * ratio;
}

// ── Seuils de calage (NOMMÉS, jamais magiques ; le résidu s'AFFICHE toujours, ces seuils ne masquent rien) ──
/** Au-delà de ce résidu de fit (m), le calage est marqué « douteux » — AFFICHÉ quand même, jamais masqué. */
export const SEUIL_RESIDU_CALAGE_M = 1.0;
/** Écart RELATIF entre échelle implicite (calage) et échelle déclarée (feuille) au-delà duquel on alerte. 0,10 = 10 %.
 *  Motif mesuré : une feuille portait DEUX échelles (facteur 2,7) et un « 1:1000 » lu était une note de révision. */
export const SEUIL_ECART_ECHELLE_RELATIF = 0.10;

/**
 * Calcule la similitude plan→Lambert par moindres carrés complexes sur `paires` (≥ 2). `null` si < 2 paires ou si les
 * points PLAN sont confondus (variance nulle → pas d'échelle définissable). Sur 2 paires, le fit est EXACT (résidu 0).
 *
 * Résolution : w = c·z + d, min Σ|w_i − c·z_i − d|². Avec z̄,w̄ les moyennes : c = Σ conj(Δz_i)·Δw_i / Σ|Δz_i|², d = w̄ − c·z̄.
 */
export function calculerSimilitude(paires: PaireCalage[]): Similitude | null {
  if (paires.length < 2) return null;
  const n = paires.length;
  let zmx = 0, zmy = 0, wmx = 0, wmy = 0;
  for (const p of paires) { zmx += p.plan.x; zmy += p.plan.y; wmx += p.lambert.x; wmy += p.lambert.y; }
  zmx /= n; zmy /= n; wmx /= n; wmy /= n;
  // numérateur = Σ conj(Δz)·Δw (complexe), dénominateur = Σ|Δz|² (réel)
  let numRe = 0, numIm = 0, den = 0;
  for (const p of paires) {
    const dzx = p.plan.x - zmx, dzy = p.plan.y - zmy;
    const dwx = p.lambert.x - wmx, dwy = p.lambert.y - wmy;
    // conj(Δz)·Δw = (dzx − i·dzy)(dwx + i·dwy) = (dzx·dwx + dzy·dwy) + i(dzx·dwy − dzy·dwx)
    numRe += dzx * dwx + dzy * dwy;
    numIm += dzx * dwy - dzy * dwx;
    den += dzx * dzx + dzy * dzy;
  }
  if (den === 0) return null; // points plan confondus : aucune échelle
  const a = numRe / den, b = numIm / den;
  const tx = wmx - (a * zmx - b * zmy);
  const ty = wmy - (b * zmx + a * zmy);
  return { a, b, tx, ty };
}

/** Applique la similitude à un point du plan → Lambert-93. */
export function appliquerSimilitude(s: Similitude, p: PointPlan): PointLambert {
  return { x: s.a * p.x - s.b * p.y + s.tx, y: s.b * p.x + s.a * p.y + s.ty };
}

/** Échelle implicite du calage, en MÈTRES par point PDF (= |c|). */
export function echelleImpliciteMParPt(s: Similitude): number {
  return Math.hypot(s.a, s.b);
}

/** Échelle implicite exprimée en RATIO « 1:R » (pour comparer au « 1:200 » imprimé sur la feuille). */
export function ratioEchelleImplicite(s: Similitude): number {
  return echelleImpliciteMParPt(s) * (PT_PAR_POUCE / M_PAR_POUCE);
}

/**
 * RÉSIDU DE FIT (m) : écart quadratique moyen entre chaque point de calage projeté et son Lambert réel. Sur 2 paires = 0 par
 * construction (le fit passe EXACTEMENT par les 2 points) — ce n'est PAS un défaut : on le DIT à l'écran et on s'appuie alors
 * sur le contrôle d'échelle déclarée (ci-dessous) ou sur un 3e repère (qui rend ce résidu non nul et pleinement significatif).
 */
export function residuFitM(s: Similitude, paires: PaireCalage[]): number {
  if (paires.length === 0) return 0;
  let sse = 0;
  for (const p of paires) {
    const q = appliquerSimilitude(s, p.plan);
    sse += (q.x - p.lambert.x) ** 2 + (q.y - p.lambert.y) ** 2;
  }
  return Math.sqrt(sse / paires.length);
}

/** Distance Lambert (m) réelle entre les deux points d'une paire de paires (la « base » de calage). null si < 2 paires. */
export function baseLambertM(paires: PaireCalage[]): number | null {
  if (paires.length < 2) return null;
  const A = paires[0].lambert, B = paires[1].lambert;
  return Math.hypot(B.x - A.x, B.y - A.y);
}

/**
 * RÉSIDU D'ÉCHELLE DÉCLARÉE (m) : sur la base de calage, écart entre la longueur réelle et celle qu'IMPLIQUERAIT l'échelle
 * IMPRIMÉE sur la feuille. NON nul dès que l'échelle déclarée diffère de l'échelle du calage — c'est le détecteur du « 1:1000
 * qui était une note de révision » / des deux échelles sur une même feuille. `null` si < 2 paires ou pas d'échelle déclarée.
 */
export function residuEchelleDeclareeM(s: Similitude, paires: PaireCalage[], ratioDeclare: number | null): number | null {
  if (ratioDeclare === null || paires.length < 2) return null;
  const basePlan = Math.hypot(paires[1].plan.x - paires[0].plan.x, paires[1].plan.y - paires[0].plan.y);
  const reelImplicite = basePlan * echelleImpliciteMParPt(s);
  const reelDeclare = basePlan * echelleDeclareeMParPt(ratioDeclare);
  return Math.abs(reelImplicite - reelDeclare);
}

export interface VerdictCalage {
  residuFitM: number;                 // résidu de fit (0 sur 2 points)
  ratioImplicite: number;             // « 1:R » dérivé du calage
  ratioDeclare: number | null;        // « 1:R » lu sur la feuille (saisi), ou null
  residuEchelleM: number | null;      // écart en m sur la base, échelle implicite vs déclarée
  ecartEchelleRelatif: number | null; // |implicite − déclarée| / déclarée
  douteux: boolean;                   // au moins un signal au-delà d'un seuil NOMMÉ
  raisons: string[];                  // motifs LISIBLES (jamais masqués)
}

/**
 * Verdict de calage : agrège résidu de fit + comparaison d'échelle déclarée. « douteux » = un signal dépasse un seuil NOMMÉ.
 * ⚠️ On AFFICHE toujours (le douteux n'empêche rien) : le but est de MONTRER l'erreur, pas de la lisser.
 */
export function verdictCalage(s: Similitude, paires: PaireCalage[], ratioDeclare: number | null): VerdictCalage {
  const rf = residuFitM(s, paires);
  const ratioImplicite = ratioEchelleImplicite(s);
  const residuEchelleM = residuEchelleDeclareeM(s, paires, ratioDeclare);
  const ecartEchelleRelatif = ratioDeclare !== null && ratioDeclare > 0 ? Math.abs(ratioImplicite - ratioDeclare) / ratioDeclare : null;
  const raisons: string[] = [];
  if (rf > SEUIL_RESIDU_CALAGE_M) raisons.push(`résidu de calage ${rf.toFixed(2)} m au-delà de ${SEUIL_RESIDU_CALAGE_M} m`);
  if (ecartEchelleRelatif !== null && ecartEchelleRelatif > SEUIL_ECART_ECHELLE_RELATIF) {
    raisons.push(`échelle du calage (1:${Math.round(ratioImplicite)}) éloignée de l'échelle déclarée (1:${Math.round(ratioDeclare!)}) de ${(ecartEchelleRelatif * 100).toFixed(0)} %`);
  }
  return { residuFitM: rf, ratioImplicite, ratioDeclare, residuEchelleM, ecartEchelleRelatif, douteux: raisons.length > 0, raisons };
}

// ── Aire (Lambert, m²) ───────────────────────────────────────────────────────
/** Aire d'un anneau Lambert-93 par la formule du lacet (shoelace), en m². Anneau ouvert ou fermé accepté ; |signe| ignoré. */
export function aireM2(anneau: PointLambert[]): number {
  const n = anneau.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = anneau[i], q = anneau[(i + 1) % n];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** Projette un anneau tracé (plan) en anneau Lambert via la similitude. */
export function anneauVersLambert(s: Similitude, anneauPlan: PointPlan[]): PointLambert[] {
  return anneauPlan.map((p) => appliquerSimilitude(s, p));
}

// ── Projection Lambert ↔ boîte (schéma parcelle du tracé) ────────────────────
// Le schéma de parcelle est DESSINÉ (Lambert→boîte) ET CLIQUÉ (boîte→Lambert, désignation du point de calage). Les deux
// sens DOIVENT partager la MÊME projection, sinon un clic ne retombe pas sur le point dessiné. On garde donc les deux ici,
// dérivés d'un seul cadre. Échelle UNIFORME (pas de déformation), Y inversé (SVG descend), comme le schéma d'affectation.
export interface Cadre { minX: number; maxX: number; minY: number; maxY: number }
export interface Boite { largeur: number; hauteur: number; marge: number; cadre: Cadre }

/** Bbox Lambert d'un ensemble d'anneaux (parcelle). null si aucun point. */
export function cadreDeAnneaux(anneaux: PointLambert[][]): Cadre | null {
  const pts = anneaux.flat();
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function facteurs(b: Boite): { scale: number; padX: number; padY: number; bw: number; bh: number } {
  const bw = b.cadre.maxX - b.cadre.minX, bh = b.cadre.maxY - b.cadre.minY;
  const scale = Math.min((b.largeur - 2 * b.marge) / bw, (b.hauteur - 2 * b.marge) / bh);
  return { scale, padX: (b.largeur - bw * scale) / 2, padY: (b.hauteur - bh * scale) / 2, bw, bh };
}

/** Lambert → coordonnées BOÎTE (px SVG, Y vers le bas). */
export function projeterDansBoite(b: Boite, p: PointLambert): { x: number; y: number } {
  const { scale, padX, padY } = facteurs(b);
  return { x: (p.x - b.cadre.minX) * scale + padX, y: b.hauteur - ((p.y - b.cadre.minY) * scale + padY) };
}

/** Coordonnées BOÎTE (px SVG) → Lambert (inverse EXACT de projeterDansBoite). */
export function inverseDepuisBoite(b: Boite, px: { x: number; y: number }): PointLambert {
  const { scale, padX, padY } = facteurs(b);
  return { x: (px.x - padX) / scale + b.cadre.minX, y: (b.hauteur - px.y - padY) / scale + b.cadre.minY };
}

// ── Vraisemblance (affichée, JAMAIS bloquante) ───────────────────────────────
export interface EntreeVraisemblance {
  aireM2: number;
  surfacePlancherM2: number | null; // surface de plancher déclarée au permis (base)
  nbEtages: number | null;          // nombre d'étages déclaré (base)
  surfaceTerrainM2: number | null;  // surface de la parcelle/terrain (base)
}
export type EmpriseVsPlancher = 'coherent' | 'grande' | 'petite' | 'inconnu';
export interface VerdictVraisemblance {
  depasseTerrain: boolean;          // 🔴 impossible : une emprise ne peut pas dépasser le terrain
  empriseVsPlancher: EmpriseVsPlancher;
  empriseAttendueM2: number | null; // surfacePlancher / nbEtages (indication)
  messages: string[];               // constats LISIBLES (n'empêchent pas d'enregistrer)
}

/**
 * Vraisemblance de l'emprise reconstituée face à ce qu'on SAIT du permis. NE BLOQUE RIEN : renvoie des constats affichables.
 *  · terrain : une emprise > surface du terrain est IMPOSSIBLE (signalé fort) ;
 *  · plancher : emprise ≈ surfacePlancher / nbEtages (± 40 %) = cohérent ; très au-delà/en-deçà = signalé.
 * Tolérance NOMMÉE, marge large (le bâti réel varie : décrochés, combles, sous-sols hors emprise) — on alerte sur l'ABSURDE.
 */
export const TOLERANCE_EMPRISE_PLANCHER_RELATIVE = 0.4; // ± 40 % autour de l'emprise attendue
export function verdictVraisemblance(e: EntreeVraisemblance): VerdictVraisemblance {
  const messages: string[] = [];
  const depasseTerrain = e.surfaceTerrainM2 !== null && e.surfaceTerrainM2 > 0 && e.aireM2 > e.surfaceTerrainM2;
  if (depasseTerrain) messages.push(`🔴 emprise ${Math.round(e.aireM2)} m² SUPÉRIEURE au terrain ${Math.round(e.surfaceTerrainM2!)} m² : impossible, à revoir`);
  let empriseAttendueM2: number | null = null;
  let empriseVsPlancher: EmpriseVsPlancher = 'inconnu';
  if (e.surfacePlancherM2 !== null && e.surfacePlancherM2 > 0 && e.nbEtages !== null && e.nbEtages > 0) {
    empriseAttendueM2 = e.surfacePlancherM2 / e.nbEtages;
    const bas = empriseAttendueM2 * (1 - TOLERANCE_EMPRISE_PLANCHER_RELATIVE);
    const haut = empriseAttendueM2 * (1 + TOLERANCE_EMPRISE_PLANCHER_RELATIVE);
    if (e.aireM2 < bas) { empriseVsPlancher = 'petite'; messages.push(`emprise ${Math.round(e.aireM2)} m² plus PETITE qu'attendu (~${Math.round(empriseAttendueM2)} m² = ${Math.round(e.surfacePlancherM2)} m² plancher / ${e.nbEtages} niveaux)`); }
    else if (e.aireM2 > haut) { empriseVsPlancher = 'grande'; messages.push(`emprise ${Math.round(e.aireM2)} m² plus GRANDE qu'attendu (~${Math.round(empriseAttendueM2)} m²)`); }
    else { empriseVsPlancher = 'coherent'; messages.push(`emprise ${Math.round(e.aireM2)} m² cohérente avec ~${Math.round(empriseAttendueM2)} m² attendus`); }
  }
  return { depasseTerrain, empriseVsPlancher, empriseAttendueM2, messages };
}
