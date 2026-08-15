/**
 * N5-C — DÉCISION DU SOMMET à écrire, depuis les candidats MESURÉS (N5-A/B/B2). Fonction PURE : prend un `RapportExtraction`,
 * rend LA valeur de sommet qu'on écrirait (ou son absence), sa CONFIANCE, sa PROVENANCE et une RÉSERVE explicite. Aucune base,
 * aucun réseau, aucune écriture, aucune IA. C'est l'étage de DÉCISION entre la MESURE (`extractionCaracteristiques`) et
 * l'ÉCRITURE encadrée (dépôt, à venir : elle consommera cette décision sans re-décider).
 *
 * RÈGLES ARBITRÉES (porteur, 15/08/2026) — ne pas réinterpréter :
 * - Le SOMMET écrit = MAXIMUM des cotes portant le qualificatif « acrotère », en NGF absolu. RIEN d'autre n'est écrit.
 * - AUCUN PLANCHER, AUCUN FILTRE BAS (voir le gros commentaire dans `decisionSommet`, à l'endroit où l'on serait tenté d'en
 *   ajouter un). L'erreur possible tombe du CÔTÉ SÛR : la plus haute cote des planches peut appartenir à un bâtiment VOISIN
 *   (les coupes/façades figurent le contexte bâti) → surestimation → verdict trop sévère, jamais un « sans vis-à-vis » accordé à
 *   tort. D'où la RÉSERVE, portée AVEC la valeur, à afficher partout où la valeur est montrée.
 * - origine = 'extraite' (posée par le dépôt) ; confiance = 'a_verifier' PAR DÉFAUT. 'confirmee' UNIQUEMENT si les DEUX
 *   conditions sont réunies : (1) au moins DEUX pièces distinctes portent la MÊME valeur de sommet ; (2) cette valeur est
 *   cohérente avec la TRAME des planchers, établie de façon SÛRE. Si la trame ne peut pas être établie sûrement → PAS 'confirmee'
 *   (jamais de trame reconstituée au jugé). Cf. le piège mesuré 84.24 = garde-corps ≠ plancher R07 réel 82.93.
 * - Les candidats « niveau fini » sont JOURNALISÉS avec leur provenance, JAMAIS promus en altitude de sommet.
 */
import type { Provenance, RapportExtraction } from './extractionCaracteristiques';

/** Seul qualificatif retenu pour le SOMMET (décision porteur). Centralisé : ne pas disperser la liste ni l'élargir sans arbitrage. */
export const QUALIFICATIF_SOMMET = 'acrotère';

/** RÉSERVE explicite portée AVEC toute valeur de sommet extraite. À afficher EN TOUTES LETTRES partout où la valeur apparaît
 *  (pas seulement dans une colonne technique) : c'est la garantie honnête que la mesure peut inclure du bâti voisin. */
export const RESERVE_SOMMET =
  'la cote la plus haute des planches peut appartenir à un bâtiment voisin — les coupes et façades figurent le contexte bâti';

export type Confiance = 'a_verifier' | 'confirmee';

/** Une OBSERVATION d'une valeur : où elle a été lue (provenance) ET le texte brut capté (pour la colonne `extrait` du journal).
 *  La décision porte tout ce qu'il faut pour ÉCRIRE et JOURNALISER, afin que le dépôt la consomme sans re-décider ni re-lire. */
export interface Observation { provenance: Provenance; texteBrut: string }

/** Un candidat « niveau fini » journalisé (jamais promu en altitude) : sa valeur et toutes ses observations. */
export interface CandidatNiveauFiniJournal { valeur: number; observations: Observation[] }

export interface DecisionSommet {
  valeurNgf: number | null;                 // max acrotère (NGF absolu), ou null si aucune cote acrotère
  qualificatif: string;                     // QUALIFICATIF_SOMMET
  confiance: Confiance;                     // 'a_verifier' par défaut ; 'confirmee' si (cond1 ET cond2)
  reserve: string;                          // RESERVE_SOMMET (toujours : la valeur peut être un voisin)
  observations: Observation[];              // toutes les observations de la valeur retenue (même valeur exacte) — [] si aucune
  nbPiecesDistinctes: number;               // nb de pièces DISTINCTES portant la valeur retenue (condition 1)
  coherentTrame: boolean;                   // condition 2 (trame sûre + épaisseur de toiture plausible)
  candidatsNiveauFini: CandidatNiveauFiniJournal[]; // JOURNALISÉS, jamais promus
  raisonAbsence: 'aucune_cote_acrotere' | null;     // pourquoi valeurNgf est null (sinon null)
}

/** Rang d'un plancher au-dessus du sol : RDC/R00 → 0, R01→1 … R99→99. Sous-sols, toiture, combles, accès toiture → `null`
 *  (ce ne sont pas des planchers d'étage à cote unique exploitables pour la trame). */
function rangPlancher(niveau: string): number | null {
  if (niveau === 'RDC') return 0;
  const m = /^R(\d{1,2})$/.exec(niveau);
  return m ? Number(m[1]) : null; // 'SS1', 'toiture', 'combles', 'accès toiture' → null
}

/**
 * TRAME des planchers, établie de façon SÛRE, ou `null`. « Sûre » = SANS AUCUNE supposition : chaque niveau d'étage retenu doit
 * porter EXACTEMENT UNE valeur de cote distincte (sinon la cote du plancher est ambiguë → on ne devine pas). On EXIGE une
 * séquence d'au moins 3 rangs, chacun unique, STRICTEMENT croissante avec le rang. Le moindre doute → `null` (→ pas 'confirmee').
 */
