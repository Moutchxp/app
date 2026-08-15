/**
 * N5-E — DÉCISION PAR CHAMP (généralise `decisionSommet`). Fonction PURE : depuis un `RapportExtraction`, chaque champ des tables
 * N3-B rend SOIT une valeur à écrire (avec unité, confiance, réserve, observations), SOIT un MOTIF de NON-ÉCRITURE explicite.
 * JAMAIS un silence : une case vide qui explique pourquoi est une information ; une case vide muette serait un échec.
 *
 * 🔒 RÈGLES ARBITRÉES (porteur, 15/08/2026) — appliquées telles quelles, aucune valeur déduite par fréquence/moyenne/interpolation :
 * - nb_niveaux_sous_sol : « N niveaux de sous-sol » de l'arrêté → écrit (confirmee si ≥2 pièces, sinon a_verifier) ; valeurs
 *   distinctes ⇒ non écrit.
 * - nb_etages : gabarit « R+n » à valeur UNIQUE (min=max) → écrit ; une PLAGE (« R+5 à R+7 ») → NON écrit (non attribuable).
 * - altitude_dernier_plancher_ngf : le plancher du niveau le PLUS HAUT, SEULEMENT si ce niveau ne porte qu'UNE cote distincte
 *   (sinon association ambiguë — c'est le piège 84.24 garde-corps ≠ 82.93 plancher).
 * - altitude_sommet_ngf : INCHANGÉ, `decisionSommet` fait foi.
 * - hauteur_relative_m, altitude_terrain_naturel_ngf : aucun candidat dans le corpus → non écrit.
 * - parking : libellés Cerfa présents mais valeurs non extractibles de la couche texte → non écrit.
 * - repere : attribution à un corps indécidable → non écrit.
 */
import type { RapportExtraction } from './extractionCaracteristiques';
import type { ChampCorps } from './caracteristiquesRepo';
import { decisionSommet, rangPlancher, type Confiance, type Observation, type CandidatNiveauFiniJournal } from './decisionSommet';

export type Unite = 'ngf' | 'm' | null;

interface BaseChamp { champ: string; portee: 'corps' | 'global' }
/** Champ ÉCRIT : `cle` = clé logique pour `ecrireCorps` ; `champ` = colonne SQL (clé du journal et de l'affichage). */
export type ChampEcrit = BaseChamp & {
  statut: 'ecrit'; portee: 'corps'; cle: ChampCorps; valeur: number; unite: Unite;
  confiance: Confiance; reserve: string | null; observations: Observation[];
};
export type ChampNonEcrit = BaseChamp & { statut: 'non_ecrit'; motif: string };
export type DecisionChamp = ChampEcrit | ChampNonEcrit;

export interface DecisionChamps { champs: DecisionChamp[]; candidatsNiveauFini: CandidatNiveauFiniJournal[] }

// ── MOTIFS de non-écriture (source UNIQUE, réutilisée par l'écriture et l'affichage) ───────────────────────────────
export const MOTIF_AUCUN_CANDIDAT = 'aucun candidat trouvé dans le corpus';
export const MOTIF_GABARIT_PLAGE = 'gabarit à plage annoncé pour plusieurs corps, valeur non attribuable';
export const MOTIF_GABARIT_MULTIPLE = 'plusieurs gabarits R+n distincts, valeur non attribuable';
export const MOTIF_SOUSSOL_MULTIPLE = 'plusieurs valeurs de sous-sol distinctes, ambiguïté non tranchée';
export const MOTIF_PLANCHER_AMBIGU = 'plusieurs cotes distinctes sur le niveau le plus haut, association ambiguë';
export const MOTIF_SOMMET_AUCUN = 'aucune cote « acrotère » dans le corpus';
export const MOTIF_PARKING = 'libellés Cerfa présents mais valeurs non extractibles de la couche texte';
export const MOTIF_REPERE = 'attribution à un corps indécidable';

const piecesDistinctes = (obs: Observation[]): number => new Set(obs.map((o) => o.provenance.pieceId)).size;
const confianceDe = (obs: Observation[]): Confiance => (piecesDistinctes(obs) >= 2 ? 'confirmee' : 'a_verifier');

/** nb_niveaux_sous_sol — une valeur unique de sous-sol dans le corpus → écrite ; 0 candidat ou valeurs distinctes → non écrit. */
function champSousSol(r: RapportExtraction): DecisionChamp {
  const base = { champ: 'nb_niveaux_sous_sol', portee: 'corps' as const };
  if (r.sousSols.length === 0) return { ...base, statut: 'non_ecrit', motif: MOTIF_AUCUN_CANDIDAT };
  const distinct = new Set(r.sousSols.map((s) => s.niveaux));
  if (distinct.size > 1) return { ...base, statut: 'non_ecrit', motif: MOTIF_SOUSSOL_MULTIPLE };
  const observations = r.sousSols.map((s) => ({ provenance: s.provenance, texteBrut: s.texteBrut }));
  return { ...base, statut: 'ecrit', cle: 'nbNiveauxSousSol', valeur: [...distinct][0], unite: null, confiance: confianceDe(observations), reserve: null, observations };
}

