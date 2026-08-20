/**
 * N9-B / N10-A — DÉCISION PURE : les caractéristiques d'un corps dérivées du TABLEAU DE NIVEAUX de la coupe. Aucune base, aucune
 * écriture, aucune IA, aucune géométrie. On cible la STRUCTURE (le tableau qui associe des niveaux à des altitudes), jamais des cotes
 * isolées : c'est ce qui permet d'attribuer PAR BÂTIMENT (ce que le chaînage N8-B ne savait pas faire, d'où l'erreur 82,93).
 *
 * N10-A — le moteur avait été écrit pour UNE convention d'architecte (« BAT 2D<x> », labels R0n, cote « +…m NGF » collée) et l'avait
 * prise pour LA convention. On SÉPARE désormais le STRUCTUREL (un tableau niveaux→altitudes) du COSMÉTIQUE (l'ordre des mots, le
 * signe, l'unité, le titre). Concrètement, trois verrous sont ouverts, chacun mesuré sur 07512024V0037 :
 *  1. ANCRE ouverte : un titre de bâtiment quand il existe (BAT/LOT/PLN 2D<x>) ; et quand AUCUN titre n'existe et qu'UN SEUL jeu
 *     d'altitudes cohérent est trouvé → un corps UNIQUE SANS TITRE. Plusieurs jeux distincts sans titre → on N'ATTRIBUE PAS (motif).
 *  2. VOCABULAIRE ouvert aux formes réelles : RDC, R+n, R-n, R0n, SSn, TOITURE. Un libellé HORS vocabulaire (ex. « BIBLIOTHEQUE NZI »
 *     à 50,83) est CAPTÉ comme niveau nommé et journalisé — jamais jeté en silence.
 *  3. SÉRIALISATION ouverte aux DEUX ordres (cote AVANT ou APRÈS le label), avec ou sans « + », avec ou sans « m », le « NGF » collé
 *     ou listé à part (forme « <cote> (NGF) »). Trois formes gérées : BLOC (labels en série puis cotes en série), et ALTERNÉE dans
 *     les deux ordres.
 *
 * SOMMET (N9-D + N10-A) : on retient le plus haut niveau NOMMÉ (acrotère corroboré au-dessus de la toiture, sinon la TOITURE). Les
 * cotes situées AU-DESSUS de ce niveau (superstructures : « hauteur maximale PLU », ombrières PV…) ne sont JAMAIS appariées au jugé,
 * mais journalisées comme candidats ÉCARTÉS avec leur pièce/page ; et la valeur retenue porte une RÉSERVE explicite. Motif à garder en
 * tête : le MNS LiDAR mesure la surface pleine LA PLUS HAUTE — une ombrière serait captée — donc retenir la toiture peut SOUS-ESTIMER
 * l'obstacle (sens d'erreur DANGEREUX). C'est la raison d'être de l'alerte du lot B.
 *
 * R-n vs SSn (N10-A, décision Arno) : on ne présente JAMAIS une inférence comme une mesure. Un « SSn » compte en sous-sol et peut être
 * `confirmee` ; un « R-n » compte AUSSI mais sa confiance est FORCÉE à `a_verifier` avec une réserve nommant le doute (le libellé est
 * R-n et non SS ; sur terrain en pente ce niveau peut être partiellement à l'air libre). Si les deux formes coexistent, un SS explicite
 * l'emporte pour la confiance. Le champ est rempli, le doute est porté par le drapeau — jamais tu.
 */
import type { ResultatLectureGed } from './lectureGed';

export type FormeAncrage = 'bat' | 'lot' | 'pln';
export interface SourceRef { piece: string; page: number; forme?: FormeAncrage | null }
export interface NiveauCote { label: string; niveau: number | null; nature: 'sous_sol' | 'rdc' | 'etage' | 'toiture'; cote: number; incertain?: boolean }
export interface FaitCorrobore<T = number> { valeur: T; confiance: 'confirmee' | 'a_verifier'; sources: SourceRef[] }

export interface DecisionCorpsNiveaux {
  repere: string | null;                    // N10-A : null = corps unique SANS titre (aucun « BAT/LOT/PLN » dans le corpus)
  niveaux: NiveauCote[];                    // échelle fusionnée (label → cote), triée par altitude
  sources: SourceRef[]; nbPieces: number;   // pièces/pages où la table du corps a été vue
  plancher: (FaitCorrobore & { label: string }) | null;         // cote du plus haut étage (R0n / R+n)
  nbEtages: (FaitCorrobore & { tension: string | null }) | null; // nombre d'étages (+ tension éventuelle avec le décompte texte)
  nbSousSol: (FaitCorrobore & { reserve: string | null }) | null; // SSn et/ou R-n (R-n → a_verifier + réserve)
  sommet: (FaitCorrobore & { qualif: 'acrotere' | 'toiture'; label: string; ecart: number | null; note: string | null }) | null; // ecart = cote − toiture (m) ; null pour une toiture

