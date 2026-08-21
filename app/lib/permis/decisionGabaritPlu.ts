/**
 * N10-I — DÉCISION PURE de la HAUTEUR MAXIMALE PLU d'une planche, par LECTURE POSITIONNELLE (recon du 21/08). Aucune I/O, aucune IA.
 *
 * FAITS ACQUIS (mesure positionnelle, permis 07512024V0037) :
 * - pdfjs expose x,y de chaque item (transform[4],[5]) — c'est l'entrée de ce module (jamais le texte aplati).
 * - le libellé « hauteur maximale PLU » est posé DANS le dessin, sur la ligne de gabarit ;
 * - l'échelle verticale des coupes est AFFINE (R²=1,000000, résidu 0,000 m sur ce permis) ;
 * - chaque cote porte NGF ET NVP (« 101,00 (NGF)/100,67 NVP ») → on ne lit QUE le NGF, JAMAIS le NVP.
 *
 * RÈGLES (dans l'ordre) :
 *  a) repérer le libellé (forme exacte, casse et espaces multiples tolérés). Absent → abstention.
 *  b) PRIMAIRE — rattachement positionnel DIRECT : parmi les cotes étiquetées NGF, retenir celle dont le y est le PLUS PROCHE du
 *     libellé. Jamais une valeur NVP.
 *  c) calibrer l'échelle (régression affine altitude↔y sur les cotes NGF) POUR CONVERTIR L'ÉCART EN MÈTRES uniquement — jamais pour
 *     fabriquer une valeur. Seuils : ≥5 ancrages, R²≥0,9999, résidu max ≤0,15 m. Hors seuils → la voie directe reste valide,
 *     confiance abaissée, motif « écart non convertible en mètres ».
 *  d) rejet : écart converti > 0,50 m → abstention « aucune cote NGF à portée du libellé ». JAMAIS la 2e plus proche.
 *  e) ne cible QUE ce libellé. Aucune généralisation (07512025V0035 l'exprime autrement → abstention propre).
 */

/** Un item texte positionné d'une page (x,y = transform[4],[5] pdfjs ; fs = taille de police). */
export interface ItemTexte { str: string; x: number; y: number; fs: number }

export type Confiance = 'confirmee' | 'a_verifier';
export interface GabaritRetenu {
  statut: 'retenue';
  valeurNgf: number;      // la cote NGF portée par la ligne (gabarit OU plateau) — JAMAIS le NVP
  ecartM: number | null;  // écart |y_libellé − y_cote| converti en mètres (null si échelle non calibrable)
  confiance: Confiance;
  fitOk: boolean;         // N10-M : l'échelle de la planche passe les seuils (≥5 ancrages, R²≥0,9999, résidu≤0,15 m) — sinon lecture non fiable
  r2: number | null; residuMaxM: number | null; nbAncrages: number;
  motifEchelle: string | null; // « écart non convertible en mètres » quand le fit échoue
}
export interface GabaritAbstenu { statut: 'abstenue'; motif: string }
export type DecisionGabaritPlanche = GabaritRetenu | GabaritAbstenu;

const SEUIL_ANCRAGES = 5, SEUIL_R2 = 0.9999, SEUIL_RESIDU_M = 0.15, SEUIL_ECART_M = 0.50;

// Libellés ciblés (casse et espaces multiples tolérés). Deux notions LUES PAR LA MÊME MÉTHODE (N10-M) :
//  - 'gabarit' : « hauteur maximale PLU » (jamais « les hauteurs plafond ») ;
//  - 'plateau' : « plateau de nivellement » (le PLAN DE RÉFÉRENCE du nivellement — PAS le sol naturel ; jamais la note « Précision… »).
export type CibleLibelle = 'gabarit' | 'plateau';
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const MATCH: Record<CibleLibelle, (s: string) => boolean> = {
  gabarit: (s) => norm(s).includes('hauteur maximale plu'),
  // « plateau » OU « plateaux » (le pluriel apparaît sur certaines coupes) de nivellement ; jamais la note « Précision… ».
  plateau: (s) => { const n = norm(s); return /plateaux? de nivellement/.test(n) && !n.includes('précision'); },
};
const NOM_LIBELLE: Record<CibleLibelle, string> = { gabarit: 'hauteur maximale PLU', plateau: 'plateau de nivellement' };
// Cote NGF : le nombre placé JUSTE AVANT « (NGF) ». La part NVP (après) est ignorée par construction.
const NGF_RE = /(\d{2,3}(?:[.,]\d{1,2})?)\s*\(\s*NGF\s*\)/gi;

interface Cote { valeur: number; y: number }
function cotesNgf(items: readonly ItemTexte[]): Cote[] {
  const out: Cote[] = [];
  for (const it of items) {
    NGF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NGF_RE.exec(it.str)) !== null) out.push({ valeur: Number(m[1].replace(',', '.')), y: it.y });
  }
  return out;
}