/** nb_etages — gabarit R+n à valeur unique (min=max) → écrit ; une plage → non écrit (jamais le max « pour faire quelque chose »). */
function champEtages(r: RapportExtraction): DecisionChamp {
  const base = { champ: 'nb_etages', portee: 'corps' as const };
  const singles = r.gabarits.filter((g) => g.rMin !== null && g.rMin === g.rMax);
  const distinctSingles = new Set(singles.map((g) => g.rMin as number));
  if (distinctSingles.size === 1) {
    const valeur = [...distinctSingles][0];
    const observations = singles.filter((g) => g.rMin === valeur).map((g) => ({ provenance: g.provenance, texteBrut: g.texteBrut }));
    return { ...base, statut: 'ecrit', cle: 'nbEtages', valeur, unite: null, confiance: confianceDe(observations), reserve: null, observations };
  }
  if (r.gabarits.some((g) => g.rMin !== g.rMax)) return { ...base, statut: 'non_ecrit', motif: MOTIF_GABARIT_PLAGE };
  if (distinctSingles.size > 1) return { ...base, statut: 'non_ecrit', motif: MOTIF_GABARIT_MULTIPLE };
  return { ...base, statut: 'non_ecrit', motif: MOTIF_AUCUN_CANDIDAT };
}

/** altitude_dernier_plancher_ngf — plancher du niveau le PLUS HAUT, seulement si ce niveau porte UNE seule cote distincte. */
function champPlancher(r: RapportExtraction): DecisionChamp {
  const base = { champ: 'altitude_dernier_plancher_ngf', portee: 'corps' as const };
  const rangs = r.bilan.niveaux
    .map((n) => ({ name: n.niveau, rang: rangPlancher(n.niveau) }))
    .filter((x): x is { name: string; rang: number } => x.rang !== null);
  if (rangs.length === 0) return { ...base, statut: 'non_ecrit', motif: MOTIF_AUCUN_CANDIDAT };
  const top = rangs.reduce((a, b) => (b.rang > a.rang ? b : a));
  const cotesTop = r.cotes.filter((c) => c.niveau === top.name);
  const distinct = new Set(cotesTop.map((c) => c.valeur));
  if (distinct.size !== 1) return { ...base, statut: 'non_ecrit', motif: MOTIF_PLANCHER_AMBIGU };
  const observations = cotesTop.map((c) => ({ provenance: c.provenance, texteBrut: c.texteBrut }));
  return { ...base, statut: 'ecrit', cle: 'altitudeDernierPlancherNgf', valeur: [...distinct][0], unite: 'ngf', confiance: confianceDe(observations), reserve: null, observations };
}

/** altitude_sommet_ngf — délègue à `decisionSommet` (règle inchangée) et l'habille en DecisionChamp. */
function champSommet(r: RapportExtraction): { champ: DecisionChamp; candidats: CandidatNiveauFiniJournal[] } {
  const d = decisionSommet(r);
  const base = { champ: 'altitude_sommet_ngf', portee: 'corps' as const };
  const champ: DecisionChamp = d.valeurNgf === null
    ? { ...base, statut: 'non_ecrit', motif: MOTIF_SOMMET_AUCUN }
    : { ...base, statut: 'ecrit', cle: 'altitudeSommetNgf', valeur: d.valeurNgf, unite: 'ngf', confiance: d.confiance, reserve: d.reserve, observations: d.observations };
  return { champ, candidats: d.candidatsNiveauFini };
}

/** Décision pour TOUS les champs. Ordre déterministe. Aucun effet, aucune écriture. */
export function decisionChamps(r: RapportExtraction): DecisionChamps {
  const sommet = champSommet(r);
  return {
    champs: [
      champEtages(r),
      champSousSol(r),
      champPlancher(r),
      sommet.champ,
      { champ: 'hauteur_relative_m', portee: 'corps', statut: 'non_ecrit', motif: MOTIF_AUCUN_CANDIDAT },
      { champ: 'altitude_terrain_naturel_ngf', portee: 'corps', statut: 'non_ecrit', motif: MOTIF_AUCUN_CANDIDAT },
      { champ: 'repere', portee: 'corps', statut: 'non_ecrit', motif: MOTIF_REPERE },
      { champ: 'parking', portee: 'global', statut: 'non_ecrit', motif: MOTIF_PARKING },
    ],
    candidatsNiveauFini: sommet.candidats,
  };
}