function trameSure(niveaux: RapportExtraction['bilan']['niveaux']): { rang: number; valeur: number }[] | null {
  const parRang = new Map<number, number>();
  for (const n of niveaux) {
    const rang = rangPlancher(n.niveau);
    if (rang === null) continue;
    const distinctes = new Set(n.cotes.map((c) => c.valeur));
    if (distinctes.size !== 1) return null;            // niveau AMBIGU (nuage de cotes) → trame non sûre
    const valeur = [...distinctes][0];
    if (parRang.has(rang) && parRang.get(rang) !== valeur) return null; // même rang (ex. RDC et R00), 2 valeurs → ambigu
    parRang.set(rang, valeur);
  }
  const seq = [...parRang.entries()].map(([rang, valeur]) => ({ rang, valeur })).sort((a, b) => a.rang - b.rang);
  if (seq.length < 3) return null;                     // trop court pour parler d'une trame
  for (let i = 1; i < seq.length; i++) if (seq[i].valeur <= seq[i - 1].valeur) return null; // doit monter
  return seq;
}

/**
 * Condition (2) : le sommet est-il cohérent avec la trame des planchers ? true UNIQUEMENT si la trame est SÛRE (`trameSure`) et si
 * l'épaisseur de toiture (sommet − dernier plancher) est PLAUSIBLE = dans [0, plus grand pas de la trame] (une toiture ne dépasse
 * pas un niveau d'étage). Exemple mesuré : 89.46 − 82.93 = 6.53 m ≫ pas (~3.5 m) → NON plausible → reste 'a_verifier'.
 */
function coherentAvecTrame(niveaux: RapportExtraction['bilan']['niveaux'], sommet: number): boolean {
  const seq = trameSure(niveaux);
  if (!seq) return false;
  let pasMax = 0;
  for (let i = 1; i < seq.length; i++) pasMax = Math.max(pasMax, seq[i].valeur - seq[i - 1].valeur);
  const epaisseur = sommet - seq[seq.length - 1].valeur;
  return epaisseur >= 0 && epaisseur <= pasMax;
}

/** Candidats « niveau fini » regroupés par valeur distincte (ordre croissant), avec toutes leurs observations. JOURNAL, pas mesure. */
function journalNiveauFini(cotes: RapportExtraction['cotes']): CandidatNiveauFiniJournal[] {
  const parValeur = new Map<number, Observation[]>();
  for (const c of cotes) {
    if (c.qualificatifSommet !== 'niveau fini') continue;
    (parValeur.get(c.valeur) ?? parValeur.set(c.valeur, []).get(c.valeur)!).push({ provenance: c.provenance, texteBrut: c.texteBrut });
  }
  return [...parValeur.entries()].sort((a, b) => a[0] - b[0]).map(([valeur, observations]) => ({ valeur, observations }));
}

/**
 * DÉCIDE le sommet à écrire depuis un rapport de mesure. Pur, déterministe. N'écrit rien : rend la décision que le dépôt appliquera.
 */
export function decisionSommet(rapport: RapportExtraction): DecisionSommet {
  const candidatsNiveauFini = journalNiveauFini(rapport.cotes);

  // ⚠️ AUCUN PLANCHER, AUCUN FILTRE BAS ICI — et ne PAS en rajouter (décision porteur, 15/08/2026). Raison : on n'écrit QUE le
  // sommet, c.-à-d. le MAXIMUM. Un plancher ne protège pas cette valeur — un voisin BAS est sous le max (sans effet), un voisin
  // HAUT passe le filtre de toute façon. Un plancher serait du THÉÂTRE. Et un plancher « par modale / fréquence » serait pris,
  // dans six mois, pour une mesure. Le jour où il faudra vraiment séparer PROJET et VOISIN (écrire des paliers intermédiaires ou
  // des altitudes PAR CORPS), il faudra un VRAI discriminateur : LiDAR terrain à l'emprise, ou attribution géométrique — JAMAIS
  // une valeur modale. C'est ici, et nulle part ailleurs, qu'on serait tenté d'ajouter le filtre : ne le fais pas sans ça.
  const acroteres = rapport.cotes.filter((c) => c.qualificatifSommet === QUALIFICATIF_SOMMET);
  if (acroteres.length === 0) {
    return {
      valeurNgf: null, qualificatif: QUALIFICATIF_SOMMET, confiance: 'a_verifier', reserve: RESERVE_SOMMET,
      observations: [], nbPiecesDistinctes: 0, coherentTrame: false, candidatsNiveauFini, raisonAbsence: 'aucune_cote_acrotere',
    };
  }

  const valeurNgf = acroteres.reduce((max, c) => (c.valeur > max ? c.valeur : max), acroteres[0].valeur);
  const observations: Observation[] = acroteres
    .filter((c) => c.valeur === valeurNgf)
    .map((c) => ({ provenance: c.provenance, texteBrut: c.texteBrut }));
  const nbPiecesDistinctes = new Set(observations.map((o) => o.provenance.pieceId)).size;
  const coherentTrame = coherentAvecTrame(rapport.bilan.niveaux, valeurNgf);
  const confiance: Confiance = nbPiecesDistinctes >= 2 && coherentTrame ? 'confirmee' : 'a_verifier';

  return {
    valeurNgf, qualificatif: QUALIFICATIF_SOMMET, confiance, reserve: RESERVE_SOMMET,
    observations, nbPiecesDistinctes, coherentTrame, candidatsNiveauFini, raisonAbsence: null,
  };
}
