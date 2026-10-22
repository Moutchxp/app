/**
 * ══ BANC D'ESSAI — CE QUE LE PIVOT RETIRE DE L'ÉVENTAIL VISÉ (demande d'Arno, 22/10/2026) ═══════════════════════════════
 *
 * En mode « Façade (snap) », l'éventail du SCORE est centré sur la normale du mur de la fenêtre (Lot P, `murFenetre.ts`).
 * L'éventail VISÉ par l'internaute, centré sur l'azimut choisi, avait des faisceaux qui partaient derrière ce mur, dans le
 * propre immeuble : le pivot les exclut et récupère, de l'autre côté, un secteur que l'éventail visé ne couvrait pas.
 *
 * AFFICHAGE SEULEMENT : n'entre ni dans le score ni dans le verdict. PUR (aucune base, aucun réseau), sûr côté navigateur.
 * Le compte est fait FAISCEAU PAR FAISCEAU (jamais déduit de l'écart) : un faisceau est exclu quand sa direction est à plus
 * de 90° de la normale extérieure du mur.
 */
import { AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } from './config';
import { ecartAzimuts, normaliserAzimut } from './murFenetre';

/** Un faisceau de l'éventail visé (centré sur l'azimut choisi). */
export interface FaisceauVise {
  /** Angle par rapport à l'azimut choisi (−90 … +90). */
  offsetDeg: number;
  /** Azimut géographique du faisceau, dans [0, 360[. */
  azimutDeg: number;
  /** Angle signé par rapport à la NORMALE du mur (le centre de l'éventail du score), dans ]−180, 180]. */
  angleFacadeDeg: number;
  /** Part derrière le mur de la fenêtre. */
  exclu: boolean;
}

export interface ExclusionFacade {
  mode: 'facade';
  azimutChoisiDeg: number;
  azimutNormaleDeg: number;
  /** Écart exact azimut choisi ↔ normale, dans [0, 180]. */
  ecartDeg: number;
  total: number;
  pasDeg: number;
  vises: FaisceauVise[];
  /** Nombre de faisceaux visés qui partent derrière le mur. */
  n: number;
  /** n / total × 100 (sans arrondi). */
  pourcentage: number;
  /** n × pas angulaire réel entre faisceaux. */
  secteurRetireDeg: number;
  /** Amplitude totale de l'éventail (180°). */
  amplitudeDeg: number;
  /** Faisceaux de l'éventail du SCORE (angle par rapport à la normale) qui n'étaient pas dans l'éventail visé. */
  ajoutesOffsetsDeg: number[];
}
export interface ExclusionLibre { mode: 'libre'; n: 0 }
export type ExclusionPivot = ExclusionFacade | ExclusionLibre;

/** Angle signé de `az` par rapport à `centre`, dans ]−180, 180]. */
function angleSigne(az: number, centre: number): number {
  const d = ((((az - centre) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Les offsets des 61 faisceaux, −90 … +90 par pas de 3° (même construction que `genererFaisceauxAmplitude`). */
export function offsetsEventail(): number[] {
  const demi = ((AMPLITUDE_BEAM_COUNT - 1) / 2) * AMPLITUDE_BEAM_STEP_DEG;
  return Array.from({ length: AMPLITUDE_BEAM_COUNT }, (_, i) => -demi + i * AMPLITUDE_BEAM_STEP_DEG);
}

export function calculerExclusion(azimutChoisiDeg: number, azimutNormaleDeg: number): ExclusionFacade {
  const az = normaliserAzimut(azimutChoisiDeg);
  const normale = normaliserAzimut(azimutNormaleDeg);
  const offsets = offsetsEventail();
  const vises = offsets.map((offsetDeg) => {
    const azimutDeg = normaliserAzimut(az + offsetDeg);
    return { offsetDeg, azimutDeg, angleFacadeDeg: angleSigne(azimutDeg, normale), exclu: ecartAzimuts(azimutDeg, normale) > 90 };
  });
  const n = vises.filter((f) => f.exclu).length;
  return {
    mode: 'facade', azimutChoisiDeg: az, azimutNormaleDeg: normale, ecartDeg: ecartAzimuts(az, normale),
    total: offsets.length, pasDeg: AMPLITUDE_BEAM_STEP_DEG, vises, n, pourcentage: (n / offsets.length) * 100,
    secteurRetireDeg: n * AMPLITUDE_BEAM_STEP_DEG, amplitudeDeg: offsets[offsets.length - 1] - offsets[0],
    ajoutesOffsetsDeg: offsets.filter((o) => ecartAzimuts(normaliserAzimut(normale + o), az) > 90),
  };
}

/** Ce que le banc affiche : mode Libre → rien d'exclu ; mode Façade avec pivot → le calcul ci-dessus ; sinon rien. */
export function exclusionPourBanc(mode: string | undefined, pivot: { azimutChoisiDeg: number; azimutNormaleDeg: number } | undefined): ExclusionPivot | null {
  if (mode === 'manuel') return { mode: 'libre', n: 0 };
  return pivot ? calculerExclusion(pivot.azimutChoisiDeg, pivot.azimutNormaleDeg) : null;
}
