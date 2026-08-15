/**
 * N9-B — DÉCISION PURE : les caractéristiques d'un corps dérivées du TABLEAU DE NIVEAUX de la coupe, ancré sur un titre « BAT 2D<x> ».
 * Aucune base, aucune écriture, aucune IA, aucune géométrie. On cible la STRUCTURE (le tableau attribué à un bâtiment), jamais des
 * cotes isolées : c'est ce qui permet d'attribuer PAR BÂTIMENT (ce que le chaînage N8-B ne savait pas faire, d'où l'erreur 82,93).
 *
 * RÈGLE (arbitrée) :
 *  1. ancrer sur « BAT 2D(\d) » → identifie le corps ;
 *  2. lire le tableau : vocabulaire FERMÉ {SS\d, Rdc, R0?\d{1,2}, TOITURE}, avec cote NGF (le NVP n'est pas retenu) ;
 *  3. par corps, depuis SA table : plancher = cote du plus haut R0n · nb_etages = nombre de R0n · nb_sous_sol = nombre de SS ·
 *     sommet = ACROTÈRE du bloc de tête (au-dessus de la toiture) s'il est CORROBORÉ, SINON TOITURE. Le garde-corps (ajouré : ni
 *     mesuré au LiDAR ni masquant) n'est JAMAIS le sommet → écarté, mais journalisé avec son étiquette ;
 *  4. corroboration : même valeur retrouvée sur ≥2 pièces → confirmee, sinon a_verifier ;
 *  5. ce tableau PRIME toute cote isolée.
 *
 * Deux sérialisations de la couche texte, toutes deux gérées : (a) INLINE « R07 +82.93 m NGF » (label collé à sa cote) ;
 * (b) BLOC « Rdc R01 … TOITURE SS1  +59.63m NGF … +53.83m NGF » (labels en série puis cotes en série, appariés par rang).
 * Le sommet : les étiquettes (Acrotère / Garde-corps) sont appariées à leur cote par la valeur NVP partagée (cote − δ ≈ NVP),
 * ce qui lève le glissement de proximité qui avait fait qualifier 89,46 « acrotère » alors que la planche dit garde-corps.
 */
import type { ResultatLectureGed } from './lectureGed';

export type FormeAncrage = 'bat' | 'lot' | 'pln';
export interface SourceRef { piece: string; page: number; forme?: FormeAncrage }
export interface NiveauCote { label: string; niveau: number | null; nature: 'sous_sol' | 'rdc' | 'etage' | 'toiture'; cote: number }
export interface FaitCorrobore<T = number> { valeur: T; confiance: 'confirmee' | 'a_verifier'; sources: SourceRef[] }

export interface DecisionCorpsNiveaux {
  repere: string;
  niveaux: NiveauCote[];                    // échelle fusionnée (label → cote), triée par altitude
  sources: SourceRef[]; nbPieces: number;   // pièces/pages où la table du corps a été vue
  plancher: (FaitCorrobore & { label: string }) | null;         // cote du plus haut R0n
  nbEtages: (FaitCorrobore & { tension: string | null }) | null; // nombre de R0n (+ tension éventuelle avec le décompte texte)
  nbSousSol: FaitCorrobore | null;
  sommet: (FaitCorrobore & { qualif: 'acrotere' | 'toiture'; label: string; ecart: number | null; note: string | null }) | null; // ecart = cote − toiture (m) ; null pour une toiture

  gardeCorps: { cote: number; pieces: string[] }[];             // écartés (jamais sommet), avec leur étiquette
}
export interface DecisionNiveaux {
  corps: DecisionCorpsNiveaux[];
  /** Cote de garde-corps la plus haute désormais ATTRIBUÉE à un corps (ex. 89,46 = garde-corps de 2D1) : le niveau permis N8-B n'a plus lieu d'être. */
  gardeCorpsAttribue: { cote: number; repere: string } | null;
}

