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
  sommet: (FaitCorrobore & { qualif: 'acrotere' | 'toiture'; label: string; note: string | null }) | null;
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
interface SommetPage { repere: string; cote: number; qualif: 'acrotere' | 'garde-corps'; forme: FormeAncrage }

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

/** Analyse UNE page : ancres bâtiment (BAT/LOT/PLN), tables de niveaux (bloc + inline), cotes de sommet qualifiées (acrotère/garde-corps) par NVP. */
function analyserPage(texte: string): { tables: TablePage[]; sommets: SommetPage[] } {
  const titres = ancresPage(texte);
  if (!titres.length) return { tables: [], sommets: [] };

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

  // ── Sommet : SEULEMENT sur une page ancrée par « BAT » (coupe). L'appariement cote↔étiquette par NVP est fiable sur les coupes,
  //    mais AMBIGU sur les plans/élévations chargés (une même valeur NVP y côtoie acrotère ET garde-corps → glissement). On ne laisse
  //    donc PAS les pages LOT/PLN alimenter le sommet ; elles ne corroborent que les TABLES de niveaux (fiables). Cf. N9-C : sans ce
  //    garde-fou, 87,13 est étiqueté garde-corps sur des pages LOT et le sommet se dégrade. Les tables, elles, profitent des pages LOT.
  if (titres[0].forme !== 'bat') return { tables: tables.map(({ repere, niveaux, forme }) => ({ repere, niveaux, forme })), sommets: [] };
  const nvpQualif = new Map<string, 'acrotere' | 'garde-corps'>();
  const clef = (v: number) => v.toFixed(2);
  const QUALIF = String.raw`Acrot[eè]re|Garde-corps(?:\s+[àa]\s+lisse)?|Fa[iî]tage`;
  const typeQualif = (s: string): 'acrotere' | 'garde-corps' => (/garde/i.test(s) ? 'garde-corps' : 'acrotere');
  for (const m of texte.matchAll(new RegExp(String.raw`(${QUALIF})\s+NVP\s+(\d+(?:[.,]\d+)?)`, 'gi'))) nvpQualif.set(clef(num(m[2])), typeQualif(m[1]));
  for (const m of texte.matchAll(new RegExp(String.raw`NVP\s+(\d+(?:[.,]\d+)?)\s+(${QUALIF})`, 'gi'))) nvpQualif.set(clef(num(m[1])), typeQualif(m[2]));

  const sommets: SommetPage[] = [];
  for (const m of texte.matchAll(/(?:NGF\s*)?\+\s?(\d+[.,]\d+)(?:\s*m)?\s*NGF|NGF\s*\+\s?(\d+[.,]\d+)/gi)) {
    const cote = num(m[1] ?? m[2]);
    // NVP appariée = valeur du dictionnaire la plus proche sous la cote (δ ∈ [0,05 ; 0,6])
    let best: { q: 'acrotere' | 'garde-corps'; d: number } | null = null;
    for (const [k, q] of nvpQualif) { const d = cote - num(k); if (d >= 0.05 && d <= 0.6 && (best === null || d < best.d)) best = { q, d }; }
    if (best) { const a = ancreLaPlusProche(titres, m.index ?? 0) ?? titres[0]; sommets.push({ repere: a.repere, forme: a.forme, cote, qualif: best.q }); }
  }
  return { tables: tables.map(({ repere, niveaux, forme }) => ({ repere, niveaux, forme })), sommets };
}

/**
 * Décide les caractéristiques par corps depuis les tableaux de niveaux de la GED. `floorcountParCorps` (optionnel, ex. issu de
 * decisionLots « Lot 2D<n> en R+<m> ») sert UNIQUEMENT à signaler une tension avec le décompte texte — jamais à choisir en silence.
 */