  gardeCorps: { cote: number; pieces: string[] }[];             // écartés (jamais sommet), avec leur étiquette
  niveauxNommes: { label: string; cote: number; pieces: string[] }[]; // N10-A : libellés HORS vocabulaire captés (ex. « BIBLIOTHEQUE NZI »), non comptés
  superstructures: { cote: number; piece: string; page: number }[];   // N10-A : cotes AU-DESSUS du plus haut niveau nommé (écartées, jamais appariées)
}
export interface DecisionNiveaux {
  corps: DecisionCorpsNiveaux[];
  /** Cote de garde-corps la plus haute désormais ATTRIBUÉE à un corps (ex. 89,46 = garde-corps de 2D1) : le niveau permis N8-B n'a plus lieu d'être. */
  gardeCorpsAttribue: { cote: number; repere: string | null } | null;
  /** N10-A : motif quand des tables SANS titre présentent ≥2 jeux d'altitudes distincts → on n'attribue pas au jugé. null sinon. */
  nonAttribue: string | null;
}

const VOCAB = String.raw`SS\d+|Rdc|R[+-]?\d{1,2}|TOITURE`;
// ── ANCRAGE DU BÂTIMENT — TROIS formes DISTINGUABLES, jamais « 2D » nu (forme bruitée : « LOT 2D » = l'îlot entier, « 2d5567 » = hash) :
//    'bat' = titre de coupe « BAT 2D<x> » · 'lot' = cartouche/légende « (I)LOT 2D<x> » · 'pln' = code DWG « 2D<x> PLN ». Le DIGIT est
//    OBLIGATOIRE (un plan-masse « LOT 2D » sans chiffre couvre les deux bâtiments → NON rattaché à un corps). PRIORITÉ : sur une page
//    qui porte au moins un « BAT », on n'utilise QUE les ancres BAT (comportement des coupes inchangé) ; sinon les ancres LOT/PLN.
//    N10-A : AUCUNE ancre sur la page ≠ AUCUN bâtiment — la table est alors lue SANS titre (repère null), et l'attribution se décide
//    globalement par le nombre de jeux d'altitudes distincts (voir `decisionNiveaux`).
const RE_ANCRES: { forme: FormeAncrage; re: RegExp }[] = [
  { forme: 'bat', re: /BAT\s*2D(\d)\b/gi },
  { forme: 'lot', re: /\b[iI]?LOT\s+2D(\d)\b/gi },
  { forme: 'pln', re: /\b2D(\d)\s+PLN\b/gi },
];
// BLOC : labels en série puis cotes « +…m NGF » en série (convention 07512025V0035). INLINE historique remplacé par le parseur ALTERNÉ.
const RE_BLOC = new RegExp(String.raw`((?:(?:${VOCAB})\s+){4,})((?:\+\s?\d+(?:[.,]\d+)?\s*m?\s*NGF\s*){4,})`, 'gi');
const RE_LABEL = new RegExp(VOCAB, 'gi');
const RE_COTE = /\+\s?(\d+(?:[.,]\d+)?)/g;
// ALTERNÉ (N10-A) : jetons LABEL et COTE quelconques (bare / +… / …NGF / …(NGF)). La cote nue « 60,83 » et l'inline « +82.93 » sont
//   toutes deux captées ; l'appariement se fait par ADJACENCE (un label et sa cote côte à côte), jamais entre deux listes séparées.
const RE_COTE_TOK = /(?<![\d.,])\d{1,3}[.,]\d{2}(?![\d.,])/g;
// NIVEAU NOMMÉ hors vocabulaire : « <cote> <PHRASE MAJUSCULE> » immédiatement suivi d'un « <cote> <label vocab> » (donc DANS un tableau).
const RE_NOMME = new RegExp(String.raw`(\d{1,3}[.,]\d{2})\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 .'\-]{2,30}?)(?=\s+\d{1,3}[.,]\d{2}\s+(?:${VOCAB})\b)`, 'g');
// COTE en CONTEXTE NGF (les deux ordres) : « NGF … <cote> » ou « <cote> … (NGF) » — sert à collecter les superstructures au-dessus du sommet.
const RE_NGF_CTX = /(?:NGF[^0-9\n]{0,14}(\d{1,3}[.,]\d{2})|(\d{1,3}[.,]\d{2})[^0-9\n]{0,8}\(?\s*NGF)/gi;
const num = (s: string) => Number(s.replace(',', '.'));

// ── SOMMET par ancrage sur la TOITURE du corps (N9-D). On n'attribue plus par proximité d'étiquette (voies closes P4/P5) : on borne
//    une FENÊTRE NUMÉRIQUE au-dessus d'une valeur DÉJÀ attribuée et corroborée — la toiture du tableau de niveaux.
/** Hauteur de la fenêtre au-dessus de la toiture d'un corps où une cote « acrotère » EST son sommet. JUSTIFICATION (mesure sur
 *  07512025V0035) : les acrotères réels sont à **+0,50 m** (2D1) et **+1,02 m** (2D2) de LEUR toiture ; l'écart entre toitures
 *  voisines y vaut **2,30 m**. 1,50 m couvre les acrotères réels avec marge (≥ 1,02) tout en restant BIEN sous 2,30 m ; un PLAFOND
 *  DYNAMIQUE (la toiture du corps immédiatement au-dessus) empêche en outre toute morsure sur un autre corps. Constante nommée,
 *  éditable ; PAS un nombre magique. */
const SOMMET_FENETRE_M = 1.5;
/** Étiquettes de SUPERSTRUCTURE : « acrotère esc/PAC/solaire/… » n'est PAS l'acrotère du toit → écarté du sommet (garde n°2 :
 *  sans lui, 2D1 basculerait à tort à l'acrotère d'édicule 89,41). */
const SOMMET_SUPERSTRUCTURE = String.raw`esc|pac|solair|panneau|exutoire|des\.|cta|\ban\b|[eé]dicule|technique|ventilation|local`;
/** Cote de sommet ÉTIQUETÉE, forme DIRECTE et NGF-contexte : le nombre est une ALTITUDE (précédée de « NGF »/« + »), JAMAIS une NVP
 *  (garde n°1 : c'est une NVP fuyante — 88,58 de 2D1 — qui avait produit un faux sommet). Étiquette NUE (garde n°2). Deux ordres. */
const RE_SOMMET_AV = new RegExp(String.raw`NGF\s+(acrot[eè]re|garde-corps)(?:\s+[àa]\s+lisse)?(?!\s+(?:${SOMMET_SUPERSTRUCTURE}))\s+\+?\s?(\d+[.,]\d+)`, 'gi');
const RE_SOMMET_AP = new RegExp(String.raw`NGF\s+\+?\s?(\d+[.,]\d+)\s+(acrot[eè]re|garde-corps)(?:\s+[àa]\s+lisse)?(?!\s+(?:${SOMMET_SUPERSTRUCTURE}))`, 'gi');

interface CoteSommet { cote: number; qualif: 'acrotere' | 'garde-corps' }
const typeSommet = (s: string): 'acrotere' | 'garde-corps' => (/garde/i.test(s) ? 'garde-corps' : 'acrotere');
/** Cotes de sommet ÉTIQUETÉES d'une page (bare acrotère/garde-corps, NGF-contexte, jamais NVP, jamais superstructure). Page-indépendant. */
function cotesSommetDansTexte(texte: string): CoteSommet[] {
  const out: CoteSommet[] = [];
  for (const m of texte.matchAll(RE_SOMMET_AV)) out.push({ cote: num(m[2]), qualif: typeSommet(m[1]) });
  for (const m of texte.matchAll(RE_SOMMET_AP)) out.push({ cote: num(m[1]), qualif: typeSommet(m[2]) });
  return out;
}

/** N10-A — normalise un libellé de niveau. Ouvert à RDC / R0n / R+n / R-n / SSn / TOITURE. `incertain` = R-n (compté en sous-sol mais
 *  a_verifier : le libellé n'est pas SS et le niveau peut être partiellement à l'air libre). null = hors vocabulaire (traité à part). */
function normLabel(raw: string): Omit<NiveauCote, 'cote'> | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  let m: RegExpExecArray | null;
  if ((m = /^SS(\d+)$/.exec(s))) return { label: `SS${m[1]}`, niveau: -Number(m[1]), nature: 'sous_sol' };
  if (/^RDC$/.test(s)) return { label: 'Rdc', niveau: 0, nature: 'rdc' };
  if ((m = /^R-(\d{1,2})$/.exec(s))) return { label: `R-${m[1]}`, niveau: -Number(m[1]), nature: 'sous_sol', incertain: true }; // R-n : sous-sol INCERTAIN
  if ((m = /^R\+?0*(\d{1,2})$/.exec(s))) return { label: `R${m[1].padStart(2, '0')}`, niveau: Number(m[1]), nature: 'etage' };    // R0n / R+n / Rn
  if (/^TOITURE$/.test(s)) return { label: 'TOITURE', niveau: null, nature: 'toiture' };
  return null;
}

