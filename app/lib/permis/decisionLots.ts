/**
 * N8-B — DÉCISION PURE des faits ÉNONCÉS par lot, dérivés du TEXTE de la GED (N4) + des candidats (N5-A). Aucune base, aucune
 * écriture, aucune IA, aucune géométrie. On n'écrit QUE ce que le document ÉNONCE ; on distingue FAIT ÉNONCÉ (corroboré) et
 * INFÉRENCE par chaînage (à vérifier + motif). Voie (b) arbitrée en N8-A : seul l'énoncé s'écrit sur un lot.
 *
 * - nb_etages ← « Lot 2D<n> en R+<m> » (fait énoncé ; corroboré si ≥2 pièces).
 * - nb_niveaux_sous_sol ← un plan de sous-sol PAR lot (« … SS1 … 2D<n> PLN … ») → 1 (le partage commun/séparé n'est pas dit).
 * - altitude_dernier_plancher_ngf : SEULEMENT pour le lot au R+n le plus haut, par CHAÎNAGE (R0<m>=cote énoncé ; R+m=lot énoncé) →
 *   à vérifier + motif. Les autres lots : non écrit (motif).
 * - altitude_sommet_ngf (max acrotère) : NON rattaché à un lot (attribution close P4/P5) → niveau PERMIS, réserve enrichie.
 */
import type { ResultatLectureGed } from './lectureGed';
import type { RapportExtraction } from './extractionCaracteristiques';
import { cotesSommetPrioritaires } from './decisionSommet'; // LECT-1 (B) : priorité sommet faîtage>acrotère>égout (source unique)

export interface SourceFait { piece: string; page: number; extrait: string }
export interface FaitCorrobore { valeur: number; confiance: 'confirmee' | 'a_verifier'; sources: SourceFait[]; note?: string }
export interface FaitInfere { valeur: number; confiance: 'a_verifier'; motif: string; sources: SourceFait[] }
export interface DecisionLot {
  repere: string;
  nbEtages: FaitCorrobore | null;
  nbSousSol: FaitCorrobore | null;
  plancher: FaitInfere | null;            // seulement le lot le plus haut ; sinon motif de non-écriture
  plancherMotif: string | null;           // si non écrit
  sommetMotif: string;                    // motif de « sommet vide » sur le lot
}
export interface DecisionLots {
  lots: DecisionLot[];
  sommetPermis: { valeur: number; reserve: string; source: SourceFait } | null;
}

export const RESERVE_SOMMET_PERMIS =
  'la cote la plus haute des planches peut appartenir à un bâtiment voisin ; haut de la superstructure de toiture (édicule ascenseur, local technique CVC/PAC, toiture ENR végétalisée ; toiture cotée +86,11) — non rattaché à un bâtiment';
const MOTIF_SOMMET_LOT = 'attribution par lot non établie (P4/P5)';

const extrait = (t: string, i: number, a = 55) => t.slice(Math.max(0, i - a), i + a).replace(/\s+/g, ' ').trim();
const corrobore = (sources: SourceFait[]): 'confirmee' | 'a_verifier' => (new Set(sources.map((s) => s.piece)).size >= 2 ? 'confirmee' : 'a_verifier');

/** Décide les faits par lot + le sommet permis. Pur. */
export function decisionLots(ged: ResultatLectureGed, rapport: RapportExtraction): DecisionLots {
  // 1) nb_etages : « Lot 2D<n> en R+<m> »
  const etages = new Map<string, { m: number; sources: SourceFait[] }>();
  const sousSol = new Map<string, SourceFait[]>();
  for (const p of ged.pieces) for (const pg of p.pages) {
    if (!pg.aTexte) continue;
    for (const mm of pg.texte.matchAll(/(?:lot\s+)?2D(\d)\s+en\s+R\s?\+\s?(\d{1,2})/gi)) {
      const lot = `2D${mm[1]}`; const m = Number(mm[2]);
      const e = etages.get(lot) ?? { m, sources: [] }; e.m = m; e.sources.push({ piece: p.nomFichier, page: pg.page, extrait: extrait(pg.texte, mm.index ?? 0) }); etages.set(lot, e);
    }
    // sous-sol par lot : « …SS1… 2D<n> PLN… » ou « …2D<n>… PLN SS… »
    for (const mm of pg.texte.matchAll(/(?:sous[- ]?sol|\bSS1\b)[^.\n]{0,70}?2D(\d)\s+PLN|2D(\d)\s+PLN\s+(?:SI[- ]?)?SS/gi)) {
      const lot = `2D${mm[1] ?? mm[2]}`; (sousSol.get(lot) ?? sousSol.set(lot, []).get(lot)!).push({ piece: p.nomFichier, page: pg.page, extrait: extrait(pg.texte, mm.index ?? 0) });
    }
  }

  // 2) plancher du lot le plus haut, par chaînage R0<m>=cote (niveau à cote unique) + R+m=lot.
  const niveauCote = new Map<number, { valeur: number; source: SourceFait }>();
  for (const n of rapport.bilan.niveaux) { const g = /^R0?(\d{1,2})$/.exec(n.niveau); if (!g) continue; const d = new Set(n.cotes.map((c) => c.valeur)); if (d.size === 1) { const c = n.cotes[0]; niveauCote.set(Number(g[1]), { valeur: c.valeur, source: { piece: c.provenance.pieceNom, page: c.provenance.page, extrait: `${n.niveau} = ${c.valeur}` } }); } }
  const lotHaut = [...etages.entries()].sort((a, b) => b[1].m - a[1].m)[0]; // lot au R+n max

  // 3) sommet permis = MAX du qualificatif prioritaire présent (faîtage > acrotère > égout — LECT-1 (B), source unique decisionSommet).
  const sommetSel = cotesSommetPrioritaires(rapport.cotes)?.cotes ?? [];
  const sommetCote = sommetSel.reduce<typeof sommetSel[number] | null>((mx, c) => (mx === null || c.valeur > mx.valeur ? c : mx), null);

  const repos = [...new Set([...etages.keys(), ...sousSol.keys()])].sort();
  const lots: DecisionLot[] = repos.map((repere) => {
    const et = etages.get(repere);
    const ss = sousSol.get(repere);
    const estHaut = lotHaut && lotHaut[0] === repere;
    const nc = et ? niveauCote.get(et.m) : undefined;
    const plancher: FaitInfere | null = estHaut && et && nc
      ? { valeur: nc.valeur, confiance: 'a_verifier', motif: `R0${et.m} = ${nc.valeur} énoncé (${nc.source.piece.slice(0, 14)}) ; R+${et.m} = ${repere} énoncé ; aucune pièce n'écrit le rattachement`, sources: [nc.source, ...(et.sources.slice(0, 1))] }
      : null;
    return {
      repere,
      nbEtages: et ? { valeur: et.m, confiance: corrobore(et.sources), sources: et.sources } : null,
      nbSousSol: ss ? { valeur: 1, confiance: corrobore(ss), sources: ss, note: 'partage commun/séparé non déterminé' } : null,
      plancher,
      plancherMotif: !estHaut && et ? `plancher R+${et.m} de ${repere} non libellé par lot dans une pièce` : null,
      sommetMotif: MOTIF_SOMMET_LOT,
    };
  });

  return {
    lots,
    sommetPermis: sommetCote ? { valeur: sommetCote.valeur, reserve: RESERVE_SOMMET_PERMIS, source: { piece: sommetCote.provenance.pieceNom, page: sommetCote.provenance.page, extrait: sommetCote.texteBrut } } : null,
  };
}
