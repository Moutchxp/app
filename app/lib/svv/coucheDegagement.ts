/**
 * Résultat B / Couche 1 — note de dégagement /80 (distances PERÇUES boostées par famille).
 *
 * Module Bloc A PUR : aucun accès DB, aucune IA, déterministe et testable. Consomme des
 * `FaisceauResultat` DÉJÀ enrichis (impactNature, natureTraverseeM, impactAncien) + un profil.
 *
 * BRANCHÉ : `noteDegagement` EST la note de score de Couche 1 (pipeline → analyse → scoreTotal →
 * noteDegagement) ; `mode_combinaison`/`mode_combinaison_repli` sont consultés via `combinerP1P2`.
 * N'affecte JAMAIS le verdict (100 % géométrique). Toute la pondération est externalisée dans
 * `profilDegagement.ts` / `config_scoring`. Aucun arrondi.
 */
import type { FaisceauResultat } from './scoreDegagement';
import { azimutVersSecteur } from './scoreDegagement';
import type { ProfilDegagement, FamilleCoeff, ModeCombinaison, ModeRepli } from './profilDegagement';
import { carteMatche } from './cartesAnnee';
import {
  CONE_VUE_NATURE_DEG,
  SEUIL_VUE_NATURE,
  SEUIL_NOM_PROFONDEUR,
  SEUIL_TRIGGER_IMMO,
  SEUIL_MAJORITE_IMMO,
  TRANCHES_EPOQUES,
} from './config';

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

// ── Cartouche de contexte « dégagement » (descriptive, SCORE-ONLY) — seuils (m) ──
const SEUIL_DEGAGE_M = 40; // dégagé si distanceObstacleM == null || >= 40
const SEUIL_LOINTAIN_M = 100; // « lointain »
const SEUIL_PANORAMA_M = 200; // panorama (portée max)
const SEUIL_FACE_M = 70; // percée frontale des 5 faisceaux centraux
const SEUIL_LATERAL_DENT_M = 6; // largeur latérale d'une « dent creuse »

/**
 * Diviseur de la Partie 2 (cumul nature) selon la longueur de nature traversée.
 * < seuilMinM → 1,0 (pas de division) ; sinon min(plafond, 1 + increment × floor((nature − baseM)/pasM)).
 */
function diviseurCumulNature(natureM: number, c: ProfilDegagement['cumulNature']): number {
  if (natureM < c.seuilMinM) return 1.0;
  return Math.min(c.plafond, 1.0 + c.increment * Math.floor((natureM - c.baseM) / c.pasM));
}

/**
 * Famille pondérée PRIORITAIRE du bâti heurté (première qui matche ; jamais de cumul de familles) :
 * MH → Inventaire → carte d'année (première dont l'intervalle réel contient l'année ; au plus une par
 * non-chevauchement) → `null` = bâti ordinaire (aucune pondération). Priorité INCHANGÉE.
 * (Patrimoine mondial est traité en amont dans distancePercueFaisceau : faisceau fixe.)
 */
function familleCoeff(f: FaisceauResultat, profil: ProfilDegagement): FamilleCoeff | null {
  const F = profil.famillesPonderation;
  if (f.impactMH === true) return F.mh;
  if (f.impactInventaire === true) return F.inventaire;
  const annee = f.impactAnnee;
  if (typeof annee === 'number') {
    const c = profil.famillesAnnee.find((carte) => carteMatche(carte, annee));
    if (c) return { cone: c.cone, flanc: c.flanc, distMaxM: c.distMaxM };
  }
  return null;
}

/**
 * Combine la part nature (P1) et la part bâti (P2, NON divisée) d'un faisceau pondéré.
 * - `natureM ≥ seuilMinM` → applique `mode` : `sequentiel` (P1 + P2÷diviseur, comportement ACTUEL),
 *   `addition` (P1 + P2, sans diviseur) ou `max` (max(P1, P2)).
 * - `natureM < seuilMinM` → applique le mode de `repli` (diviseur = 1, non appliqué) : `addition` ou `max`.
 * Le cap `fam.distMaxM` est appliqué EN DEHORS de cette fonction (par l'appelant).
 */