interface TitrePos { repere: string; index: number; forme: FormeAncrage }
interface TablePage { repere: string | null; niveaux: NiveauCote[]; forme: FormeAncrage | null }

/** Ancre la plus proche d'un index (repère + forme). null si la page n'en porte aucune. Sur une page à BAT, seules les ancres BAT jouent. */
function ancreLaPlusProche(titres: TitrePos[], index: number): { repere: string; forme: FormeAncrage } | null {
  if (!titres.length) return null;
  const t = titres.reduce((best, x) => (Math.abs(x.index - index) < Math.abs(best.index - index) ? x : best));
  return { repere: t.repere, forme: t.forme };
}

/** Ancres d'une page : les « BAT » si présentes (priorité, coupes inchangées), sinon « LOT »/« PLN » (plans de toiture, élévations). */
function ancresPage(texte: string): TitrePos[] {
  const bat: TitrePos[] = [...texte.matchAll(RE_ANCRES[0].re)].map((m) => ({ repere: `2D${m[1]}`, index: m.index ?? 0, forme: 'bat' as const }));
  if (bat.length) return bat;
  const autres: TitrePos[] = [];
  for (const { forme, re } of RE_ANCRES.slice(1)) for (const m of texte.matchAll(re)) autres.push({ repere: `2D${m[1]}`, index: m.index ?? 0, forme });
  return autres;
}

