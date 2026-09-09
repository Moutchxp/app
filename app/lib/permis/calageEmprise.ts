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
/** En-deçà de ce résidu PAR POINT (m), le repère est de BONNE qualité (vert) ; entre ce seuil et SEUIL_RESIDU_CALAGE_M, à surveiller (orange) ;
 *  au-delà, douteux (rouge). N'a de sens qu'à partir de 3 repères (sur 2, tous les écarts sont nuls par construction). */
export const SEUIL_RESIDU_CALAGE_BON_M = 0.5;
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

/**
 * INVERSE de la similitude (Lambert → plan) : z = (w − d)/c. `null` si la similitude est dégénérée (|c|² = a²+b² = 0). Aller-retour
 * EXACT avec appliquerSimilitude (aux erreurs flottantes près). Sert à estimer l'étendue du dessin AVANT tout tracé, en projetant la
 * parcelle (connue en Lambert) dans l'espace PLAN où vivent les repères de calage. PUR.
 */
export function inverseSimilitude(s: Similitude, p: PointLambert): PointPlan | null {
  const den = s.a * s.a + s.b * s.b;
  if (den === 0) return null;
  const wx = p.x - s.tx, wy = p.y - s.ty;
  return { x: (wx * s.a + wy * s.b) / den, y: (wy * s.a - wx * s.b) / den };
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

/**
 * RÉSIDU PAR POINT (m) : pour CHAQUE paire, l'écart entre son point PLAN projeté par la similitude et son Lambert réel. Sur 2 paires,
 * tous les écarts sont NULS par construction (le fit passe EXACTEMENT par les 2 points) — ce n'est PAS un gage de qualité, à NE PAS afficher
 * comme tel. Dès 3 paires, un écart élevé DÉSIGNE le repère mal pointé. `indexPlusFautif` = indice du plus grand écart (-1 si la similitude
 * est indéfinissable : < 2 paires ou points plan confondus, `ecarts` alors vide). PUR, aucune I/O. AUCUN arrondi (l'arrondi n'existe qu'à l'affichage).
 */
export interface ResidusParPoint { ecarts: number[]; indexPlusFautif: number }
export function residusParPoint(paires: PaireCalage[]): ResidusParPoint {
  const s = calculerSimilitude(paires);
  if (s === null) return { ecarts: [], indexPlusFautif: -1 };
  const ecarts = paires.map((p) => { const q = appliquerSimilitude(s, p.plan); return Math.hypot(q.x - p.lambert.x, q.y - p.lambert.y); });
  let indexPlusFautif = -1, max = -1;
  for (let i = 0; i < ecarts.length; i++) if (ecarts[i] > max) { max = ecarts[i]; indexPlusFautif = i; }
  return { ecarts, indexPlusFautif };
}

// ── ÉCARTEMENT des repères de calage : sensibilité au clic (PROJ, lot 2) ─────────────────────────────────────────────────────
// Reprise EXACTE de la dérivation de la recon V1. Une similitude sur 2 repères est fixée par ces 2 points : une erreur de pointage δ
// (exprimée en MÈTRES terrain) sur un repère fait PIVOTER tout le dessin autour de l'AUTRE repère (le pivot). Au sommet situé à
// distance R du pivot, l'erreur induite vaut  erreur_sommet = (R / L) × δ_terrain  (L = base de calage). Le facteur R/L = le « levier » :
//   · ≈ 1  → le dessin est encadré par les repères (interpolation) : faible sensibilité ;
//   · > 1  → on extrapole HORS de la zone contrôlée par les repères (repères trop rapprochés) : forte sensibilité (cas 11434).
// R (PIRE cas : le mésclic peut porter sur l'UN OU l'autre repère) = le sommet le plus éloigné, mesuré depuis le repère qui en est le
//   plus loin, soit  max sur les repères de (distance au sommet le plus éloigné)  — identique au levier de la recon V1.
// R/L est SANS DIMENSION (similitude conforme) : sa valeur est la même en points-plan qu'en Lambert. On le calcule ici en ESPACE PLAN.
// `erreur_par_pixel = levier × (mètres terrain par pixel écran)` : X en cm est le message utile (jamais R/L à l'écran).
/** Levier ≤ ce seuil : repères bien écartés, cas NOMINAL (rassurant). Constante nommée → futur réglage pilotable. */
export const SEUIL_LEVIER_RASSURANT_MAX = 1.5;
/** Levier ≥ ce seuil : repères nettement trop proches du dessin (alerte forte). Constante nommée → futur réglage pilotable. */
export const SEUIL_LEVIER_ELEVE_MIN = 3.0;
export type EtatLevier = 'rassurant' | 'intermediaire' | 'eleve';
/** Classe un levier en trois états SANS vocabulaire d'échec (rassurant / intermédiaire / élevé). PUR. */
export function etatLevier(levier: number): EtatLevier {
  if (levier <= SEUIL_LEVIER_RASSURANT_MAX) return 'rassurant';
  if (levier >= SEUIL_LEVIER_ELEVE_MIN) return 'eleve';
  return 'intermediaire';
}
export interface LevierCalage { L: number; R: number; levier: number; erreurParPixelM: number | null }
/**
 * ÉCARTEMENT des repères vs étendue du dessin (PUR). `L` = base de calage (plus grande distance entre deux repères). `R` = pire-cas du
 * sommet le plus éloigné (voir en-tête). `levier = R/L`. `erreurParPixelM = levier × metresTerrainParPixel` (X, la sensibilité au clic) si
 * l'échelle écran est fournie, sinon `null`. `null` si < 2 repères, aucun sommet, ou repères confondus (L = 0 → pas de division par zéro).
 */
export function levierCalage(paires: PaireCalage[], sommetsPlan: PointPlan[], metresTerrainParPixel: number | null = null): LevierCalage | null {
  if (paires.length < 2 || sommetsPlan.length === 0) return null;
  const reperes = paires.map((p) => p.plan);
  let L = 0;
  for (let i = 0; i < reperes.length; i++) for (let j = i + 1; j < reperes.length; j++) L = Math.max(L, Math.hypot(reperes[i].x - reperes[j].x, reperes[i].y - reperes[j].y));
  if (!(L > 0)) return null; // repères confondus → base nulle : aucun levier définissable (jamais de division par zéro)
  let R = 0;
  for (const c of reperes) { let d = 0; for (const s of sommetsPlan) d = Math.max(d, Math.hypot(s.x - c.x, s.y - c.y)); R = Math.max(R, d); }
  const levier = R / L;
  const erreurParPixelM = metresTerrainParPixel !== null && metresTerrainParPixel >= 0 ? levier * metresTerrainParPixel : null;
  return { L, R, levier, erreurParPixelM };
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

/**
 * PROJ-3j — ROTATION PURE d'un point autour d'un centre (angle en DEGRÉS, sens SVG horaire en repère y-bas — même convention que
 * `transform="rotate(a cx cy)"`). AUCUN arrondi : la précision est préservée. 🔴 La rotation est un PARAMÈTRE D'AFFICHAGE seulement :
 * pour ramener un clic sur le schéma TOURNÉ dans le repère NON tourné, on applique l'angle OPPOSÉ (inverse exact) avant tout calcul.
 */
export function rotePoint(p: { x: number; y: number }, centre: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - centre.x, dy = p.y - centre.y;
  return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
}

export interface CadreVue { minX: number; minY: number; w: number; h: number }

/**
 * PROJ-3k — BOÎTE ENGLOBANTE du contenu APRÈS ROTATION (en coordonnées de boîte), + une marge proportionnelle uniforme. Sert de
 * `viewBox` SVG : le contenu tourné remplit alors le cadre (aucune marge inutile), et le cadre se réADAPTE à chaque angle. AUCUN
 * arrondi (précision préservée). PUR. `pad` = fraction du plus grand côté (marge uniforme → ne déforme pas les proportions).
 */
export function boiteEnglobanteRotee(pointsBox: { x: number; y: number }[], centre: { x: number; y: number }, angleDeg: number, pad = 0.04): CadreVue {
  if (pointsBox.length === 0) return { minX: 0, minY: 0, w: 1, h: 1 };
  const r = pointsBox.map((p) => rotePoint(p, centre, angleDeg));
  const xs = r.map((p) => p.x), ys = r.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY, m = Math.max(w, h, 1) * pad;
  return { minX: minX - m, minY: minY - m, w: w + 2 * m, h: h + 2 * m };
}

/**
 * PROJ-3k — CLIC → coordonnée de BOÎTE (non tournée), en tenant compte de : (1) la mise à l'échelle du RENDU (le SVG occupe `ew×eh`
 * pixels écran pour un `viewBox` `vb`), puis (2) la ROTATION (angle opposé). Résultat IDENTIQUE quel que soit l'angle ET la taille de
 * rendu → le calage reste exact. AUCUN arrondi. PUR.
 */
export function clicVersBoite(ex: number, ey: number, ew: number, eh: number, vb: CadreVue, centre: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const vbx = vb.minX + (ew > 0 ? (ex * vb.w) / ew : 0);
  const vby = vb.minY + (eh > 0 ? (ey * vb.h) / eh : 0);
  return rotePoint({ x: vbx, y: vby }, centre, -angleDeg);
}

/**
 * 🔴 CORRECTIF CALAGE CÔTÉ SCHÉMA — le SVG du schéma est en `preserveAspectRatio="xMidYMid meet"` (+ un `maxHeight` qui, dès qu'il
 * PLAFONNE la hauteur, ou en vue AGRANDIE, rend le rapport d'aspect du conteneur ≠ de celui du viewBox). En « meet », le viewBox est
 * mis à l'échelle pour TENIR dans le conteneur (scale = min) et CENTRÉ (xMid/yMid) → il y a un LETTERBOX (marges). Mapper le clic sur la
 * BOUNDING BOX ENTIÈRE (comme `clicVersBoite` seul) fausse alors l'échelle ET ignore le décalage des marges → le marqueur persistant
 * tombe À CÔTÉ du curseur ET le point Lambert STOCKÉ est faux. `clicVersBoiteMeet` reconstitue le rectangle RÉELLEMENT rendu (scale
 * « meet » + centrage) puis délègue à `clicVersBoite`. Sans letterbox (aspect conteneur = aspect viewBox) → strictement identique à
 * `clicVersBoite`. PUR, testé (le filet du schéma). NE dépend PAS de getScreenCTM (indisponible en test) : géométrie explicite.
 */
export function clicVersBoiteMeet(ex: number, ey: number, ew: number, eh: number, vb: CadreVue, centre: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const scale = Math.min(ew > 0 ? ew / vb.w : 0, eh > 0 ? eh / vb.h : 0); // « meet » = tenir dans le conteneur (le plus petit facteur)
  if (!(scale > 0)) return clicVersBoite(ex, ey, ew, eh, vb, centre, angleDeg); // conteneur/viewBox dégénéré → repli sûr
  const rw = vb.w * scale, rh = vb.h * scale;                                   // rectangle EFFECTIVEMENT rendu
  const offX = (ew - rw) / 2, offY = (eh - rh) / 2;                             // centrage xMid / yMid (marges du letterbox)
  return clicVersBoite(ex - offX, ey - offY, rw, rh, vb, centre, angleDeg);     // clic ramené dans le rendu réel, puis échelle + dé-rotation
}

/**
 * PROJ-3l — CLIC écran → coordonnée du DOCUMENT (canvas non transformé), en annulant le ZOOM et le DÉPLACEMENT (pan) appliqués au
 * PDF de gauche (transform `translate(pan) scale(zoom)`, origine haut-gauche). Résultat IDENTIQUE à zoom 1 / pan 0 → le calage reste
 * exact. AUCUN arrondi. PUR.
 */
export function ecranVersCanvas(clientX: number, clientY: number, rectLeft: number, rectTop: number, pan: { x: number; y: number }, zoom: number): { x: number; y: number } {
  const z = zoom > 0 ? zoom : 1;
  return { x: (clientX - rectLeft - pan.x) / z, y: (clientY - rectTop - pan.y) / z };
}

/**
 * PROJ-3l — un geste est-il un CLIC (poser un point) plutôt qu'un GLISSEMENT (déplacer) ? Vrai si le pointeur a bougé de MOINS que
 * `seuil` px depuis l'appui. Un petit tremblement pendant un clic pose quand même un point ; un vrai glissement déplace sans poser. PUR.
 */
export function estClic(dx: number, dy: number, seuil = 5): boolean {
  return dx * dx + dy * dy < seuil * seuil;
}

// ── Vraisemblance (affichée, JAMAIS bloquante) ───────────────────────────────
// PROJ (correctif du contrôle de plausibilité) — le nombre de niveaux est TOUJOURS celui DU bâtiment (permis_corps_batiment.nb_etages),
//   jamais un max sur le permis. Le plancher déclaré, lui, est au niveau du PERMIS ENTIER (permis_caracteristique). On n'affirme donc
//   un chiffre QUE lorsque c'est démontrable (cf. les 3 situations de verdictVraisemblance).
export interface BatimentVraisemblance {
  corpsId: number;
  nbEtages: number | null;  // niveaux DE CE bâtiment (permis_corps_batiment.nb_etages) — jamais un agrégat du permis
  empriseM2: number | null; // aire de l'emprise reconstituée ENREGISTRÉE de ce bâtiment (null si pas encore tracée)
}
export interface EntreeVraisemblance {
  aireM2: number;                     // emprise du bâtiment COURANT (tracé en cours OU enregistré)
  corpsId: number | null;             // bâtiment courant (pour le retrouver dans `batiments`)
  surfacePlancherM2: number | null;   // surface de plancher déclarée — au niveau du PERMIS ENTIER (base)
  surfaceTerrainM2: number | null;    // surface de la parcelle/terrain (base)
  batiments: BatimentVraisemblance[]; // TOUS les bâtiments du permis (niveaux + emprise éventuelle)
}
export type EmpriseVsPlancher = 'coherent' | 'grande' | 'petite' | 'inconnu';
export interface VerdictVraisemblance {
  depasseTerrain: boolean;          // 🔴 impossible : une emprise ne peut pas dépasser le terrain
  empriseVsPlancher: EmpriseVsPlancher;
  empriseAttendueM2: number | null; // attendu chiffré quand démontrable (a : plancher/niveaux ; c : plancher total/niveaux) ; sinon null
  messages: string[];               // REPÈRES INDICATIFS lisibles (n'empêchent JAMAIS d'enregistrer)
}

/**
 * Vraisemblance de l'emprise reconstituée face à ce qu'on SAIT du permis. 🔴 NE BLOQUE RIEN, NE MESURE RIEN : uniquement des REPÈRES
 * INDICATIFS (une emprise reconstituée n'est jamais une mesure — garde PROJ). On n'affirme QUE le démontrable :
 *  · terrain : une emprise > surface du terrain est IMPOSSIBLE (signalé fort), quel que soit le nombre de bâtiments ;
 *  · (a) permis à UN SEUL bâtiment, niveaux connus (>0) : aire ≈ plancher déclaré ÷ niveaux DU bâtiment (±TOLERANCE) ;
 *  · (b) permis à PLUSIEURS bâtiments : contrôle par bâtiment IMPOSSIBLE (le plancher est global) → repère NEUTRE, aucun verdict ;
 *  · (c) permis à PLUSIEURS bâtiments TOUS tracés et à niveaux COMMUNS : Σ emprises ≈ plancher total ÷ niveaux (±TOLERANCE), à
 *        l'échelle du permis.
 * Niveaux inconnus/nuls, ou multi-bâtiments non tous tracés / à niveaux hétérogènes → aucun chiffre, seulement le repère neutre.
 * Un écart hors tolérance se dit « à vérifier », jamais une faute. Tolérance NOMMÉE, marge large (le bâti réel varie).
 */
export const TOLERANCE_EMPRISE_PLANCHER_RELATIVE = 0.4; // ± 40 % autour de l'emprise attendue
export function verdictVraisemblance(e: EntreeVraisemblance): VerdictVraisemblance {
  const messages: string[] = [];
  const depasseTerrain = e.surfaceTerrainM2 !== null && e.surfaceTerrainM2 > 0 && e.aireM2 > e.surfaceTerrainM2;
  if (depasseTerrain) messages.push(`🔴 emprise ${Math.round(e.aireM2)} m² SUPÉRIEURE au terrain ${Math.round(e.surfaceTerrainM2!)} m² : impossible, à revoir`);

  let empriseAttendueM2: number | null = null;
  let empriseVsPlancher: EmpriseVsPlancher = 'inconnu';
  const plancher = e.surfacePlancherM2 !== null && e.surfacePlancherM2 > 0 ? e.surfacePlancherM2 : null;
  const nbBat = e.batiments.length;
  // Aire à considérer pour un bâtiment : le COURANT prend l'aire en cours (`aireM2`), les autres leur emprise enregistrée.
  const aireDe = (b: BatimentVraisemblance): number | null => (b.corpsId === e.corpsId ? e.aireM2 : b.empriseM2);
  // Classe un écart en REPÈRE indicatif (jamais un verdict de faute) : sous tolérance / au-dessus → « à vérifier ».
  const classer = (aire: number, attendu: number, prefixe: string, detail: string): void => {
    empriseAttendueM2 = attendu;
    const bas = attendu * (1 - TOLERANCE_EMPRISE_PLANCHER_RELATIVE);
    const haut = attendu * (1 + TOLERANCE_EMPRISE_PLANCHER_RELATIVE);
    if (aire < bas) { empriseVsPlancher = 'petite'; messages.push(`${prefixe} ${Math.round(aire)} m² INFÉRIEURE à l'attendu ~${Math.round(attendu)} m² (${detail}) — écart à vérifier (repère indicatif, pas une mesure).`); }
    else if (aire > haut) { empriseVsPlancher = 'grande'; messages.push(`${prefixe} ${Math.round(aire)} m² SUPÉRIEURE à l'attendu ~${Math.round(attendu)} m² (${detail}) — écart à vérifier (repère indicatif, pas une mesure).`); }
    else { empriseVsPlancher = 'coherent'; messages.push(`${prefixe} ${Math.round(aire)} m² cohérente avec ~${Math.round(attendu)} m² attendus (${detail}, repère indicatif).`); }
  };

  if (plancher !== null && nbBat <= 1) {
    // (a) PERMIS À UN SEUL BÂTIMENT : niveaux DU bâtiment courant (à défaut, l'unique bâtiment déclaré).
    const niv = (e.corpsId !== null ? e.batiments.find((b) => b.corpsId === e.corpsId)?.nbEtages : undefined) ?? (nbBat === 1 ? e.batiments[0].nbEtages : null);
    if (niv !== null && niv > 0) classer(e.aireM2, plancher / niv, 'aire', `plancher déclaré ${Math.round(plancher)} m² ÷ ${niv} niveaux du bâtiment`);
    else messages.push(`plancher déclaré ${Math.round(plancher)} m² : nombre de niveaux du bâtiment inconnu, aire non recoupée (repère indicatif).`);
  } else if (plancher !== null && nbBat > 1) {
    // (b/c) PERMIS À PLUSIEURS BÂTIMENTS.
    const tousTraces = e.batiments.every((b) => (aireDe(b) ?? 0) > 0);
    const niveaux = e.batiments.map((b) => b.nbEtages);
    const commun = niveaux.every((n) => n !== null && n > 0) && new Set(niveaux).size === 1 ? (niveaux[0] as number) : null;
    if (tousTraces && commun !== null) {
      // (c) tous tracés, niveaux communs → contrôle à l'échelle du PERMIS : somme des emprises vs plancher total ÷ niveaux.
      const somme = e.batiments.reduce((s, b) => s + (aireDe(b) ?? 0), 0);
      classer(somme, plancher / commun, `à l'échelle du permis (${nbBat} bâtiments), somme des emprises`, `plancher total ${Math.round(plancher)} m² ÷ ${commun} niveaux, ensemble des bâtiments`);
    } else {
      // (b) repère NEUTRE : jamais de verdict petit/grand par bâtiment (le plancher est global).
      messages.push(`plancher déclaré ${Math.round(plancher)} m² : il porte sur l'ensemble du permis (${nbBat} bâtiments) et ne permet pas de recouper l'aire d'un bâtiment isolément (repère indicatif).`);
    }
  }
  return { depasseTerrain, empriseVsPlancher, empriseAttendueM2, messages };
}

// ── Débordement de l'emprise hors de la parcelle rattachée (REPÈRE indicatif, jamais un verdict) ──────────────────────────────
export interface Debordement {
  aireM2: number;                   // aire de l'emprise (base, ST_Area)
  parcelleRattachee: boolean;       // false = aucune parcelle rattachée → part hors indisponible (jamais une valeur inventée)
  aireHorsM2: number | null;        // aire de la part hors parcelle (ST_Difference), null si pas de parcelle
  pctHors: number | null;           // aireHors / aire × 100
  decalageLateralM: number | null;  // largeur moyenne d'un bandeau équivalent (voir formule ci-dessous), null si pas de parcelle
}
/**
 * Dérive les repères de débordement (PUR) à partir des mesures géométriques brutes venues de PostGIS (aire, aire hors parcelle,
 * périmètre de la zone hors parcelle). 🔴 Ces mesures sont faites sur la géométrie Lambert-93 RECALCULÉE CÔTÉ SERVEUR (garde PROJ).
 * AUCUN arrondi ici (l'arrondi n'existe qu'à l'affichage).
 *
 * `decalageLateralM` = largeur moyenne du bandeau de débordement : un bandeau mince de longueur L et de largeur w a une aire A ≈ L·w
 * et un périmètre P ≈ 2·L, donc w ≈ 2·A / P. On prend donc `decalageLateralM = 2 × aireHors / périmètre(zone hors parcelle)` — une
 * APPROXIMATION clairement nommée « largeur moyenne équivalente », pas une distance mesurée point à point.
 */
export function deriverDebordement(aireM2: number, parcelleRattachee: boolean, aireHorsM2: number | null, perimetreHorsM: number | null): Debordement {
  if (!parcelleRattachee) return { aireM2, parcelleRattachee: false, aireHorsM2: null, pctHors: null, decalageLateralM: null };
  const hors = aireHorsM2 ?? 0;
  const pctHors = aireM2 > 0 ? (hors / aireM2) * 100 : 0;
  const decalageLateralM = perimetreHorsM !== null && perimetreHorsM > 0 ? (2 * hors) / perimetreHorsM : (hors === 0 ? 0 : null);
  return { aireM2, parcelleRattachee: true, aireHorsM2: hors, pctHors, decalageLateralM };
}

// ── AJUSTEMENT MANUEL RÉVERSIBLE d'une emprise projetée (PROJ-3t, lot 3a) ─────────────────────────────────────────────────────
// 🔴 DELTA appliqué PAR-DESSUS le tracé d'origine, jamais un écrasement. Similitude RIGIDE UNIQUEMENT (translation + rotation + échelle
//   UNIFORME) — jamais d'affine/cisaillement/échelles X≠Y (invariant A1 : plus de paramètres masquerait l'erreur en déformant le bâtiment).
//   Le `centre` (centroïde figé À LA POSE) est stocké, jamais recalculé à la lecture. NULL = aucun ajustement → géométrie d'origine.
/** DELTA d'ajustement rigide. `pose_le`/`pose_par` = traçabilité (qui/quand) dans la donnée elle-même. */
export interface Ajustement { tx: number; ty: number; rotDeg: number; echelle: number; centre: { x: number; y: number }; pose_le?: string | null; pose_par?: string | null }

/** Un objet jsonb est-il un ajustement EXPLOITABLE ? (nombres finis, échelle > 0, centre valide). Défensif : un delta malformé est ignoré (traité comme NULL). */
export function ajustementValide(a: unknown): a is Ajustement {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const c = o.centre as Record<string, unknown> | undefined;
  return fini(o.tx) && fini(o.ty) && fini(o.rotDeg) && fini(o.echelle) && (o.echelle as number) > 0 && typeof c === 'object' && c !== null && fini(c.x) && fini(c.y);
}

/** Applique le DELTA à UN point : échelle uniforme autour du centre, PUIS rotation autour du centre, PUIS translation. Réutilise rotePoint. PUR. */
export function appliquerAjustementPoint(p: PointLambert, a: Ajustement): PointLambert {
  const sx = a.centre.x + a.echelle * (p.x - a.centre.x), sy = a.centre.y + a.echelle * (p.y - a.centre.y);
  const r = rotePoint({ x: sx, y: sy }, a.centre, a.rotDeg);
  return { x: r.x + a.tx, y: r.y + a.ty };
}

/**
 * Applique l'ajustement à un anneau (contour). `null` → l'anneau D'ORIGINE inchangé (NULL = aucun ajustement, comportement identique à
 * aujourd'hui). 🔴 ORDRE : ce delta s'applique APRÈS les retouches par sommet (retoucherEmprise réécrit `geom` ; le delta ride au-dessus,
 * à la LECTURE). Les deux mécanismes cohabitent sans s'annuler. AUCUN arrondi. PUR.
 */
export function appliquerAjustement(anneau: PointLambert[], a: Ajustement | null): PointLambert[] {
  if (a === null) return anneau;
  return anneau.map((p) => appliquerAjustementPoint(p, a));
}

/** Inverse du delta sur un point : dé-translation, PUIS dé-rotation (angle opposé), PUIS dé-échelle autour du centre. Inverse EXACT de appliquerAjustementPoint. PUR. */
export function inverseAjustementPoint(p: PointLambert, a: Ajustement): PointLambert {
  const t = { x: p.x - a.tx, y: p.y - a.ty };
  const r = rotePoint(t, a.centre, -a.rotDeg);
  return { x: a.centre.x + (r.x - a.centre.x) / a.echelle, y: a.centre.y + (r.y - a.centre.y) / a.echelle };
}

/** Inverse du delta sur un anneau (retour à l'origine). `null` → anneau inchangé. PUR. */
export function inverseAjustement(anneau: PointLambert[], a: Ajustement | null): PointLambert[] {
  if (a === null) return anneau;
  return anneau.map((p) => inverseAjustementPoint(p, a));
}

// ── Gestes d'ajustement (PROJ-3t, lot 3b) : pas nommés (futur réglage pilotable), centroïde (centre stocké), résumé lisible ──────
/** Pas de TRANSLATION par clic bouton, en MÈTRES terrain (10 cm). Constante nommée → futur réglage pilotable. */
export const PAS_TRANSLATION_M = 0.10;
/** Pas de ROTATION par clic bouton, en DEGRÉS (1°). */
export const PAS_ROTATION_DEG = 1;
/** Pas d'ÉCHELLE par clic bouton, en POURCENT (1 %). */
export const PAS_ECHELLE_PCT = 1;
/** Bornes de sécurité de l'échelle (un ajustement reste une reconstitution : on empêche les valeurs absurdes, jamais on ne « mesure »). */
export const ECHELLE_MIN = 0.2, ECHELLE_MAX = 5;

/** Centre stocké dans le delta = centroïde d'AIRE (shoelace) de l'ensemble des anneaux, repli sur la moyenne des sommets si aire nulle. PUR. */
export function centroideAnneaux(anneaux: PointLambert[][]): PointLambert {
  let ax = 0, ay = 0, aTot = 0;
  for (const ring of anneaux) {
    const n = ring.length; if (n < 3) continue;
    let a2 = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; const cross = p.x * q.y - q.x * p.y; a2 += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross; }
    if (a2 !== 0) { ax += cx / 6; ay += cy / 6; aTot += a2 / 2; }
  }
  if (aTot !== 0) return { x: ax / aTot, y: ay / aTot };
  const pts = anneaux.flat(); if (pts.length === 0) return { x: 0, y: 0 };
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/** Résumé LISIBLE d'un delta (langage d'Arno, jamais de jargon) : déplacement (m), rotation (°, normalisée −180..180), échelle (%). PUR. */
export interface ResumeAjustement { deplacementM: number; rotationDeg: number; echellePct: number }
export function resumeAjustement(a: Ajustement): ResumeAjustement {
  const rot = ((a.rotDeg % 360) + 540) % 360 - 180; // ramène dans (−180 ; 180]
  return { deplacementM: Math.hypot(a.tx, a.ty), rotationDeg: rot, echellePct: (a.echelle - 1) * 100 };
}

/** Delta IDENTITÉ pour une géométrie (centre = son centroïde) : point de départ d'un ajustement neuf (aucun déplacement). PUR. */
export function ajustementIdentite(anneaux: PointLambert[][]): Ajustement {
  return { tx: 0, ty: 0, rotDeg: 0, echelle: 1, centre: centroideAnneaux(anneaux) };
}
