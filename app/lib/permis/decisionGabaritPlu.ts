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
  valeurNgf: number;      // la cote NGF portée par la ligne de gabarit (JAMAIS le NVP)
  ecartM: number | null;  // écart |y_libellé − y_cote| converti en mètres (null si échelle non calibrable)
  confiance: Confiance;
  r2: number | null; residuMaxM: number | null; nbAncrages: number;
  motifEchelle: string | null; // « écart non convertible en mètres » quand le fit échoue
}
export interface GabaritAbstenu { statut: 'abstenue'; motif: string }
export type DecisionGabaritPlanche = GabaritRetenu | GabaritAbstenu;

const SEUIL_ANCRAGES = 5, SEUIL_R2 = 0.9999, SEUIL_RESIDU_M = 0.15, SEUIL_ECART_M = 0.50;

// Libellé exact, casse et espaces multiples tolérés (jamais « les hauteurs plafond » : ancrage sur « maximale plu »).
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const estLibelle = (s: string) => norm(s).includes('hauteur maximale plu');
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

/** Décision pour UNE planche (page). */
export function decisionGabaritPlanche(items: readonly ItemTexte[]): DecisionGabaritPlanche {
  const libelle = items.find((it) => estLibelle(it.str));
  if (!libelle) return { statut: 'abstenue', motif: 'libellé « hauteur maximale PLU » absent de la planche' };

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
    statut: 'retenue', valeurNgf: proche.valeur, ecartM, confiance,
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
