/**
 * Banc d'essai M5 — Profil de TEST synchronisé (Lot 2).
 *
 * Module PUR (aucun accès DB, aucune IA). Fournit la fondation « données » du banc :
 *  1. `clonerProfil` — snapshot EN MÉMOIRE, profondément indépendant, du profil ACTIF
 *     (chargé via `chargerProfilDegagement`) → un « profil de test » éditable sans jamais muter l'actif.
 *  2. `STATUT_VARIABLE` — statut de chaque variable du profil (VIVE / VESTIGIALE / GARDE), pour piloter
 *     l'interface d'édition (variables VESTIGIALES à griser ; GARDE = enum fermé). Cf. invariant « pilotage
 *     sans code » (CLAUDE.md §0) et §0 de la SPEC (4 variables vestigiales non consultées par le score).
 *  3. `diffProfils` — RÉCAP des écarts (actif → test) : scalaires + cartes d'année (ajout/suppression/modif).
 *
 * Le profil de test s'injecte tel quel via `analyserAdresse({ profil })` / `analyser(entree, profil)` :
 * profil injecté ⇒ `config_scoring` live n'est PAS lu (décorrélation TOTALE, sans fork de moteur).
 * Ce module N'ÉCRIT RIEN en base et ne persiste jamais le profil de test (mémoire de session uniquement).
 */
import type { ProfilDegagement } from './profilDegagement';
import type { CarteAnnee } from './cartesAnnee';

// Re-export de la validation de chevauchement (source unique moteur + CRUD) pour l'édition des cartes (BE-24).
export { validerCartesAnnee } from './cartesAnnee';

/**
 * Statut d'une variable de scoring pour l'interface :
 *  - `vive` : consultée par le calcul de `score.total` ; l'éditer change le score.
 *  - `vestigiale` : mappée mais NON consultée par le moteur actuel (l'année remplace boostF2, MH/Inventaire
 *    remplacent le forfait F3) ; l'éditer NE change PAS le score → à griser dans l'UI.
 *  - `garde` : éditable mais contrainte à une liste FERMÉE (enum) ; une valeur invalide casse le profil.
 */
export type StatutVariable = 'vive' | 'vestigiale' | 'garde';

/**
 * Statut de chacune des variables du profil (clés de premier niveau de `ProfilDegagement`).
 * VESTIGIALES (SPEC §0) : `boostF2`, `forfaitConeCentral`, `forfaitExtremites`, `coneF3DemiAngleDeg`.
 * GARDE (enum fermé) : `modeCombinaison`, `modeCombinaisonRepli`. Toutes les autres : VIVES.
 */
export const STATUT_VARIABLE: Record<keyof ProfilDegagement, StatutVariable> = {
  boostF2: 'vestigiale',
  forfaitConeCentral: 'vestigiale',
  forfaitExtremites: 'vestigiale',
  coneF3DemiAngleDeg: 'vestigiale',
  modeCombinaison: 'garde',
  modeCombinaisonRepli: 'garde',
  boostF4: 'vive',
  distanceMaxM: 'vive',
  plafondCouche1: 'vive',
  plafondDegagement: 'vive',
  couloirSeuilLateralM: 'vive',
  couloirFenetreConditionN: 'vive',
  couloirToleranceBordN: 'vive',
  couloirMalusPct: 'vive',
  naturesRemarquables: 'vive',
  coneFamilleDemiAngleDeg: 'vive',
  famillesPonderation: 'vive',
  famillesAnnee: 'vive',
  cumulNature: 'vive',
  orientationPts: 'vive',
  analysisRangeM: 'vive',
};

/** Ensemble des variables VESTIGIALES (dérivé de `STATUT_VARIABLE`) — pour griser l'UI (BE-21a). */
export const VARIABLES_VESTIGIALES: ReadonlySet<keyof ProfilDegagement> = new Set(
  (Object.keys(STATUT_VARIABLE) as (keyof ProfilDegagement)[]).filter((k) => STATUT_VARIABLE[k] === 'vestigiale'),
);

