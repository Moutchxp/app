/**
 * Résultat B / Couche 1 — note de dégagement /80 (distances PERÇUES boostées par famille).
 *
 * Module Bloc A PUR : aucun accès DB, aucune IA, déterministe et testable. Consomme des
 * `FaisceauResultat` DÉJÀ enrichis (impactNature, natureTraverseeM, impactAncien) + un profil.
 *
 * NON BRANCHÉ : aucun appelant du pipeline ne l'utilise → n'affecte NI le verdict NI le
 * Résultat A. Toute la pondération est externalisée dans `profilDegagement.ts`. Aucun arrondi.
 */
import type { FaisceauResultat } from './scoreDegagement';
import { azimutVersSecteur } from './scoreDegagement';
import type { ProfilDegagement } from './profilDegagement';
import { ORIENTATION_PTS } from './config';

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

// ── Cartouche de contexte « dégagement » (descriptive, SCORE-ONLY) — seuils (m) ──
const SEUIL_DEGAGE_M = 40; // dégagé si distanceObstacleM == null || >= 40
const SEUIL_LOINTAIN_M = 100; // « lointain »
const SEUIL_PANORAMA_M = 200; // panorama (portée max)
const SEUIL_FACE_M = 70; // percée frontale des 5 faisceaux centraux
const SEUIL_LATERAL_DENT_M = 6; // largeur latérale d'une « dent creuse »

/**
 * Distance PERÇUE d'un faisceau (m) selon la/les famille(s) déclenchée(s) et le profil.
 *
 * - F1 (toujours) : base factuelle = min(distanceObstacleM ?? distanceMaxM, distanceMaxM).
 * - F2 (impactAncien && distanceObstacleM != null) : min(distance × (1 + boostF2), distanceMaxM).
 * - F3 (impactNature ∈ naturesRemarquables) : forfait coneCentral / extremites (peut dépasser distanceMaxM).
 * - F4 (natureTraverseeM > 0) : ADDITIF — min(base + boostF4 × longueur, distanceMaxM).
 *
 * F1 étant toujours déclenchée, le résultat ne descend jamais sous la base factuelle.
 */
export function distancePercueFaisceau(f: FaisceauResultat, profil: ProfilDegagement): number {
  const { distanceMaxM } = profil;

  // F1 — base factuelle (toujours déclenchée) : distance réelle bornée à la portée.
  const base = Math.min(f.distanceObstacleM ?? distanceMaxM, distanceMaxM);
  const candidates: number[] = [base];

  // F2 — bâti avant 1900 : nécessite une distance d'impact réelle.
  if (f.impactAncien === true && f.distanceObstacleM != null) {
    candidates.push(Math.min(f.distanceObstacleM * (1 + profil.boostF2), distanceMaxM));
  }

  // F3 — monument remarquable : forfait selon position (cône central / extrémités), distance ignorée.
  if (f.impactNature != null && profil.naturesRemarquables.includes(f.impactNature)) {
    candidates.push(
      Math.abs(f.offsetDeg) <= profil.coneF3DemiAngleDeg
        ? profil.forfaitConeCentral
        : profil.forfaitExtremites,
    );
  }

  // F4 — nature traversée : ADDITIF sur la base factuelle (la nature S'AJOUTE à la distance réelle).
  if (f.natureTraverseeM != null && f.natureTraverseeM > 0) {
    candidates.push(Math.min(base + profil.boostF4 * f.natureTraverseeM, distanceMaxM));
  }

  switch (profil.modeCombinaison) {
    case 'max':
      return Math.max(...candidates);
    case 'addition': {
      // (NON activé) base + somme des gains de chaque famille déclenchée, borné à la portée.
      const gains = candidates.slice(1).reduce((acc, c) => acc + Math.max(0, c - base), 0);
      return Math.min(base + gains, distanceMaxM);
    }
    case 'sequentiel':
      // (NON activé) sémantique à fixer en calibration (boosts en chaîne) ; repli sûr sur le max.
      return Math.max(...candidates);
    default:
      return Math.max(...candidates);
  }
}

// ============================ Couloir (mur longeant l'axe) ============================
// Un bâtiment qui « longe » l'axe du regard à moins de `couloirSeuilLateralM` (distance ⊥ à
// l'axe) pénalise la NOTE (jamais le verdict). Détection 100 % LATÉRALE (distanceObstacleM ×
// sin|offset|) sur la distance BRUTE, par côté (droite/gauche) indépendants et cumulables. Le
// malus est PROPORTIONNEL au cumul brut S et au nombre de faisceaux de la chaîne. Réglages via profil.

/** Côté d'analyse du couloir, relatif à l'axe de visée. */
export type CoteCouloir = 'gauche' | 'droite';