export function decisionNiveaux(ged: ResultatLectureGed, floorcountParCorps: Record<string, { valeur: number; piece: string }> = {}): DecisionNiveaux {
  // 1) rassembler, par corps, toutes les (label → cote) vues, avec leurs pièces/pages
  interface Acc { cotes: Map<string, Map<number, Set<string>>>; sources: SourceRef[]; sommets: Map<string, Map<number, Set<string>>> }
  const parCorps = new Map<string, Acc>();
  const acc = (r: string) => { let a = parCorps.get(r); if (!a) { a = { cotes: new Map(), sources: [], sommets: new Map() }; parCorps.set(r, a); } return a; };

  for (const p of ged.pieces) for (const pg of p.pages) {
    if (!pg.aTexte) continue;
    const { tables, sommets } = analyserPage(pg.texte);
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
    for (const s of sommets) {
      const a = acc(s.repere);
      const parQ = a.sommets.get(s.qualif) ?? a.sommets.set(s.qualif, new Map()).get(s.qualif)!;
      (parQ.get(s.cote) ?? (parQ.set(s.cote, new Set()), parQ.get(s.cote)!)).add(p.nomFichier);
    }
  }

  const conf = (pieces: Set<string>): 'confirmee' | 'a_verifier' => (pieces.size >= 2 ? 'confirmee' : 'a_verifier');
  // valeur RETENUE d'un label = la cote la plus corroborée (nb de pièces), départage par la plus fréquente
  const retenue = (m: Map<number, Set<string>>): { cote: number; pieces: Set<string> } | null => {
    let best: { cote: number; pieces: Set<string> } | null = null;
    for (const [cote, pieces] of m) if (best === null || pieces.size > best.pieces.size) best = { cote, pieces };
    return best;
  };

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

    // sommet = acrotère CORROBORÉ au-dessus de la toiture, sinon toiture. garde-corps toujours écarté.
    const acroMap = a.sommets.get('acrotere') ?? new Map<number, Set<string>>();
    const gcMap = a.sommets.get('garde-corps') ?? new Map<number, Set<string>>();
    const toitCote = toit?.cote ?? null;
    const acroAudessus = [...acroMap.entries()].filter(([cote]) => toitCote === null || cote >= toitCote - 0.005);
    const acroCorrobore = acroAudessus.filter(([, pieces]) => pieces.size >= 2).sort((x, y) => y[0] - x[0])[0] ?? null;
    const acroUnique = acroAudessus.filter(([, pieces]) => pieces.size < 2).sort((x, y) => y[0] - x[0])[0] ?? null;

    let sommet: DecisionCorpsNiveaux['sommet'] = null;
    if (acroCorrobore) {
      sommet = { valeur: acroCorrobore[0], confiance: 'confirmee', qualif: 'acrotere', label: 'Acrotère', sources: srcUniq, note: null };
    } else if (toit) {
      const note = acroUnique ? `acrotère ${acroUnique[0]} vu sur 1 pièce seulement (non corroboré) → non retenu ; toiture retenue` : 'aucun acrotère au-dessus de la toiture → toiture retenue';
      sommet = { valeur: toit.cote, confiance: conf(a.cotes.get('TOITURE')?.get(toit.cote) ?? new Set()), qualif: 'toiture', label: 'TOITURE', note, sources: srcUniq };
    }

    const gardeCorps = [...gcMap.entries()].filter(([cote]) => toitCote === null || cote >= toitCote - 0.005).map(([cote, pieces]) => ({ cote, pieces: [...pieces] })).sort((x, y) => y.cote - x.cote);
    // le garde-corps le plus haut du projet devient l'attribution du sommet permis N8-B (89,46)
    for (const g of gardeCorps) if (!gardeCorpsAttribue || g.cote > gardeCorpsAttribue.cote) gardeCorpsAttribue = { cote: g.cote, repere };

    corps.push({ repere, niveaux, sources: srcUniq, nbPieces, plancher, nbEtages, nbSousSol, sommet, gardeCorps });
  }

  return { corps, gardeCorpsAttribue };
}