/** Régression affine y = m·v + b (moindres carrés) sur des points (valeur, y). null si < 2 valeurs distinctes. */
function fitAffine(pts: readonly Cote[]): { m: number; b: number } | null {
  const n = pts.length;
  const sv = pts.reduce((s, p) => s + p.valeur, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const svv = pts.reduce((s, p) => s + p.valeur * p.valeur, 0), svy = pts.reduce((s, p) => s + p.valeur * p.y, 0);
  const den = n * svv - sv * sv;
  if (den === 0) return null;
  const m = (n * svy - sv * sy) / den;
  return { m, b: (sy - m * sv) / n };
}

/** Calibre l'échelle : fit brut → on garde les cotes à résidu < 3 unités → refit. Rend m,b + R² + résidu max en mètres + nb retenus. */
function calibrer(cotes: readonly Cote[]): { m: number; b: number; r2: number; residuMaxM: number; nb: number } | null {
  let f = fitAffine(cotes);
  if (!f) return null;
  const garde = cotes.filter((c) => Math.abs(c.y - (f!.m * c.valeur + f!.b)) < 3);
  f = fitAffine(garde);
  if (!f || garde.length < 2) return null;
  const ybar = garde.reduce((s, c) => s + c.y, 0) / garde.length;
  const sstot = garde.reduce((s, c) => s + (c.y - ybar) ** 2, 0);
  const ssres = garde.reduce((s, c) => s + (c.y - (f!.m * c.valeur + f!.b)) ** 2, 0);
  const r2 = sstot === 0 ? 1 : 1 - ssres / sstot;
  const residuMaxM = Math.max(...garde.map((c) => Math.abs((c.y - (f!.m * c.valeur + f!.b)) / f!.m)));
  return { m: f.m, b: f.b, r2, residuMaxM, nb: garde.length };
}

/** Décision pour UNE planche (page). `cible` = libellé visé (défaut 'gabarit', rétrocompat N10-I). MÊME méthode pour le plateau. */
export function decisionGabaritPlanche(items: readonly ItemTexte[], cible: CibleLibelle = 'gabarit'): DecisionGabaritPlanche {
  const libelle = items.find((it) => MATCH[cible](it.str));
  if (!libelle) return { statut: 'abstenue', motif: `libellé « ${NOM_LIBELLE[cible]} » absent de la planche` };

  const cotes = cotesNgf(items);
  if (cotes.length === 0) return { statut: 'abstenue', motif: 'aucune cote étiquetée « (NGF) » sur la planche' };

  // b) rattachement DIRECT : la cote NGF dont le y est le plus proche du libellé.
  let proche = cotes[0];
  for (const c of cotes) if (Math.abs(c.y - libelle.y) < Math.abs(proche.y - libelle.y)) proche = c;

  // c) échelle → écart en mètres (jamais une valeur).
  const cal = calibrer(cotes);
  const fitOk = !!cal && cal.nb >= SEUIL_ANCRAGES && cal.r2 >= SEUIL_R2 && cal.residuMaxM <= SEUIL_RESIDU_M;
  let ecartM: number | null = null;
  let motifEchelle: string | null = null;
  if (fitOk && cal) ecartM = Math.abs((libelle.y - proche.y) / cal.m);
  else motifEchelle = 'écart non convertible en mètres (échelle non calibrable sur cette planche)';

  // d) rejet SUR L'ÉCART CONVERTI uniquement (jamais la 2e plus proche).
  if (ecartM !== null && ecartM > SEUIL_ECART_M) {
    return { statut: 'abstenue', motif: `aucune cote NGF à portée du libellé (plus proche à ${ecartM.toFixed(2)} m)` };
  }

  const confiance: Confiance = fitOk && ecartM !== null && ecartM <= 0.30 ? 'confirmee' : 'a_verifier';
  return {
    statut: 'retenue', valeurNgf: proche.valeur, ecartM, confiance, fitOk,
    r2: cal?.r2 ?? null, residuMaxM: cal?.residuMaxM ?? null, nbAncrages: cal?.nb ?? 0, motifEchelle,
  };
}

// ── AGRÉGATION MULTI-PLANCHES ────────────────────────────────────────────────────────────────────────────────────────────────
export interface CandidatGabarit { valeurNgf: number; planche: string; page: number; ecartM: number | null; confiance: Confiance }
export interface GroupeGabarit { valeur: number; sources: CandidatGabarit[] }
export type AggregationGabarit =
  | { statut: 'aucune' }
  | { statut: 'concordante'; valeur: number; groupes: GroupeGabarit[] }
  | { statut: 'divergente'; groupes: GroupeGabarit[] };

const TOL_CONCORDANCE = 0.05; // « concordantes à 0,05 m près »

/** Regroupe les candidats par valeur (tolérance 0,05 m). Concordant = un seul groupe ; divergent = plusieurs. Aucune moyenne, aucun départage. */
export function agregerGabarit(candidats: readonly CandidatGabarit[]): AggregationGabarit {
  if (candidats.length === 0) return { statut: 'aucune' };
  const groupes: GroupeGabarit[] = [];
  for (const c of [...candidats].sort((a, b) => a.valeurNgf - b.valeurNgf)) {
    const g = groupes.find((g) => Math.abs(g.valeur - c.valeurNgf) <= TOL_CONCORDANCE);
    if (g) g.sources.push(c);
    else groupes.push({ valeur: c.valeurNgf, sources: [c] });
  }
  if (groupes.length === 1) return { statut: 'concordante', valeur: groupes[0].valeur, groupes };
  return { statut: 'divergente', groupes };
}

/** Réserve à écrire TELLE QUELLE quand ça diverge (motif métier arbitré). */
export const RESERVE_DIVERGENCE = 'le gabarit NGF varie selon le plateau de nivellement de la portion coupée';
/** Réserve à ajouter quand le permis a plusieurs corps (pas de répartition au jugé, doctrine P4/P5). */
export const RESERVE_MULTI_CORPS = 'valeur au niveau du permis, pas pour ce bâtiment en particulier';

// ── CONTRÔLE DE RÈGLE (N10-M) ────────────────────────────────────────────────────────────────────────────────────────────────
// Sur les planches portant LES DEUX libellés (gabarit + plateau) et dont le fit passe le seuil : gabarit − plateau doit être
// CONSTANT. S'il l'est (≤0,05 m d'étendue) sur ≥3 planches → RÈGLE VÉRIFIÉE, le constant EST le plafond (établi par la MESURE,
// jamais lu dans une notice). Les 3 valeurs de gabarit ne sont alors PAS des candidates rivales : chacune vaut au droit de son
// plateau. Sinon → NON vérifiée : on retombe sur le comportement N10-I (candidates + avertissement). Les planches au fit hors
// seuil sont EXCLUES du contrôle (lecture non fiable) et journalisées « non concluante », JAMAIS parce que leur résultat dérange.
export const TOL_REGLE = 0.05, MIN_PLANCHES_REGLE = 3;

/** Ce qu'une planche donne pour LES DEUX libellés (null si le libellé est absent). `fitOk` = échelle fiable sur la planche. */
export interface LecturePlanche { planche: string; page: number; gabarit: number | null; plateau: number | null; fitOk: boolean }
export interface PlancheRegle { planche: string; page: number; gabarit: number; plateau: number; ecart: number }
export interface PlancheExclue { planche: string; page: number; motif: string }
export type ControleRegle =
  | { statut: 'verifiee'; plafond: number; plateauMin: number; plateauMax: number; gabaritMin: number; gabaritMax: number; planches: PlancheRegle[]; exclues: PlancheExclue[] }
  | { statut: 'non_verifiee'; exclues: PlancheExclue[] };

/** Éprouve la règle gabarit = plateau + plafond. PUR. N'analyse AUCUN texte de notice : le plafond sort de la mesure. */
export function controlerRegleGabarit(lectures: readonly LecturePlanche[]): ControleRegle {
  const deuxLibelles = lectures.filter((l) => l.gabarit !== null && l.plateau !== null);
  const exclues: PlancheExclue[] = deuxLibelles.filter((l) => !l.fitOk).map((l) => ({ planche: l.planche, page: l.page, motif: 'non concluante (fit hors seuil)' }));
  const util = deuxLibelles.filter((l) => l.fitOk);
  if (util.length < MIN_PLANCHES_REGLE) return { statut: 'non_verifiee', exclues };
  const planches: PlancheRegle[] = util.map((l) => ({ planche: l.planche, page: l.page, gabarit: l.gabarit!, plateau: l.plateau!, ecart: l.gabarit! - l.plateau! }));
  const ecarts = planches.map((p) => p.ecart);
  if (Math.max(...ecarts) - Math.min(...ecarts) > TOL_REGLE) return { statut: 'non_verifiee', exclues };
  const gabarits = planches.map((p) => p.gabarit), plateaux = planches.map((p) => p.plateau);
  return {
    statut: 'verifiee',
    plafond: ecarts.reduce((s, e) => s + e, 0) / ecarts.length, // le constant, établi par la mesure (moyenne des écarts ≤0,05 m)
    plateauMin: Math.min(...plateaux), plateauMax: Math.max(...plateaux),
    gabaritMin: Math.min(...gabarits), gabaritMax: Math.max(...gabarits),
    planches, exclues,
  };
}

/** Énoncé FACTUEL de la règle (affiché à la place de « valeurs divergentes »). Sans jargon. */
export function enonceRegle(r: Extract<ControleRegle, { statut: 'verifiee' }>): string {
  const p = Number.isInteger(r.plafond) ? String(r.plafond) : r.plafond.toFixed(2);
  return `gabarit = plateau de nivellement + ${p} m — de ${r.gabaritMin} à ${r.gabaritMax} NGF selon le plateau (${r.plateauMin} à ${r.plateauMax})`;
}