export interface ChaineCouloir {
  validee: boolean;
  /** Indices (dans le tableau `faisceaux`) des faisceaux de la chaîne. `length` = n. */
  indices: number[];
  cote: CoteCouloir;
}

const degVersRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance ⊥ à l'axe (m) de l'obstacle d'un faisceau : distanceObstacleM × sin(|offset|). Sans obstacle → Infinity. */
function lateralCouloir(f: FaisceauResultat): number {
  return f.distanceObstacleM == null
    ? Infinity
    : f.distanceObstacleM * Math.sin(degVersRad(Math.abs(f.offsetDeg)));
}

/** Un faisceau « colle » l'axe : obstacle présent (non dégagé) ET latéral strictement sous le seuil. */
function colleAxe(f: FaisceauResultat, profil: ProfilDegagement): boolean {
  return f.distanceObstacleM != null && lateralCouloir(f) < profil.couloirSeuilLateralM;
}

/**
 * Détecte la chaîne « couloir » d'un côté, ordonné du BORD (|offset|=90°) vers l'AXE (|offset|=3°).
 * - Positions 1..couloirToleranceBordN : tolérées (n'empêchent pas l'enclenchement).
 * - Enclenchement : positions (tolérance+1)..couloirFenetreConditionN doivent TOUTES coller l'axe.
 *   Une seule qui échoue → validee=false, indices=[].
 * - Enclenché → indices = positions 1..couloirFenetreConditionN (tolérance incluse), prolongées aux
 *   positions suivantes tant que ça colle (rupture au 1er ≥ seuil ou dégagé). validee=true.
 * Lit `distanceObstacleM` (distance RÉELLE). Le faisceau d'axe (offset 0°) n'appartient à aucun côté.
 */
export function detecterChaineCouloir(
  faisceaux: FaisceauResultat[],
  profil: ProfilDegagement,
  cote: CoteCouloir,
): ChaineCouloir {
  // Flanc trié du bord (|offset| max) vers l'axe (|offset| min), index d'origine conservé.
  const flanc = faisceaux
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => (cote === 'droite' ? f.offsetDeg > 0 : f.offsetDeg < 0))
    .sort((a, b) => Math.abs(b.f.offsetDeg) - Math.abs(a.f.offsetDeg));

  const N = profil.couloirFenetreConditionN;
  const tol = profil.couloirToleranceBordN;
  if (flanc.length < N) return { validee: false, indices: [], cote };

  // Enclenchement : positions (tol+1)..N (1-based) collent toutes l'axe.
  for (let p = tol + 1; p <= N; p++) {
    if (!colleAxe(flanc[p - 1].f, profil)) return { validee: false, indices: [], cote };
  }

  // Chaîne = positions 1..N (tolérance incluse), puis prolongée tant que ça colle.
  const indices: number[] = [];
  for (let p = 1; p <= N; p++) indices.push(flanc[p - 1].i);
  for (let p = N + 1; p <= flanc.length; p++) {
    if (!colleAxe(flanc[p - 1].f, profil)) break;
    indices.push(flanc[p - 1].i);
  }
  return { validee: true, indices, cote };
}

/** Malus (mètres) d'une chaîne de `n` faisceaux : `couloirMalusPct` du cumul brut `S` par faisceau (linéaire, sans plafond). */
function malusCouloirM(n: number, S: number, profil: ProfilDegagement): number {
  return n * profil.couloirMalusPct * S;
}

/** Cumul BRUT des faisceaux : Σ (distanceObstacleM ?? distanceMaxM). Sans boost F2/F3/F4, = cumul perçu. */
function cumulBrut(faisceaux: FaisceauResultat[], profil: ProfilDegagement): number {
  return faisceaux.reduce((acc, f) => acc + (f.distanceObstacleM ?? profil.distanceMaxM), 0);
}

/** Diagnostic couloir des DEUX côtés (lecture seule) : validée, n (faisceaux de la chaîne), malus en m et en points. */
export function diagnostiquerCouloir(faisceaux: FaisceauResultat[], profil: ProfilDegagement) {
  const S = cumulBrut(faisceaux, profil);
  const denom = (faisceaux.length || 1) * profil.distanceMaxM;
  return (['gauche', 'droite'] as const).map((cote) => {
    const ch = detecterChaineCouloir(faisceaux, profil, cote);
    const n = ch.indices.length;
    const malusM = ch.validee ? malusCouloirM(n, S, profil) : 0;
    const malusPts = (malusM / denom) * profil.plafondCouche1;
    return { cote, validee: ch.validee, n, malusM, malusPts };
  });
}

/**
 * Note de dégagement /plafondCouche1 : cumul des distances perçues, minoré du malus couloir
 * (chaînes validées droite/gauche cumulables, proportionnel au cumul brut S), normalisé par la
 * portée × le nombre de faisceaux. Puis orientation (ORIENTATION_PTS), puis clamp [0, plafondCouche1].
 */