// ── PARSEUR ALTERNÉ (N10-A) : reconstruit un tableau depuis une suite ALTERNÉE label↔cote, DANS LES DEUX ORDRES, par adjacence. ──
interface Tok { t: 'L' | 'C'; label?: Omit<NiveauCote, 'cote'>; cote?: number; i: number; fin: number }
const GAP_ALT = 40; // saut maximal (caractères) entre deux jetons d'une même table alternée
function tokeniser(texte: string): Tok[] {
  const toks: Tok[] = [];
  for (const m of texte.matchAll(RE_LABEL)) { const l = normLabel(m[0]); if (l) toks.push({ t: 'L', label: l, i: m.index ?? 0, fin: (m.index ?? 0) + m[0].length }); }
  for (const m of texte.matchAll(RE_COTE_TOK)) toks.push({ t: 'C', cote: num(m[0]), i: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  return toks.sort((a, b) => a.i - b.i);
}
/** Runs ALTERNÉS (≥4 paires) hors des portées BLOC. Ordre déterminé par le 1er jeton : commence par une COTE → « cote label » ; par un
 *  LABEL → « label cote ». L'appariement est strictement par adjacence (jamais entre deux listes séparées de cotes/labels). */
function tablesAlternees(texte: string, dansPortee: (i: number) => boolean): { niveaux: NiveauCote[]; index: number; fin: number }[] {
  const toks = tokeniser(texte);
  const out: { niveaux: NiveauCote[]; index: number; fin: number }[] = [];
  let i = 0;
  while (i < toks.length) {
    let j = i;
    while (j + 1 < toks.length && toks[j + 1].i - toks[j].fin <= GAP_ALT && toks[j + 1].t !== toks[j].t) j++;
    const run = toks.slice(i, j + 1);
    if (run.length >= 8 && !dansPortee(run[0].i)) {
      const coteFirst = run[0].t === 'C';
      const niveaux: NiveauCote[] = [];
      for (let k = 0; k + 1 < run.length; k += 2) {
        const label = coteFirst ? run[k + 1].label : run[k].label;
        const cote = coteFirst ? run[k].cote : run[k + 1].cote;
        if (label && cote !== undefined) niveaux.push({ ...label, cote });
      }
      if (niveaux.length >= 4) out.push({ niveaux, index: run[0].i, fin: run[run.length - 1].fin });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Niveaux NOMMÉS hors vocabulaire d'une page (ex. « 50,83 BIBLIOTHEQUE NZI » dans un tableau). Filtrés des vrais labels. */
function niveauxNommesDansTexte(texte: string): { label: string; cote: number }[] {
  const out: { label: string; cote: number }[] = [];
  for (const m of texte.matchAll(RE_NOMME)) {
    const label = m[2].trim().replace(/\s+/g, ' ');
    if (normLabel(label)) continue; // un vrai label vocab n'est pas un « nommé »
    out.push({ label, cote: num(m[1]) });
  }
  return out;
}

/** Cotes en contexte NGF STRICTEMENT au-dessus d'un seuil (superstructures). Dédupliquées par valeur. */
function cotesNgfAuDessus(texte: string, seuil: number): number[] {
  const set = new Set<number>();
  for (const m of texte.matchAll(RE_NGF_CTX)) { const c = num(m[1] ?? m[2]); if (c > seuil + 0.005) set.add(c); }
  return [...set].sort((a, b) => b - a);
}

/** Analyse UNE page : ancres bâtiment (BAT/LOT/PLN, éventuellement AUCUNE) + tables de niveaux (BLOC + ALTERNÉ). */
function analyserPage(texte: string): { tables: TablePage[] } {
  const titres = ancresPage(texte);
  const repereDe = (idx: number): { repere: string | null; forme: FormeAncrage | null } => {
    if (!titres.length) return { repere: null, forme: null };
    const a = ancreLaPlusProche(titres, idx) ?? titres[0];
    return { repere: a.repere, forme: a.forme };
  };

  const tables: TablePage[] = [];
  const portees: [number, number][] = [];
  // BLOC d'abord (on mémorise les portées consommées).
  for (const m of texte.matchAll(RE_BLOC)) {
    const labels = (m[1].match(RE_LABEL) ?? []).map(normLabel).filter((x): x is Omit<NiveauCote, 'cote'> => x !== null);
    const cotes = [...m[2].matchAll(RE_COTE)].map((c) => num(c[1]));
    const n = Math.min(labels.length, cotes.length);
    if (n < 4) continue;
    const niveaux: NiveauCote[] = labels.slice(0, n).map((l, k) => ({ ...l, cote: cotes[k] }));
    const idx = m.index ?? 0;
    portees.push([idx, idx + m[0].length]);
    const a = repereDe(idx);
    tables.push({ repere: a.repere, forme: a.forme, niveaux });
  }
  const dansPortee = (i: number) => portees.some(([a, b]) => i >= a && i < b);
  // ALTERNÉ ensuite (hors portées BLOC), les deux ordres.
  for (const t of tablesAlternees(texte, dansPortee)) {
    const a = repereDe(t.index);
    tables.push({ repere: a.repere, forme: a.forme, niveaux: t.niveaux });
  }
  return { tables };
}

// ── ACCUMULATION par corps ────────────────────────────────────────────────────
interface Acc { cotes: Map<string, Map<number, Set<string>>>; sources: SourceRef[]; nommes: Map<string, Map<number, Set<string>>> }
const conf = (pieces: Set<string>): 'confirmee' | 'a_verifier' => (pieces.size >= 2 ? 'confirmee' : 'a_verifier');
/** valeur RETENUE d'un label = la cote la plus corroborée (nb de pièces), départage par la plus fréquente. */
function retenue(m: Map<number, Set<string>>): { cote: number; pieces: Set<string> } | null {
  let best: { cote: number; pieces: Set<string> } | null = null;
  for (const [cote, pieces] of m) if (best === null || pieces.size > best.pieces.size) best = { cote, pieces };
  return best;
}
/**
 * N10-A — regroupe les tables SANS titre en JEUX d'altitudes par COMPATIBILITÉ (et non par égalité stricte) : deux tables sont du même
 * jeu si, pour tout label PARTAGÉ, la cote est la même (tolérance). Motif : des pièces différentes montrent des SOUS-ENSEMBLES du même
 * bâtiment (ex. une façade sans le R-1) — c'est cohérent, pas un conflit ; on ne doit pas en faire deux bâtiments. Union-Find sur les
 * tables ; un CONFLIT sur un label partagé (cotes différentes) = deux jeux DISTINCTS (bâtiments réellement différents). Nombre de
 * composantes = nombre de jeux. Deux tables sans label commun ne se lient pas (on ne fusionne pas au hasard).
 */
const TOL_JEU = 0.05;
function composantesCompatibles(tables: { niveaux: NiveauCote[] }[]): number[][] {
  const parent = tables.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const coteDe = (t: { niveaux: NiveauCote[] }, label: string) => t.niveaux.find((n) => n.label === label)?.cote;
  for (let i = 0; i < tables.length; i++) for (let j = i + 1; j < tables.length; j++) {
    const partages = tables[i].niveaux.map((n) => n.label).filter((l) => tables[j].niveaux.some((m) => m.label === l));
    if (partages.length === 0) continue;
    if (partages.every((l) => Math.abs((coteDe(tables[i], l) as number) - (coteDe(tables[j], l) as number)) < TOL_JEU)) parent[find(i)] = find(j);
  }
  const groupes = new Map<number, number[]>();
  for (let i = 0; i < tables.length; i++) { const r = find(i); (groupes.get(r) ?? groupes.set(r, []).get(r)!).push(i); }
  return [...groupes.values()];
}

/**
 * Décide les caractéristiques par corps depuis les tableaux de niveaux de la GED. `floorcountParCorps` (optionnel, ex. issu de
 * decisionLots « Lot 2D<n> en R+<m> ») sert UNIQUEMENT à signaler une tension avec le décompte texte — jamais à choisir en silence.
 */
export function decisionNiveaux(ged: ResultatLectureGed, floorcountParCorps: Record<string, { valeur: number; piece: string }> = {}): DecisionNiveaux {
  // 1) rassembler par corps toutes les (label → cote) des TABLES vues. Titres → clé = repère ; SANS titre → clé = signature du jeu (un
  //    jeu = un corps candidat, ce qui permet de distinguer « un seul bâtiment sans titre » de « plusieurs jeux distincts »). En
  //    parallèle, collecter GLOBALEMENT les cotes de sommet étiquetées de TOUTES les pages (attribution par toiture, N9-D).
  const titres = new Map<string, Acc>();    // repère → Acc
  interface TableSansTitre { niveaux: NiveauCote[]; piece: string; page: number; nommes: { label: string; cote: number }[] }
  const untitled: TableSansTitre[] = []; // tables sans titre : regroupées ensuite par COMPATIBILITÉ (composantesCompatibles)
  const accDe = (m: Map<string, Acc>, k: string) => { let a = m.get(k); if (!a) { a = { cotes: new Map(), sources: [], nommes: new Map() }; m.set(k, a); } return a; };
  const sommetsGlobaux = new Map<string, Map<string, number>>(); // clé `${cote}#${qualif}` → (pièce → 1re page)

  const ajouter = (a: Acc, t: TablePage, piece: string, page: number, forme: FormeAncrage | null, nommes: { label: string; cote: number }[]) => {
    let compte = false;
    for (const nv of t.niveaux) {
      const parLabel = a.cotes.get(nv.label) ?? a.cotes.set(nv.label, new Map()).get(nv.label)!;
      const pieces = parLabel.get(nv.cote) ?? (parLabel.set(nv.cote, new Set()), parLabel.get(nv.cote)!);
      pieces.add(piece); compte = true;
    }
    for (const nm of nommes) {
      const parLabel = a.nommes.get(nm.label) ?? a.nommes.set(nm.label, new Map()).get(nm.label)!;
      const pieces = parLabel.get(nm.cote) ?? (parLabel.set(nm.cote, new Set()), parLabel.get(nm.cote)!);
      pieces.add(piece);
    }
    if (compte) a.sources.push({ piece, page, forme });
  };

  for (const p of ged.pieces) for (const pg of p.pages) {
    if (!pg.aTexte) continue;
    const { tables } = analyserPage(pg.texte);
    const nommes = niveauxNommesDansTexte(pg.texte);
    for (const t of tables) {
      if (t.repere !== null) ajouter(accDe(titres, t.repere), t, p.nomFichier, pg.page, t.forme, nommes);
      else untitled.push({ niveaux: t.niveaux, piece: p.nomFichier, page: pg.page, nommes });
    }
    for (const s of cotesSommetDansTexte(pg.texte)) {
      const k = `${s.cote}#${s.qualif}`;
      const m = sommetsGlobaux.get(k) ?? sommetsGlobaux.set(k, new Map()).get(k)!;
      if (!m.has(p.nomFichier)) m.set(p.nomFichier, pg.page);
    }
  }

  // 2) Choix des corps à construire. Titres présents → un corps par repère (comportement 07512025V0035 inchangé). SINON, règle N10-A :
  //    un seul jeu d'altitudes → un corps UNIQUE sans titre ; ≥2 jeux distincts → on n'attribue PAS (motif), aucun corps inventé.
  let nonAttribue: string | null = null;
  const aConstruire: { repere: string | null; acc: Acc }[] = [];
  if (titres.size > 0) {
    for (const [repere, acc] of [...titres.entries()].sort()) aConstruire.push({ repere, acc });
  } else if (untitled.length > 0) {
    const groupes = composantesCompatibles(untitled);
    if (groupes.length === 1) {
      // UN seul jeu cohérent (sous-ensembles compatibles fusionnés) → un corps UNIQUE sans titre.
      const a: Acc = { cotes: new Map(), sources: [], nommes: new Map() };
      for (const idx of groupes[0]) { const t = untitled[idx]; ajouter(a, { repere: null, forme: null, niveaux: t.niveaux }, t.piece, t.page, null, t.nommes); }
      aConstruire.push({ repere: null, acc: a });
    } else {
      nonAttribue = `${groupes.length} jeux d'altitudes DISTINCTS (incompatibles) trouvés sans aucun titre de bâtiment (BAT/LOT/PLN) → affectation par bâtiment impossible sans repère ; aucun corps attribué (on ne devine pas).`;
    }
  }

  // Toitures RETENUES de tous les corps (triées) : ancre du sommet ET PLAFOND dynamique (la fenêtre d'un corps ne mord jamais la toiture d'un autre).
  const toituresTriees = aConstruire.map(({ acc }) => { const t = acc.cotes.get('TOITURE'); const r = t ? retenue(t) : null; return r?.cote; }).filter((c): c is number => c !== undefined).sort((x, y) => x - y);

  const sommetsFiltres = (qualif: 'acrotere' | 'garde-corps', toit: number, plafond: number) =>
    [...sommetsGlobaux.entries()]
      .filter(([k]) => k.endsWith(`#${qualif}`))
      .map(([k, pieces]) => ({ cote: num(k.split('#')[0]), pieces }))
      .filter((x) => x.cote >= toit - 0.005 && x.cote <= plafond)
      .sort((a, b) => b.cote - a.cote);

  const corps: DecisionCorpsNiveaux[] = [];
  let gardeCorpsAttribue: DecisionNiveaux['gardeCorpsAttribue'] = null;

  for (const { repere, acc: a } of aConstruire) {
    const niveaux: NiveauCote[] = [];
    for (const [label, m] of a.cotes) { const r = retenue(m); if (!r) continue; const meta = normLabel(label); if (meta) niveaux.push({ ...meta, cote: r.cote }); }
    niveaux.sort((x, y) => x.cote - y.cote);
    const srcUniq = [...new Map(a.sources.map((s) => [`${s.piece}#${s.page}`, s])).values()];
    const nbPieces = new Set(a.sources.map((s) => s.piece)).size;

    const etages = niveaux.filter((n) => n.nature === 'etage');
    const sousSols = niveaux.filter((n) => n.nature === 'sous_sol');
    const toit = niveaux.find((n) => n.nature === 'toiture') ?? null;
    const plusHautEtage = etages.reduce<NiveauCote | null>((mx, n) => (mx === null || (n.niveau ?? 0) > (mx.niveau ?? 0) ? n : mx), null);

    // plancher = cote du plus haut étage
    const plancherPieces = plusHautEtage ? a.cotes.get(plusHautEtage.label)! : null;
    const plancher = plusHautEtage && plancherPieces ? { valeur: plusHautEtage.cote, label: plusHautEtage.label, confiance: conf(plancherPieces.get(plusHautEtage.cote)!), sources: srcUniq } : null;

    // nb_etages = nombre d'étages ; tension éventuelle avec le décompte texte
    const fc = repere ? floorcountParCorps[repere] : undefined;
    const tension = plusHautEtage && fc && fc.valeur !== etages.length
      ? `la coupe donne ${etages.length} niveaux R0n (R${String(plusHautEtage.niveau).padStart(2, '0')} ${srcUniq[0]?.piece ?? ''}) ; le décompte texte dit R+${fc.valeur} (${fc.piece}) — sources concordantes chacune, divergentes entre elles`
      : null;
    const nbEtages = etages.length ? { valeur: etages.length, confiance: (nbPieces >= 2 ? 'confirmee' : 'a_verifier') as 'confirmee' | 'a_verifier', sources: srcUniq, tension } : null;

    // nb_niveaux_sous_sol : SSn et/ou R-n. R-n SANS SS explicite → FORCÉ à a_verifier + réserve (jamais une inférence présentée comme un fait).
    const aSS = sousSols.some((s) => !s.incertain);
    const aRneg = sousSols.some((s) => s.incertain);
    const ssReserve = (aRneg && !aSS)
      ? 'le(s) niveau(x) en sous-sol sont libellés R-n (et non SS) ; sur un terrain en pente un R-n peut être partiellement à l’air libre — à vérifier'
      : null;
    const ssConf: 'confirmee' | 'a_verifier' = (aRneg && !aSS) ? 'a_verifier' : (nbPieces >= 2 ? 'confirmee' : 'a_verifier');
    const nbSousSol = sousSols.length ? { valeur: sousSols.length, confiance: ssConf, sources: srcUniq, reserve: ssReserve } : null;

    // ── SOMMET par ancrage sur la toiture (N9-D) + réserve superstructures (N10-A) ──
    const toitCote = toit?.cote ?? null;
    let sommet: DecisionCorpsNiveaux['sommet'] = null;
    let gardeCorps: { cote: number; pieces: string[] }[] = [];
    const superstructures: { cote: number; piece: string; page: number }[] = [];
    if (toitCote !== null) {
      const toitSup = toituresTriees.find((t) => t > toitCote + 1e-9);
      const plafond = Math.min(toitCote + SOMMET_FENETRE_M, toitSup !== undefined ? toitSup - 0.01 : Infinity);
      const acros = sommetsFiltres('acrotere', toitCote, plafond);
      const acroCorrobore = acros.find((x) => x.pieces.size >= 2) ?? null;
      const acroUnique = acros.find((x) => x.pieces.size < 2) ?? null;
      const srcSommet = (m: Map<string, number>): SourceRef[] => [...m.entries()].map(([piece, page]) => ({ piece, page }));
      if (acroCorrobore) {
        sommet = { valeur: acroCorrobore.cote, confiance: 'confirmee', qualif: 'acrotere', label: 'Acrotère', ecart: Number((acroCorrobore.cote - toitCote).toFixed(2)), sources: srcSommet(acroCorrobore.pieces), note: null };
      } else {
        const note = acroUnique
          ? `acrotère ${acroUnique.cote} (écart +${(acroUnique.cote - toitCote).toFixed(2)} m) vu sur 1 pièce seulement (non corroboré) → non retenu ; toiture retenue`
          : `aucun acrotère corroboré dans la fenêtre [${toitCote} ; ${plafond === Infinity ? toitCote + SOMMET_FENETRE_M : plafond}] → toiture retenue`;
        sommet = { valeur: toitCote, confiance: conf(a.cotes.get('TOITURE')?.get(toitCote) ?? new Set()), qualif: 'toiture', label: 'TOITURE', ecart: null, note, sources: srcUniq };
      }
      gardeCorps = sommetsFiltres('garde-corps', toitCote, plafond).map((g) => ({ cote: g.cote, pieces: [...g.pieces.keys()] }));
      for (const g of gardeCorps) if (!gardeCorpsAttribue || g.cote > gardeCorpsAttribue.cote) gardeCorpsAttribue = { cote: g.cote, repere };

      // N10-A — SUPERSTRUCTURES : cotes NGF STRICTEMENT au-dessus du plus haut niveau NOMMÉ (ici la toiture retenue), sur les pages du
      //   corps. Jamais appariées ; journalisées écartées. Réserve appendée au sommet SEULEMENT si le sommet retenu EST la toiture (une
      //   ombrière au-dessus serait mesurée par le MNS LiDAR → retenir la toiture SOUS-ESTIMERAIT l'obstacle : sens d'erreur dangereux).
      const seuil = sommet.valeur;
      const vues = new Set<number>();
      for (const s of srcUniq) {
        const pg = ged.pieces.find((p) => p.nomFichier === s.piece)?.pages.find((x) => x.page === s.page);
        if (!pg?.aTexte) continue;
        for (const c of cotesNgfAuDessus(pg.texte, seuil)) if (!vues.has(c)) { vues.add(c); superstructures.push({ cote: c, piece: s.piece, page: s.page }); }
      }
      superstructures.sort((x, y) => y.cote - x.cote);
      if (sommet.qualif === 'toiture' && superstructures.length > 0) {
        const liste = superstructures.map((x) => x.cote).slice(0, 8).join(', ');
        sommet = { ...sommet, note: `${sommet.note ? `${sommet.note} ; ` : ''}RÉSERVE : ${superstructures.length} cote(s) au-dessus du plus haut niveau nommé (${liste}) — superstructure(s) (ex. « hauteur maximale PLU », ombrières PV). Le MNS LiDAR mesure la surface pleine la plus haute : retenir la toiture peut SOUS-ESTIMER l'obstacle (alerte lot B)` };
      }
    }

    // niveaux NOMMÉS hors vocabulaire (retenus par corroboration), non comptés dans les étages/sous-sols
    const niveauxNommes: DecisionCorpsNiveaux['niveauxNommes'] = [];
    for (const [label, m] of a.nommes) { const r = retenue(m); if (r) niveauxNommes.push({ label, cote: r.cote, pieces: [...r.pieces] }); }
    niveauxNommes.sort((x, y) => x.cote - y.cote);

    corps.push({ repere, niveaux, sources: srcUniq, nbPieces, plancher, nbEtages, nbSousSol, sommet, gardeCorps, niveauxNommes, superstructures });
  }

  return { corps, gardeCorpsAttribue, nonAttribue };
}
