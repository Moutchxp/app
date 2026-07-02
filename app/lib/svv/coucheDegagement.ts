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
// l'axe) pénalise la NOTE (jamais le verdict) : la distance perçue des faisceaux de la chaîne
// est multipliée par `couloirFacteur`. Détecté par côté, cumulable. Réglages EXCLUSIVEMENT via profil.

/** Côté d'analyse du couloir, relatif à l'axe de visée. */
export type CoteCouloir = 'gauche' | 'droite';

export interface ChaineCouloir {
  validee: boolean;
  faisceaux: FaisceauResultat[];
  longueurMur: number;
  cote: CoteCouloir;
}

const degVersRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance ⊥ à l'axe (m) de l'obstacle d'un faisceau : distanceObstacleM × sin(|offset|). Sans obstacle → Infinity. */
function lateralCouloir(f: FaisceauResultat): number {
  return f.distanceObstacleM == null
    ? Infinity
    : f.distanceObstacleM * Math.sin(degVersRad(Math.abs(f.offsetDeg)));
}

/**
 * Chaîne contiguë de faisceaux « collés » à l'axe, depuis le bord (|offset| = 90°) vers l'axe.
 * S'arrête au 1er faisceau dont le latéral dépasse le seuil (ou sans obstacle → Infinity) ; pas de reprise.
 * Lit `distanceObstacleM` (distance RÉELLE du 1er obstacle) — jamais la distance perçue.
 */
function detecterChaineCouloir(
  faisceaux: FaisceauResultat[],
  profil: ProfilDegagement,
  cote: CoteCouloir,
): FaisceauResultat[] {
  const flanc = faisceaux.filter((f) => (cote === 'droite' ? f.offsetDeg > 0 : f.offsetDeg < 0));
  const tri = [...flanc].sort((a, b) => Math.abs(b.offsetDeg) - Math.abs(a.offsetDeg)); // |offset| DÉCROISSANT
  const chaine: FaisceauResultat[] = [];
  for (const f of tri) {
    if (lateralCouloir(f) > profil.couloirSeuilLateralM) break; // > seuil OU sans obstacle → STOP
    chaine.push(f);
  }
  return chaine;
}

/** Longueur du mur projetée sur l'axe (m) : dernier.distanceObstacleM × cos(|offset|). Chaîne vide → 0. */
function longueurMurChaine(chaine: FaisceauResultat[]): number {
  if (chaine.length === 0) return 0;
  const dernier = chaine[chaine.length - 1];
  // `dernier` a passé le filtre latéral → distanceObstacleM non null.
  return (dernier.distanceObstacleM as number) * Math.cos(degVersRad(Math.abs(dernier.offsetDeg)));
}

/**
 * Détecte un « couloir » (bâtiment longeant l'axe) sur un côté. Chaîne contiguë depuis le bord,
 * validée si le mur projeté sur l'axe atteint `couloirLongueurMinM`. Réglages EXCLUSIVEMENT via profil.
 */
export function chaineCouloir(
  faisceaux: FaisceauResultat[],
  profil: ProfilDegagement,
  cote: CoteCouloir,
): ChaineCouloir {
  const chaine = detecterChaineCouloir(faisceaux, profil, cote);
  if (chaine.length === 0) return { validee: false, faisceaux: [], longueurMur: 0, cote };
  const longueurMur = longueurMurChaine(chaine);
  const validee = longueurMur >= profil.couloirLongueurMinM;
  return { validee, faisceaux: validee ? chaine : [], longueurMur, cote };
}

/** Diagnostic couloir des DEUX côtés (lecture seule) : chaîne détectée, latéraux, longueur mur, validation. */
export function diagnostiquerCouloir(faisceaux: FaisceauResultat[], profil: ProfilDegagement) {
  return (['gauche', 'droite'] as const).map((cote) => {
    const chaine = detecterChaineCouloir(faisceaux, profil, cote);
    const longueurMur = longueurMurChaine(chaine);
    const validee = longueurMur >= profil.couloirLongueurMinM;
    return {
      cote,
      offsetsChaine: chaine.map((f) => f.offsetDeg),
      lateraux: chaine.map(lateralCouloir),
      longueurMur,
      validee,
      nbFaisceauxMalusses: validee ? chaine.length : 0,
    };
  });
}

/**
 * Note de dégagement /plafondCouche1 : moyenne des distances perçues normalisée par la portée.
 * Les faisceaux d'une chaîne « couloir » VALIDÉE (gauche et/ou droite) voient leur distance
 * perçue multipliée par `couloirFacteur` DANS la moyenne. Liste vide → 0. Résultat clampé [0, plafondCouche1].
 */
export function noteDegagement(faisceaux: FaisceauResultat[], profil: ProfilDegagement, azimutDeg?: number): number {
  if (faisceaux.length === 0) return 0;
  // Malus couloir : faisceaux d'une chaîne VALIDÉE (les deux côtés cumulables) à pénaliser.
  const aMalusser = new Set<FaisceauResultat>();
  for (const cote of ['gauche', 'droite'] as const) {
    const ch = chaineCouloir(faisceaux, profil, cote);
    if (ch.validee) for (const f of ch.faisceaux) aMalusser.add(f);
  }
  const moyenne =
    faisceaux.reduce((acc, f) => {
      const percue = distancePercueFaisceau(f, profil);
      return acc + (aMalusser.has(f) ? percue * profil.couloirFacteur : percue);
    }, 0) / faisceaux.length;
  const note = (moyenne / profil.distanceMaxM) * profil.plafondCouche1;
  let noteAvecOrientation = note;
  if (typeof azimutDeg === "number") {
    const secteur = azimutVersSecteur(azimutDeg);          // même découpage que la boussole UI
    const pts = ORIENTATION_PTS[secteur] ?? 0;             // barème 0-10
    noteAvecOrientation = note + pts;
  }
  return clamp(noteAvecOrientation, 0, profil.plafondCouche1);   // clamp [0, plafondCouche1=90]
}