const VOCAB = String.raw`SS\d|Rdc|R0?\d{1,2}|TOITURE`;
// ── ANCRAGE DU BÂTIMENT — TROIS formes DISTINGUABLES, jamais « 2D » nu (forme bruitée : « LOT 2D » = l'îlot entier, « 2d5567 » = hash) :
//    'bat' = titre de coupe « BAT 2D<x> » · 'lot' = cartouche/légende « (I)LOT 2D<x> » · 'pln' = code DWG « 2D<x> PLN ». Le DIGIT est
//    OBLIGATOIRE (un plan-masse « LOT 2D » sans chiffre couvre les deux bâtiments → NON rattaché à un corps). PRIORITÉ : sur une page
//    qui porte au moins un « BAT », on n'utilise QUE les ancres BAT (comportement des coupes inchangé) ; sinon les ancres LOT/PLN.
const RE_ANCRES: { forme: FormeAncrage; re: RegExp }[] = [
  { forme: 'bat', re: /BAT\s*2D(\d)\b/gi },
  { forme: 'lot', re: /\b[iI]?LOT\s+2D(\d)\b/gi },
  { forme: 'pln', re: /\b2D(\d)\s+PLN\b/gi },
];
const RE_BLOC = new RegExp(String.raw`((?:(?:${VOCAB})\s+){4,})((?:\+\s?\d+(?:[.,]\d+)?\s*m?\s*NGF\s*){4,})`, 'gi');
const RE_INLINE = new RegExp(String.raw`(${VOCAB})\s*\+\s?(\d+(?:[.,]\d+)?)\s*m?\s*NGF`, 'gi');
const RE_LABEL = new RegExp(VOCAB, 'gi');
const RE_COTE = /\+\s?(\d+(?:[.,]\d+)?)/g;
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

function normLabel(raw: string): Omit<NiveauCote, 'cote'> | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  let m: RegExpExecArray | null;
  if ((m = /^SS(\d)$/.exec(s))) return { label: `SS${m[1]}`, niveau: -Number(m[1]), nature: 'sous_sol' };
  if (/^RDC$/.test(s)) return { label: 'Rdc', niveau: 0, nature: 'rdc' };
  if ((m = /^R0?(\d{1,2})$/.exec(s))) return { label: `R${m[1].padStart(2, '0')}`, niveau: Number(m[1]), nature: 'etage' };
  if (/^TOITURE$/.test(s)) return { label: 'TOITURE', niveau: null, nature: 'toiture' };
  return null;
}

interface TitrePos { repere: string; index: number; forme: FormeAncrage }
interface TablePage { repere: string; niveaux: NiveauCote[]; forme: FormeAncrage }

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

/** Analyse UNE page : ancres bâtiment (BAT/LOT/PLN) + tables de niveaux (bloc + inline). Le sommet est décidé ailleurs (N9-D). */
function analyserPage(texte: string): { tables: TablePage[] } {
  const titres = ancresPage(texte);
  if (!titres.length) return { tables: [] };

  // ── Tables : bloc d'abord (on mémorise les portées consommées), puis inline HORS de ces portées ──
  const tables: (TablePage & { index: number })[] = [];
  const portees: [number, number][] = [];
  for (const m of texte.matchAll(RE_BLOC)) {
    const labels = (m[1].match(RE_LABEL) ?? []).map(normLabel).filter((x): x is Omit<NiveauCote, 'cote'> => x !== null);
    const cotes = [...m[2].matchAll(RE_COTE)].map((c) => num(c[1]));
    const n = Math.min(labels.length, cotes.length);
    if (n < 4) continue;
    const niveaux: NiveauCote[] = labels.slice(0, n).map((l, i) => ({ ...l, cote: cotes[i] }));
    const idx = m.index ?? 0;
    portees.push([idx, idx + m[0].length]);
    const a = ancreLaPlusProche(titres, idx) ?? titres[0];
    tables.push({ repere: a.repere, forme: a.forme, niveaux, index: idx });
  }
  const dansPortee = (i: number) => portees.some(([a, b]) => i >= a && i < b);
  // inline : on groupe les paires contiguës (< 200 caractères de saut) en une table
  const paires = [...texte.matchAll(RE_INLINE)].filter((m) => !dansPortee(m.index ?? 0));
  let courant: { niveaux: NiveauCote[]; index: number; fin: number } | null = null;
  const pousser = () => { if (courant && courant.niveaux.length >= 4) { const a = ancreLaPlusProche(titres, courant.index) ?? titres[0]; tables.push({ repere: a.repere, forme: a.forme, niveaux: courant.niveaux, index: courant.index }); } courant = null; };
  for (const m of paires) {
    const l = normLabel(m[1]); if (!l) continue;
    const idx = m.index ?? 0;
    if (courant && idx - courant.fin > 200) pousser();
    if (!courant) courant = { niveaux: [], index: idx, fin: idx };
    courant.niveaux.push({ ...l, cote: num(m[2]) }); courant.fin = idx + m[0].length;
  }
  pousser();
  // Le SOMMET n'est PLUS extrait ici (N9-D) : il est décidé globalement par ancrage sur la toiture (voir `decisionNiveaux`),
  // à partir des cotes étiquetées de TOUTES les pages — pas seulement des pages ancrées. `analyserPage` ne rend que les tables.
  return { tables: tables.map(({ repere, niveaux, forme }) => ({ repere, niveaux, forme })) };
}