export function combinerP1P2(
  p1: number, p2: number, diviseur: number, natureM: number,
  seuilMinM: number, mode: ModeCombinaison, repli: ModeRepli,
): number {
  if (natureM >= seuilMinM) {
    switch (mode) {
      case 'sequentiel': return p1 + p2 / diviseur;   // comportement ACTUEL (bit-identique)
      case 'addition':   return p1 + p2;
      case 'max':        return Math.max(p1, p2);
    }
  }
  return repli === 'max' ? Math.max(p1, p2) : p1 + p2; // sous le seuil : diviseur = 1
}

/**
 * Distance PERÇUE d'un faisceau (m) — barème de pondération PAR FAMILLE (Étape 2, remplace le max).
 *
 * 1. Une SEULE famille s'applique, par priorité (familleCoeff) ; jamais de cumul de familles.
 *    - Patrimoine mondial (impactEmblematique) → faisceau FIXE (mondialFaisceauM), STOP.
 *    - MH / Inventaire / ≤1900 / 1901–1935 → coeff cône (|offset| ≤ coneFamilleDemiAngleDeg) ou flanc.
 *    - Bâti ordinaire (ou faisceau dégagé) → calcul CLASSIQUE : base F1 + F4 nature, capé distanceMaxM.
 * 2. Cumul nature + bâti (famille pondérée ET natureTraverseeM > 0) :
 *      P1 = valeur classique (base + F4 nature), capée cumulNature.capP1M.
 *      P2 = distanceReelle × coeff (NON divisée ; la division n'intervient qu'en mode `sequentiel`).
 *      Combinaison via `combinerP1P2` selon `modeCombinaison`, avec gating par cumulNature.seuilMinM :
 *        - natureM ≥ seuil → `sequentiel` (P1 + P2÷diviseur), `addition` (P1 + P2) ou `max` (max(P1, P2)) ;
 *        - natureM < seuil → mode de `modeCombinaisonRepli` (diviseur = 1) : `addition` ou `max`.
 *      total = min(combinerP1P2(…), distMax famille).
 *    Sans nature devant une famille pondérée : min(distanceReelle × coeff, distMax famille).
 *
 * N'affecte NI le verdict NI le Résultat A. `boostF2`/F3-forfait ne sont plus consultés ici
 * (l'année remplace boostF2 ; MH/Inventaire remplacent le forfait remarquable).
 */