export function noteDegagement(faisceaux: FaisceauResultat[], profil: ProfilDegagement, azimutDeg?: number): number {
  if (faisceaux.length === 0) return 0;
  const cumulPercu = faisceaux.reduce((acc, f) => acc + distancePercueFaisceau(f, profil), 0);
  const S = cumulBrut(faisceaux, profil);
  let malusTotal = 0;
  for (const cote of ['droite', 'gauche'] as const) {
    const ch = detecterChaineCouloir(faisceaux, profil, cote);
    if (ch.validee) malusTotal += malusCouloirM(ch.indices.length, S, profil);
  }
  const cumulNet = Math.max(0, cumulPercu - malusTotal);
  const note = (cumulNet / faisceaux.length / profil.distanceMaxM) * profil.plafondDegagement;
  let noteAvecOrientation = note;
  if (typeof azimutDeg === "number") {
    const secteur = azimutVersSecteur(azimutDeg);          // même découpage que la boussole UI
    const pts = ORIENTATION_PTS[secteur] ?? 0;             // barème 0-10
    noteAvecOrientation = note + pts;
  }
  return clamp(noteAvecOrientation, 0, profil.plafondCouche1);   // clamp [0, plafondCouche1=90]
}

/**
 * Cartouche de contexte « dégagement » — DESCRIPTIVE, SCORE-ONLY : n'affecte NI le score NI le verdict.
 * 12 catégories mutuellement exclusives, évaluées dans l'ordre (premier match gagne). Groupes dérivés
 * du SIGNE de offsetDeg (gauche < 0, droite > 0, axe = 0) ; « centraux » = les 5 plus petits |offsetDeg|.
 * Réutilise `lateralCouloir` et `detecterChaineCouloir` (mêmes seuils couloir que le malus). Aucun arrondi.
 */
export function cartoucheDegagement(faisceaux: FaisceauResultat[], profil: ProfilDegagement): string {
  const estDegage = (f: FaisceauResultat): boolean =>
    f.distanceObstacleM == null || f.distanceObstacleM >= SEUIL_DEGAGE_M;

  const gauche = faisceaux.filter((f) => f.offsetDeg < 0);
  const droite = faisceaux.filter((f) => f.offsetDeg > 0);
  const centraux = [...faisceaux]
    .sort((a, b) => Math.abs(a.offsetDeg) - Math.abs(b.offsetDeg))
    .slice(0, 5);

  const n = faisceaux.length || 1;
  const partTotal = faisceaux.filter(estDegage).length / n;
  const partGauche = gauche.length ? gauche.filter(estDegage).length / gauche.length : 0;
  const partDroite = droite.length ? droite.filter(estDegage).length / droite.length : 0;
  const partLointain =
    faisceaux.filter((f) => f.distanceObstacleM == null || f.distanceObstacleM >= SEUIL_LOINTAIN_M).length / n;

  const chaineD = detecterChaineCouloir(faisceaux, profil, 'droite').validee;
  const chaineG = detecterChaineCouloir(faisceaux, profil, 'gauche').validee;

  // Nb de faisceaux « collés » latéralement (dent creuse) : obstacle proche ET latéral < seuil dent.
  const dentCote = (arr: FaisceauResultat[]): number =>
    arr.filter(
      (f) =>
        f.distanceObstacleM != null &&
        f.distanceObstacleM < SEUIL_DEGAGE_M &&
        lateralCouloir(f) < SEUIL_LATERAL_DENT_M,
    ).length;

  // Ordre EXACT — premier match gagne.
  if (
    partTotal === 1.0 &&
    faisceaux.every((f) => f.distanceObstacleM == null || f.distanceObstacleM >= SEUIL_PANORAMA_M)
  )
    return 'Panoramique';
  if (partTotal >= 0.9 && partLointain >= 0.6) return 'Totalement dégagée';
  if (partTotal >= 0.7) return 'Globalement dégagé';
  if (chaineD && chaineG) return 'Vue couloir';
  if (chaineD) return 'Enfilade à droite';
  if (chaineG) return 'Enfilade à gauche';
  if (partDroite >= 0.7 && partGauche <= 0.4) return 'Dégagé à droite';
  if (partGauche >= 0.7 && partDroite <= 0.4) return 'Dégagé à gauche';
  if (centraux.every(estDegage) && dentCote(gauche) >= 2 && dentCote(droite) >= 2 && !chaineD && !chaineG)
    return 'Dent creuse';
  if (
    centraux.every((f) => f.distanceObstacleM == null || f.distanceObstacleM >= SEUIL_FACE_M) &&
    partGauche < 0.4 &&
    partDroite < 0.4
  )
    return 'Vue face dégagée';
  if (partTotal >= 0.4) return 'Partiellement dégagée';
  return 'Environnement dense';
}