/**
 * Clone PROFOND et indépendant d'un profil (snapshot mémoire). Le résultat ne partage AUCUNE référence avec
 * la source : muter le clone (ou ses cartes d'année, sa pondération, son orientation) ne touche jamais l'actif.
 * `ProfilDegagement` est de la donnée pure (nombres, chaînes, tableaux, objets simples) → `structuredClone` suffit.
 */
export function clonerProfil(profil: ProfilDegagement): ProfilDegagement {
  return structuredClone(profil);
}

/** Un écart scalaire (ou tableau `naturesRemarquables`) entre profil actif et profil de test. */
export interface EcartScalaire {
  /** Chemin de la variable (pointé pour les champs imbriqués, ex. `famillesPonderation.mh.cone`). */
  champ: string;
  /** Statut de la variable de PREMIER niveau dont dérive ce champ (VIVE / VESTIGIALE / GARDE). */
  statut: StatutVariable;
  valeurActive: unknown;
  valeurTest: unknown;
}

/** Écarts sur les cartes d'année (comparaison POSITIONNELLE — les cartes sont ordonnées et non chevauchantes). */
export interface EcartsCartesAnnee {
  ajouts: CarteAnnee[];
  suppressions: CarteAnnee[];
  modifications: { index: number; active: CarteAnnee; test: CarteAnnee }[];
}

/** Récap complet des écarts actif → test. `total` = nombre d'écarts (scalaires + cartes). */
export interface EcartsProfil {
  scalaires: EcartScalaire[];
  cartesAnnee: EcartsCartesAnnee;
  total: number;
}

const estObjetSimple = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collecte récursive des écarts d'un champ (objet simple → récursion ; tableau → égalité JSON ; primitive → ===). */
function collecterEcarts(
  actif: unknown,
  test: unknown,
  champ: string,
  statut: StatutVariable,
  out: EcartScalaire[],
): void {
  if (Array.isArray(actif) || Array.isArray(test)) {
    if (JSON.stringify(actif) !== JSON.stringify(test)) {
      out.push({ champ, statut, valeurActive: actif, valeurTest: test });
    }
    return;
  }
  if (estObjetSimple(actif) && estObjetSimple(test)) {
    for (const cle of Object.keys(actif)) {
      collecterEcarts(actif[cle], test[cle], `${champ}.${cle}`, statut, out);
    }
    return;
  }
  if (actif !== test) {
    out.push({ champ, statut, valeurActive: actif, valeurTest: test });
  }
}

/** Écarts positionnels sur les cartes d'année (ajout / suppression / modification par index). */
function diffCartes(actif: CarteAnnee[], test: CarteAnnee[]): EcartsCartesAnnee {
  const ajouts: CarteAnnee[] = [];
  const suppressions: CarteAnnee[] = [];
  const modifications: { index: number; active: CarteAnnee; test: CarteAnnee }[] = [];
  const n = Math.max(actif.length, test.length);
  for (let i = 0; i < n; i++) {
    const a = actif[i];
    const t = test[i];
    if (a && !t) suppressions.push(a);
    else if (!a && t) ajouts.push(t);
    else if (a && t && JSON.stringify(a) !== JSON.stringify(t)) modifications.push({ index: i, active: a, test: t });
  }
  return { ajouts, suppressions, modifications };
}

/**
 * Récap des écarts entre le profil ACTIF et le profil de TEST. Compare toutes les variables scalaires (y compris
 * champs imbriqués `famillesPonderation`/`cumulNature`/`orientationPts` et le tableau `naturesRemarquables`), et
 * traite `famillesAnnee` à part (ajout/suppression/modification). Fonction PURE (ne mute rien).
 */
export function diffProfils(actif: ProfilDegagement, test: ProfilDegagement): EcartsProfil {
  const scalaires: EcartScalaire[] = [];
  for (const cle of Object.keys(actif) as (keyof ProfilDegagement)[]) {
    if (cle === 'famillesAnnee') continue; // traité séparément
    collecterEcarts(actif[cle], test[cle], cle, STATUT_VARIABLE[cle], scalaires);
  }
  const cartesAnnee = diffCartes(actif.famillesAnnee, test.famillesAnnee);
  const total =
    scalaires.length +
    cartesAnnee.ajouts.length +
    cartesAnnee.suppressions.length +
    cartesAnnee.modifications.length;
  return { scalaires, cartesAnnee, total };
}