export function distancePercueFaisceau(f: FaisceauResultat, profil: ProfilDegagement): number {
  const { distanceMaxM } = profil;

  // F1 base + F4 nature (calcul classique, capé à la portée globale) — bâti ordinaire ET Partie 1.
  const base = Math.min(f.distanceObstacleM ?? distanceMaxM, distanceMaxM);
  const natureM = f.natureTraverseeM ?? 0;
  const valeurClassique = natureM > 0 ? Math.min(base + profil.boostF4 * natureM, distanceMaxM) : base;

  // Patrimoine mondial : faisceau fixe, aucun autre calcul.
  if (f.impactEmblematique === true) return profil.famillesPonderation.mondialFaisceauM;

  const dist = f.distanceObstacleM;
  const fam = familleCoeff(f, profil);
  if (fam === null || dist === null) return valeurClassique; // ordinaire / dégagé → classique.

  const coeff = Math.abs(f.offsetDeg) <= profil.coneFamilleDemiAngleDeg ? fam.cone : fam.flanc;

  if (natureM > 0) {
    // Cumul nature + bâti.
    const p1 = Math.min(valeurClassique, profil.cumulNature.capP1M);
    const p2 = dist * coeff;
    const diviseur = diviseurCumulNature(natureM, profil.cumulNature);
    return Math.min(
      combinerP1P2(p1, p2, diviseur, natureM, profil.cumulNature.seuilMinM, profil.modeCombinaison, profil.modeCombinaisonRepli),
      fam.distMaxM,
    );
  }
  // Famille sans nature devant : distance réelle × coeff, capée distMax famille.
  return Math.min(dist * coeff, fam.distMaxM);
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

// ============================ SEAM VERBEUX (ventilation par faisceau) ============================
// LECTURE SEULE, ADDITIF, opt-in (banc d'essai M5). Source UNIQUE de vérité : `distancePercueFaisceau`
// (valeur par faisceau) et `ventilerNote` (agrégat) — `noteDegagement` DÉLÈGUE à `ventilerNote`. Les
// champs DESCRIPTIFS ci-dessous ne feed NI le score NI le verdict ; ils exposent la ventilation du calcul
// déjà effectué (aucun round-trip DB, aucun réordonnancement). N'altère pas le chemin de prod non demandé.

/** Famille pondérée RÉELLEMENT appliquée à un faisceau (miroir de la priorité de `familleCoeff` + mondial). */
export type FamilleFaisceau = 'mh' | 'inventaire' | 'mondial' | 'annee' | null;

/** Ventilation d'UN faisceau : valeur brute/perçue + contributions réellement appliquées (descriptif). */
export interface VentilationFaisceau {
  offsetDeg: number;
  /** Distance géométrique du 1er obstacle (m) ; `null` = faisceau dégagé. Indépendante du profil. */
  distanceBruteM: number | null;
  /** Distance perçue pondérée (m) = `distancePercueFaisceau(f, profil)` (source unique, bit-identique). */
  distancePercueM: number;
  /** Borne du PROFIL qui plafonne ce faisceau (base `distanceMaxM` / famille `distMaxM` / mondial), dérivée du profil. */
  seuilBorneM: number;
  /** Famille pondérée appliquée (ou `null` = bâti ordinaire / faisceau dégagé). */
  famille: FamilleFaisceau;
  /** Coefficient cône/flanc appliqué (`null` si ordinaire ou mondial fixe). */
  coeffApplique: number | null;
  /** Boost F4 nature appliqué (m) = `boostF4 × natureTraverseeM` (0 si pas de nature). */
  boostF4AppliqueM: number;
  /** Longueur de nature traversée (m). */
  natureTraverseeM: number;
  /** Diviseur de cumul nature (`null` si pas de cumul nature+bâti sur ce faisceau). */
  diviseurCumulNature: number | null;
  /** Mode de combinaison P1/P2 effectivement retenu (`null` si pas de cumul). */
  modeCombinaison: ModeCombinaison | ModeRepli | null;
  /** Le cap `famille.distMaxM` a-t-il mordu (min(…, distMaxM) actif) ? */
  capFamilleApplique: boolean;
}

/** Ventilation d'un côté du couloir (indices des faisceaux de la chaîne + malus en m). */
export interface VentilationCouloir {
  cote: CoteCouloir;
  validee: boolean;
  n: number;
  indices: number[];
  malusM: number;
}

/** Ventilation de l'AGRÉGAT (note) : intermédiaires exposés, `total` = la note officielle (source unique). */
export interface VentilationNote {
  total: number;
  cumulPercuM: number;
  cumulBrutM: number;
  malusCouloir: VentilationCouloir[]; // [droite, gauche]
  malusTotalM: number;
  cumulNetM: number;
  /** Note AVANT orientation = `(cumulNet / nb / distanceMaxM) × plafondDegagement` (valeur exacte). */
  noteAvantOrientation: number;
  /** Facteur de normalisation indicatif `(1 / nb / distanceMaxM) × plafondDegagement` (affichage). */
  facteurNormalisation: number;
  orientation: { secteur: string | null; points: number };
  clamp: { min: number; max: number; applique: boolean };
}

/** Ventilation complète d'une analyse : 61 lignes + agrégat. */
export interface VentilationAnalyse {
  lignes: VentilationFaisceau[];
  note: VentilationNote;
}

/**
 * Ventilation DESCRIPTIVE d'un faisceau. `distancePercueM` DÉLÈGUE à `distancePercueFaisceau` (source unique,
 * bit-identique) ; les contributions sont re-dérivées à l'identique du barème (elles ne feed pas le score).
 */
export function ventilerFaisceau(f: FaisceauResultat, profil: ProfilDegagement): VentilationFaisceau {
  const distancePercueM = distancePercueFaisceau(f, profil); // ← SOURCE UNIQUE de la valeur
  const natureM = f.natureTraverseeM ?? 0;
  const boostF4AppliqueM = natureM > 0 ? profil.boostF4 * natureM : 0;

  let famille: FamilleFaisceau = null;
  let coeffApplique: number | null = null;
  let diviseur: number | null = null;
  let modeEff: ModeCombinaison | ModeRepli | null = null;
  let capFamilleApplique = false;
  let seuilBorneM = profil.distanceMaxM;

  if (f.impactEmblematique === true) {
    famille = 'mondial';
    seuilBorneM = profil.famillesPonderation.mondialFaisceauM;
  } else {
    const fam = familleCoeff(f, profil);
    const dist = f.distanceObstacleM;
    if (fam !== null && dist !== null) {
      famille = f.impactMH === true ? 'mh' : f.impactInventaire === true ? 'inventaire' : 'annee';
      coeffApplique = Math.abs(f.offsetDeg) <= profil.coneFamilleDemiAngleDeg ? fam.cone : fam.flanc;
      seuilBorneM = fam.distMaxM;
      const base = Math.min(dist, profil.distanceMaxM);
      const valeurClassique = natureM > 0 ? Math.min(base + profil.boostF4 * natureM, profil.distanceMaxM) : base;
      if (natureM > 0) {
        const p1 = Math.min(valeurClassique, profil.cumulNature.capP1M);
        const p2 = dist * coeffApplique;
        diviseur = diviseurCumulNature(natureM, profil.cumulNature);
        modeEff = natureM >= profil.cumulNature.seuilMinM ? profil.modeCombinaison : profil.modeCombinaisonRepli;
        const combine = combinerP1P2(
          p1, p2, diviseur, natureM, profil.cumulNature.seuilMinM, profil.modeCombinaison, profil.modeCombinaisonRepli,
        );
        capFamilleApplique = fam.distMaxM < combine;
      } else {
        capFamilleApplique = fam.distMaxM < dist * coeffApplique;
      }
    }
  }

  return {
    offsetDeg: f.offsetDeg,
    distanceBruteM: f.distanceObstacleM,
    distancePercueM,
    seuilBorneM,
    famille,
    coeffApplique,
    boostF4AppliqueM,
    natureTraverseeM: natureM,
    diviseurCumulNature: diviseur,
    modeCombinaison: modeEff,
    capFamilleApplique,
  };
}

/**
 * Agrégat de la note — SOURCE UNIQUE de la formule (`noteDegagement` délègue à `.total`). Reproduit à
 * l'identique le calcul historique : cumul perçu − malus couloir, normalisé, + orientation, clampé. Expose
 * les intermédiaires. `total` est BIT-IDENTIQUE à l'ancienne `noteDegagement`.
 */
export function ventilerNote(faisceaux: FaisceauResultat[], profil: ProfilDegagement, azimutDeg?: number): VentilationNote {
  const clampMin = 0;
  const clampMax = profil.plafondCouche1;
  if (faisceaux.length === 0) {
    return {
      total: 0, cumulPercuM: 0, cumulBrutM: 0, malusCouloir: [], malusTotalM: 0, cumulNetM: 0,
      noteAvantOrientation: 0, facteurNormalisation: 0, orientation: { secteur: null, points: 0 },
      clamp: { min: clampMin, max: clampMax, applique: false },
    };
  }
  const cumulPercu = faisceaux.reduce((acc, f) => acc + distancePercueFaisceau(f, profil), 0);
  const S = cumulBrut(faisceaux, profil);
  let malusTotal = 0;
  const malusCouloir: VentilationCouloir[] = [];
  for (const cote of ['droite', 'gauche'] as const) {
    const ch = detecterChaineCouloir(faisceaux, profil, cote);
    const malusM = ch.validee ? malusCouloirM(ch.indices.length, S, profil) : 0;
    if (ch.validee) malusTotal += malusM; // ORDRE IDENTIQUE à l'historique : droite puis gauche
    malusCouloir.push({ cote, validee: ch.validee, n: ch.indices.length, indices: ch.indices, malusM });
  }
  const cumulNet = Math.max(0, cumulPercu - malusTotal);
  const note = (cumulNet / faisceaux.length / profil.distanceMaxM) * profil.plafondDegagement;
  let noteAvecOrientation = note;
  let secteur: ReturnType<typeof azimutVersSecteur> | null = null;
  let pts = 0;
  if (typeof azimutDeg === 'number') {
    secteur = azimutVersSecteur(azimutDeg);          // même découpage que la boussole UI (géométrie, en code)
    pts = profil.orientationPts[secteur] ?? 0;       // barème 0-10 (externalisé en config)
    noteAvecOrientation = note + pts;
  }
  const total = clamp(noteAvecOrientation, clampMin, clampMax);
  return {
    total,
    cumulPercuM: cumulPercu,
    cumulBrutM: S,
    malusCouloir,
    malusTotalM: malusTotal,
    cumulNetM: cumulNet,
    noteAvantOrientation: note,
    facteurNormalisation: (1 / faisceaux.length / profil.distanceMaxM) * profil.plafondDegagement,
    orientation: { secteur, points: pts },
    clamp: { min: clampMin, max: clampMax, applique: total !== noteAvecOrientation },
  };
}

/** Ventilation complète (61 lignes + agrégat) — assemblage opt-in pour le banc. */
export function ventilerAnalyse(faisceaux: FaisceauResultat[], profil: ProfilDegagement, azimutDeg?: number): VentilationAnalyse {
  return {
    lignes: faisceaux.map((f) => ventilerFaisceau(f, profil)),
    note: ventilerNote(faisceaux, profil, azimutDeg),
  };
}

/**
 * Note de dégagement /plafondCouche1 : cumul des distances perçues, minoré du malus couloir, normalisé,
 * + orientation, clampé. DÉLÈGUE à `ventilerNote` (source unique de l'agrégat) → `.total` bit-identique.
 */
export function noteDegagement(faisceaux: FaisceauResultat[], profil: ProfilDegagement, azimutDeg?: number): number {
  return ventilerNote(faisceaux, profil, azimutDeg).total;
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

/** Longueurs (m) de nature visible par catégorie + noms possibles (parc / plan d'eau). Extraite en base. */
export interface ExtractionVueNature {
  verdureM: number;
  planEauM: number;
  coursEauM: number;
  nomVerdure: string | null;
  nomPlanEau: string | null;
}

/**
 * Cartouche « vue nature » — DESCRIPTIVE, SCORE-ONLY : parallèle à natureTraverseeM, ne l'affecte PAS.
 * Déclenchée si ≥ SEUIL_VUE_NATURE des faisceaux du cône (|offset| ≤ CONE_VUE_NATURE_DEG) traversent de la
 * nature (natureTraverseeM > 0). Choisit la catégorie DOMINANTE (longueur max ; ex æquo → verdure > plan_eau
 * > cours_eau) : la nomme si elle a un nom ; sinon promeut un candidat nommé dont la longueur atteint
 * SEUIL_NOM_PROFONDEUR × dominante ; sinon libellé générique. `null` si non déclenchée ou rien d'extrait.
 */
export function cartoucheVueNature(
  faisceaux: FaisceauResultat[],
  extraction: ExtractionVueNature,
): string | null {
  const cone = faisceaux.filter((f) => Math.abs(f.offsetDeg) <= CONE_VUE_NATURE_DEG);
  const nCone = cone.length || 1;
  const nNature = cone.filter((f) => f.natureTraverseeM != null && f.natureTraverseeM > 0).length;
  if (nNature / nCone < SEUIL_VUE_NATURE) return null;

  interface Cat {
    longueur: number;
    nom: string | null;
    generique: string;
  }
  // Ordre fixe = priorité aux ex æquo : verdure > plan_eau > cours_eau.
  const candidats: Cat[] = [
    { longueur: extraction.verdureM, nom: extraction.nomVerdure, generique: 'Vue sur verdure' },
    { longueur: extraction.planEauM, nom: extraction.nomPlanEau, generique: "Vue sur étendue d'eau" },
    { longueur: extraction.coursEauM, nom: null, generique: "Vue sur cours d'eau" },
  ].filter((c) => c.longueur > 0);
  if (candidats.length === 0) return null;

  const dominante = candidats.reduce((best, c) => (c.longueur > best.longueur ? c : best)); // strict > : 1er gagne
  if (dominante.nom != null) return `Vue sur ${dominante.nom}`;

  const nommables = candidats.filter((c) => c.nom != null);
  if (nommables.length > 0) {
    const meilleurNomme = nommables.reduce((best, c) => (c.longueur > best.longueur ? c : best));
    if (meilleurNomme.longueur / dominante.longueur >= SEUIL_NOM_PROFONDEUR) {
      return `Vue sur ${meilleurNomme.nom}`;
    }
  }
  return dominante.generique;
}

/**
 * Bâti visible du cône, PAR FAISCEAU : pour chaque faisceau, le 1er bâtiment que le RAYON NU traverse
 * (jusqu'à 200 m) — `touche=false` si aucun. `annee` = année de CE 1er bâtiment (null si absente en BDNB).
 * Extraite en base.
 */
export interface ExtractionImmobilier {
  nCone: number;
  faisceaux: ReadonlyArray<{ annee: number | null; touche: boolean }>;
}

const NON_DATE = 'non daté';

/** Mappe une année sur le libellé de sa tranche EPOQUES (config), ou null si hors bornes (jamais en pratique). */
function trancheDe(annee: number): string | null {
  const t = TRANCHES_EPOQUES.find(
    (tr) => (tr.min == null || annee >= tr.min) && (tr.max == null || annee <= tr.max),
  );
  return t ? t.libelle : null;
}

/**
 * Habillage COSMÉTIQUE du libellé du badge immobilier à partir des BORNES NUMÉRIQUES d'une tranche EPOQUES
 * (min/max), jamais d'un parsing de la string. min & max → « Bâti majoritaire : min–max » (tiret U+2013) ;
 * plancher (min null) → « avant max+1 » ; plafond (max null) → « après min−1 ».
 */
export function formaterLibelleImmobilier(tranche: { min: number | null; max: number | null }): string {
  const { min, max } = tranche;
  if (min != null && max != null) return `Bâti majoritaire : ${min}–${max}`;
  if (min == null && max != null) return `Bâti majoritaire : avant ${max + 1}`;
  if (min != null && max == null) return `Bâti majoritaire : après ${min - 1}`;
  return 'Bâti majoritaire';
}

/**
 * Cartouche « environnement immobilier de proximité » — DESCRIPTIVE, SCORE-ONLY.
 * Comptage PAR FAISCEAU (chaque faisceau = son 1er bâtiment traversé). Déclenchée si ≥ SEUIL_TRIGGER_IMMO
 * des faisceaux du cône touchent du bâti. Majorité sur le dénominateur = faisceaux TOUCHANT DU BÂTI (pas nCone) :
 * si une tranche ≥ SEUIL_MAJORITE_IMMO × nBati → son libellé (mais « non daté » majoritaire → null). Sinon null.
 */
export function cartoucheImmobilier(
  nCone: number,
  faisceaux: ReadonlyArray<{ annee: number | null; touche: boolean }>,
): string | null {
  const touchants = faisceaux.filter((f) => f.touche);
  const nBati = touchants.length;
  if (nBati / (nCone || 1) < SEUIL_TRIGGER_IMMO) return null;
  if (nBati === 0) return null;

  const compte = new Map<string, number>();
  for (const f of touchants) {
    const libelle = f.annee == null ? NON_DATE : trancheDe(f.annee) ?? NON_DATE;
    compte.set(libelle, (compte.get(libelle) ?? 0) + 1);
  }

  // Tranche la plus représentée (1er inséré gagne les ex æquo).
  let best: { libelle: string; n: number } | null = null;
  for (const [libelle, n] of compte) {
    if (best === null || n > best.n) best = { libelle, n };
  }
  if (best !== null && best.n / nBati >= SEUIL_MAJORITE_IMMO) {
    if (best.libelle === NON_DATE) return null; // « non daté » majoritaire → null (inchangé)
    const tranche = TRANCHES_EPOQUES.find((t) => t.libelle === best.libelle);
    return tranche ? formaterLibelleImmobilier(tranche) : null; // habillage cosmétique seul
  }
  return null;
}

/**
 * Monuments historiques PAR FAISCEAU : pour chaque faisceau (61 complets), le 1er bâtiment traversé
 * porte-t-il un MH (via cleabs → monuments_historiques) ? `touche=false` si aucun bâti ou 1er bâti non-MH.
 * `offsetDeg` signé (az − azimutPrincipal) conservé pour filtrer le cône au moment du badge et pour un
 * futur boost. Extraite en base (resoudreMonuments). DESCRIPTIVE, SCORE-ONLY.
 */
export interface ExtractionMonuments {
  faisceaux: ReadonlyArray<{
    touche: boolean;
    ref: string | null;
    nom: string | null; // tico
    type: string | null; // deno
    statut: 'classe' | 'inscrit' | null;
    offsetDeg: number; // signé, dans [-180, 180]
  }>;
}

/** Retire les diacritiques (é→e, â→a…) pour une comparaison insensible aux accents. */
const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Titres génériques (bare, minuscule SANS ACCENT) → repli sur le statut ; comparaison EXACTE (un nom propre a des mots en plus). */
const NOMS_GENERIQUES_MH = new Set([
  'immeuble', 'maison', 'hotel', 'hotel particulier', 'villa', 'pavillon', 'ferme',
  'chateau', 'eglise', 'chapelle', 'tour',
]);

function estNomGeneriqueMH(nom: string | null): boolean {
  if (nom == null) return true;
  const n = sansAccents(nom.trim().toLowerCase());
  return n === '' || NOMS_GENERIQUES_MH.has(n);
}

/**
 * Cartouche « monument historique » — variante A (DESCRIPTIVE, SCORE-ONLY). Un badge PAR monument
 * (dédup par ref). Ne garde que les faisceaux touchant un MH DANS le cône (±CONE_VUE_NATURE_DEG).
 * Libellé : nom propre → « Monument historique : {nom} » ; nom générique/vide → repli statut
 * (« classé » / « inscrit »). Ordre stable : le plus central (|offsetDeg| min) d'abord.
 */
export function cartoucheMonuments(extraction: ExtractionMonuments): string[] {
  const dansCone = extraction.faisceaux.filter(
    (f) => f.touche && f.ref != null && Math.abs(f.offsetDeg) <= CONE_VUE_NATURE_DEG,
  );
  // Dédup par ref : on garde l'occurrence la plus centrale (|offsetDeg| min).
  const parRef = new Map<string, (typeof dansCone)[number]>();
  for (const f of dansCone) {
    const prev = parRef.get(f.ref as string);
    if (!prev || Math.abs(f.offsetDeg) < Math.abs(prev.offsetDeg)) parRef.set(f.ref as string, f);
  }
  return [...parRef.values()]
    .sort((a, b) => Math.abs(a.offsetDeg) - Math.abs(b.offsetDeg)) // plus central d'abord
    .map((m) => {
      if (!estNomGeneriqueMH(m.nom)) return `Monument historique : ${m.nom}`;
      if (m.statut === 'classe') return 'Monument historique classé';
      if (m.statut === 'inscrit') return 'Monument historique inscrit';
      return 'Monument historique';
    });
}