/**
 * Décide les caractéristiques par corps depuis les tableaux de niveaux de la GED. `floorcountParCorps` (optionnel, ex. issu de
 * decisionLots « Lot 2D<n> en R+<m> ») sert UNIQUEMENT à signaler une tension avec le décompte texte — jamais à choisir en silence.
 */
export function decisionNiveaux(ged: ResultatLectureGed, floorcountParCorps: Record<string, { valeur: number; piece: string }> = {}): DecisionNiveaux {
  // 1) rassembler, par corps, toutes les (label → cote) des TABLES vues, avec leurs pièces/pages. En parallèle, collecter GLOBALEMENT
  //    les cotes de sommet étiquetées de TOUTES les pages (indépendamment de l'ancrage) : l'attribution se fera par toiture (N9-D).
  interface Acc { cotes: Map<string, Map<number, Set<string>>>; sources: SourceRef[] }
  const parCorps = new Map<string, Acc>();
  const acc = (r: string) => { let a = parCorps.get(r); if (!a) { a = { cotes: new Map(), sources: [] }; parCorps.set(r, a); } return a; };
  const sommetsGlobaux = new Map<string, Map<string, number>>(); // clé `${cote}#${qualif}` → (pièce → 1re page)

  for (const p of ged.pieces) for (const pg of p.pages) {
    if (!pg.aTexte) continue;
    const { tables } = analyserPage(pg.texte);
    for (const t of tables) {
      const a = acc(t.repere);
      let compte = false;
      for (const nv of t.niveaux) {
        const parLabel = a.cotes.get(nv.label) ?? a.cotes.set(nv.label, new Map()).get(nv.label)!;
        const pieces = parLabel.get(nv.cote) ?? (parLabel.set(nv.cote, new Set()), parLabel.get(nv.cote)!);
        pieces.add(p.nomFichier); compte = true;
      }
      if (compte) a.sources.push({ piece: p.nomFichier, page: pg.page, forme: t.forme });
    }
    for (const s of cotesSommetDansTexte(pg.texte)) {
      const k = `${s.cote}#${s.qualif}`;
      const m = sommetsGlobaux.get(k) ?? sommetsGlobaux.set(k, new Map()).get(k)!;
      if (!m.has(p.nomFichier)) m.set(p.nomFichier, pg.page);
    }
  }
  // Cotes de sommet dans la fenêtre d'un corps : au-dessus de sa toiture et sous le plafond dynamique (jamais la toiture voisine).
  const sommetsFiltres = (qualif: 'acrotere' | 'garde-corps', toit: number, plafond: number) =>
    [...sommetsGlobaux.entries()]
      .filter(([k]) => k.endsWith(`#${qualif}`))
      .map(([k, pieces]) => ({ cote: num(k.split('#')[0]), pieces }))
      .filter((x) => x.cote >= toit - 0.005 && x.cote <= plafond)
      .sort((a, b) => b.cote - a.cote);

  const conf = (pieces: Set<string>): 'confirmee' | 'a_verifier' => (pieces.size >= 2 ? 'confirmee' : 'a_verifier');
  // valeur RETENUE d'un label = la cote la plus corroborée (nb de pièces), départage par la plus fréquente
  const retenue = (m: Map<number, Set<string>>): { cote: number; pieces: Set<string> } | null => {
    let best: { cote: number; pieces: Set<string> } | null = null;
    for (const [cote, pieces] of m) if (best === null || pieces.size > best.pieces.size) best = { cote, pieces };
    return best;
  };

  // Toitures RETENUES de tous les corps (triées) : servent d'ancre au sommet ET de PLAFOND dynamique (garde n°3 : la fenêtre d'un
  // corps ne doit jamais atteindre la toiture d'un autre corps).
  const toituresTriees = [...parCorps.values()].map((a) => { const t = a.cotes.get('TOITURE'); const r = t ? retenue(t) : null; return r?.cote; }).filter((c): c is number => c !== undefined).sort((x, y) => x - y);

  const corps: DecisionCorpsNiveaux[] = [];
  let gardeCorpsAttribue: DecisionNiveaux['gardeCorpsAttribue'] = null;

  for (const [repere, a] of [...parCorps.entries()].sort()) {
    // échelle : une cote par label
    const niveaux: NiveauCote[] = [];
    for (const [label, m] of a.cotes) { const r = retenue(m); if (!r) continue; const meta = normLabel(label); if (meta) niveaux.push({ ...meta, cote: r.cote }); }
    niveaux.sort((x, y) => x.cote - y.cote);
    const srcUniq = [...new Map(a.sources.map((s) => [`${s.piece}#${s.page}`, s])).values()];
    const nbPieces = new Set(a.sources.map((s) => s.piece)).size;

    const etages = niveaux.filter((n) => n.nature === 'etage');
    const sousSols = niveaux.filter((n) => n.nature === 'sous_sol');
    const toit = niveaux.find((n) => n.nature === 'toiture') ?? null;
    const plusHautEtage = etages.reduce<NiveauCote | null>((mx, n) => (mx === null || (n.niveau ?? 0) > (mx.niveau ?? 0) ? n : mx), null);

    // plancher = cote du plus haut R0n
    const plancherPieces = plusHautEtage ? a.cotes.get(plusHautEtage.label)! : null;
    const plancher = plusHautEtage && plancherPieces ? { valeur: plusHautEtage.cote, label: plusHautEtage.label, confiance: conf(plancherPieces.get(plusHautEtage.cote)!), sources: srcUniq } : null;

    // nb_etages = nombre de R0n ; tension éventuelle avec le décompte texte
    const fc = floorcountParCorps[repere];
    const tension = plusHautEtage && fc && fc.valeur !== etages.length
      ? `la coupe donne ${etages.length} niveaux R0n (R${String(plusHautEtage.niveau).padStart(2, '0')} ${srcUniq[0]?.piece ?? ''}) ; le décompte texte dit R+${fc.valeur} (${fc.piece}) — sources concordantes chacune, divergentes entre elles`
      : null;
    const nbEtages = etages.length ? { valeur: etages.length, confiance: (nbPieces >= 2 ? 'confirmee' : 'a_verifier') as 'confirmee' | 'a_verifier', sources: srcUniq, tension } : null;
    const nbSousSol = sousSols.length ? { valeur: sousSols.length, confiance: (nbPieces >= 2 ? 'confirmee' : 'a_verifier') as 'confirmee' | 'a_verifier', sources: srcUniq } : null;

    // ── SOMMET par ancrage sur la toiture (N9-D) : acrotère ÉTIQUETÉ dans la fenêtre [toiture ; toiture + FENÊTRE], plafonnée sous
    //    la toiture du corps immédiatement au-dessus. Corroboré (≥2 pièces) → retenu ; sinon toiture. garde-corps TOUJOURS écarté.
    const toitCote = toit?.cote ?? null;
    let sommet: DecisionCorpsNiveaux['sommet'] = null;
    let gardeCorps: { cote: number; pieces: string[] }[] = [];
    if (toitCote !== null) {
      const toitSup = toituresTriees.find((t) => t > toitCote + 1e-9);                                   // toiture voisine juste au-dessus
      const plafond = Math.min(toitCote + SOMMET_FENETRE_M, toitSup !== undefined ? toitSup - 0.01 : Infinity);
      const acros = sommetsFiltres('acrotere', toitCote, plafond);
      const acroCorrobore = acros.find((x) => x.pieces.size >= 2) ?? null;                                // le plus haut ≥2 pièces (déjà trié desc)
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
    }

    corps.push({ repere, niveaux, sources: srcUniq, nbPieces, plancher, nbEtages, nbSousSol, sommet, gardeCorps });
  }

  return { corps, gardeCorpsAttribue };
}
