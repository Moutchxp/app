/**
 * N5-A — MOTEUR D'EXTRACTION des caractéristiques physiques depuis le TEXTE de la GED (rendu page par page par N4 `lireGedPermis`).
 * Fonctions PURES : elles prennent du texte, rendent des CANDIDATS avec leur TRAÇABILITÉ complète (pièce, page, texte brut capté,
 * valeur normalisée). Aucune base, aucun réseau, aucun fichier, AUCUNE écriture, AUCUNE IA. Ce module MESURE ; il ne décide rien.
 *
 * 🔒 CE QUE LE MOTEUR NE FAIT JAMAIS : il ne devine pas la répartition des niveaux entre corps (il ne rattache à AUCUN corps) ; il
 * ne déduit pas une hauteur de sommet depuis un dernier plancher ; il n'interpole ni ne moyenne ; il ne retient pas « le plus
 * probable » — il rend TOUS les candidats avec leur provenance. Si l'attribution d'un niveau est AMBIGUË sur une page, le niveau
 * est laissé à `null` (jamais deviné).
 *
 * ⚠️ LIMITE ASSUMÉE : les motifs sont calés sur UN SEUL échantillon réel (Paris, permis 07512025V0035, dump du 14/08). Les
 * conventions de plans varient d'un cabinet/mairie à l'autre → la couverture sera partielle ailleurs. C'est une MESURE, pas une
 * garantie : le rapport dit honnêtement ce qui est trouvé et ce qui ne l'est pas.
 */
import type { ResultatLectureGed } from './lectureGed';

// ── TABLE DE MOTIFS (source UNIQUE, documentée) ────────────────────────────────
const MOTIFS = {
  // Cote altimétrique : « NGF », « N.G.F », « N.G.F. » (espaces variables), deux-points/`=` optionnels, signe optionnel,
  //   décimale à la virgule ou au point. `g` : plusieurs cotes par page. C'est la donnée la PLUS IMPORTANTE.
  // `(?!\d)` en fin : refuse un entier à 4 chiffres (« NGF 2024 » = une année, pas une cote) ; `\s*` entre signe et nombre.
  coteNgf: /N\.?\s?G\.?\s?F\.?\s*[:=]?\s*([+\-]?\s*\d{1,3}(?:[.,]\d{1,2})?)(?!\d)/gi,
  // Label de niveau, à l'intérieur d'un titre de plan (« PLAN DU NIVEAU R07 », « Plan du Rdc », « Niveau SS1 »).
  niveauTitre: /(?:PLAN\s+DU\s+NIVEAU|PLAN\s+DU|Plan\s+du|NIVEAU)\s+(SS\s?\d|R\.?D\.?C|R\s?\+?\s?0?\d{1,2}|acc[eè]s\s+toiture|toiture|combles?)/gi,
  // Label de niveau ISOLÉ (« SS1 », « R07 », « RDC ») — plus bruité, utilisé seulement si aucun titre.
  niveauIsole: /\b(SS\s?\d|R\.?D\.?C|R\s?0\d{1,2})\b/gi,
  // Gabarit d'un arrêté : EXIGE le contexte « immeuble(s) » à proximité (≤ 60 car.) — un « R+2 » isolé sur un plan est une
  //   ANNOTATION de niveau, PAS un gabarit d'immeuble (sinon 136 faux positifs sur cet échantillon). « immeubles R+5 à R+7 » →
  //   min 5 / max 7 ; « immeuble R+7 » → min=max=7. Le « à » tolère « a », « au », « - », « jusqu'à ». Restreindre le contexte
  //   n'est PAS deviner : c'est écarter un motif qui n'est pas un gabarit.
  gabarit: /immeubles?\b[^.\n]{0,60}?R\s?\+\s?(\d{1,2})(?:\s*(?:à|a|au|-|jusqu['’]?à)\s*R\s?\+\s?(\d{1,2}))?/gi,
  // Sous-sols : « 1 niveau de sous-sol », « 2 niveaux de sous-sol » (chiffre ou nombre écrit simple).
  sousSol: /(\d{1,2}|un|deux|trois)\s+niveaux?\s+de\s+sous[- ]?sol/gi,
  // Repère de corps de bâtiment (cartouche) : « corps A1 », « bâtiment 2D1 », « cage 2D2 ». SIGNAL FAIBLE (cf. rapport).
  repere: /\b(?:corps|b[aâ]timent|cage|bloc)\s+([A-Z]{1,2}\s?\d{1,2}|\d[A-Z]\d?)\b/gi,
} as const;

/** Bornes de PLAUSIBILITÉ d'une cote NGF (m) — cohérentes avec les CHECK d'altitude de N3-B. Hors de là = artefact, écarté. */
const NGF_MIN = -50;
const NGF_MAX = 500;
const MOTS_NOMBRE: Record<string, number> = { un: 1, deux: 2, trois: 3 };

// ── Types de sortie (traçabilité complète) ─────────────────────────────────────
export interface Provenance { pieceId: number; pieceNom: string; page: number }
export interface CandidatCote { texteBrut: string; valeur: number; niveau: string | null; provenance: Provenance }
export interface CandidatGabarit { texteBrut: string; rMin: number | null; rMax: number | null; provenance: Provenance }
export interface CandidatSousSol { texteBrut: string; niveaux: number; provenance: Provenance }
export interface CandidatRepere { texteBrut: string; repere: string; provenance: Provenance }

const nombre = (brut: string): number => Number(brut.replace(',', '.').replace(/\s/g, ''));

/** Normalise un label de niveau : « R7 »/« R 07 »→« R07 », « R.D.C »→« RDC », « SS 1 »→« SS1 », toiture/combles conservés. */
export function normaliserNiveau(brut: string): string {
  const s = brut.trim().replace(/\s+/g, ' ');
  if (/^acc[eè]s\s+toiture$/i.test(s)) return 'accès toiture';
  if (/toiture/i.test(s)) return 'toiture';
  if (/combles?/i.test(s)) return 'combles';
  if (/^R\.?D\.?C$/i.test(s)) return 'RDC';
  const ss = /^SS\s?(\d)$/i.exec(s);
  if (ss) return `SS${ss[1]}`;
  const r = /^R\s?\+?\s?0?(\d{1,2})$/i.exec(s);
  if (r) return `R${r[1].padStart(2, '0')}`;
  return s.toUpperCase();
}

/**
 * COTES NGF d'un texte de page. Rend chaque occurrence (texte brut + valeur normalisée), ÉCARTE les valeurs hors [NGF_MIN,
 * NGF_MAX] (artefacts : un « NGF 2024 » serait une date, pas une cote). Un prix/date/référence SANS « NGF » n'est jamais capté
 * (le motif exige NGF) → pas de faux positif de ce genre.
 */
export function cotesNgfDansTexte(texte: string): { texteBrut: string; valeur: number }[] {
  const out: { texteBrut: string; valeur: number }[] = [];
  for (const m of texte.matchAll(MOTIFS.coteNgf)) {
    const valeur = nombre(m[1]);
    if (!Number.isFinite(valeur) || valeur < NGF_MIN || valeur > NGF_MAX) continue; // hors plausibilité → écarté
    out.push({ texteBrut: m[0].trim(), valeur });
  }
  return out;
}

/**
 * NIVEAU d'une page (le niveau « du plan »), ou `null` si absent OU AMBIGU (plusieurs niveaux distincts → on ne devine pas). On
 * privilégie les labels d'un TITRE de plan (fiables) ; à défaut, un label isolé UNIQUE. Jamais une supposition.
 */
export function niveauDeTexte(texte: string): string | null {
  const titres = new Set<string>();
  for (const m of texte.matchAll(MOTIFS.niveauTitre)) titres.add(normaliserNiveau(m[1]));
  if (titres.size === 1) return [...titres][0];
  if (titres.size > 1) return null; // AMBIGU (plusieurs niveaux dans les titres) → non deviné
  const isoles = new Set<string>();
  for (const m of texte.matchAll(MOTIFS.niveauIsole)) isoles.add(normaliserNiveau(m[1]));
  return isoles.size === 1 ? [...isoles][0] : null; // un seul label isolé → OK ; 0 ou plusieurs → null
}

/** GABARITS R+n d'un texte, dans un contexte « immeuble » (plage « R+5 à R+7 » → min/max ; « R+7 » seul → min=max). Aucune
 *  attribution à un corps de bâtiment (le prompt) : on rapporte le gabarit et sa provenance, rien de plus. */
export function gabaritsDansTexte(texte: string): { texteBrut: string; rMin: number | null; rMax: number | null }[] {
  const out: { texteBrut: string; rMin: number | null; rMax: number | null }[] = [];
  for (const m of texte.matchAll(MOTIFS.gabarit)) {
    const rMin = Number(m[1]);
    const rMax = m[2] !== undefined ? Number(m[2]) : rMin; // pas de « à R+m » → min = max
    out.push({ texteBrut: m[0].trim(), rMin, rMax });
  }
  return out;
}

/** NIVEAUX DE SOUS-SOL d'un texte (« 1 niveau de sous-sol » → 1). Chiffre ou « un/deux/trois ». */
export function sousSolsDansTexte(texte: string): { texteBrut: string; niveaux: number }[] {
  const out: { texteBrut: string; niveaux: number }[] = [];
  for (const m of texte.matchAll(MOTIFS.sousSol)) {
    const brut = m[1].toLowerCase();
    const n = MOTS_NOMBRE[brut] ?? Number(brut);
    if (Number.isFinite(n)) out.push({ texteBrut: m[0].trim(), niveaux: n });
  }
  return out;
}

/** REPÈRES de corps (« corps A1 »…) — SIGNAL FAIBLE et restreint (contexte « corps/bâtiment/cage »), rapporté tel quel. */
export function reperesDansTexte(texte: string): { texteBrut: string; repere: string }[] {
  const out: { texteBrut: string; repere: string }[] = [];
  for (const m of texte.matchAll(MOTIFS.repere)) out.push({ texteBrut: m[0].trim(), repere: m[1].replace(/\s+/g, '').toUpperCase() });
  return out;
}

// ── Bilan / rapport (orchestration sur ResultatLectureGed) ─────────────────────
export interface PieceSansCandidat { pieceId: number; pieceNom: string; motif: 'pas_de_texte' | 'texte_sans_motif' }
export interface RapportExtraction {
  cotes: CandidatCote[];
  gabarits: CandidatGabarit[];
  sousSols: CandidatSousSol[];
  reperes: CandidatRepere[];
  bilan: {
    nbPieces: number;
    piecesAvecCote: number;
    pagesAvecCote: number;
    nbCotes: number;
    coteMax: CandidatCote | null;                 // la plus haute, avec sa provenance
    niveaux: { niveau: string; cotes: { valeur: number; provenance: Provenance }[] }[]; // niveaux reconnus + leurs cotes
    piecesSansCandidat: PieceSansCandidat[];       // « pas de texte » vs « texte sans motif reconnu » — DISTINGUÉS
  };
}

/**
 * Applique tous les détecteurs à un `ResultatLectureGed` (N4). Pour chaque page : cotes NGF, niveau de la page (associé aux cotes,
 * ou null), gabarits, sous-sols, repères — chacun avec sa provenance (pièce, page, texte brut). Une pièce sans AUCUN candidat est
 * classée « pas_de_texte » (muette) ou « texte_sans_motif ». MESURE PURE, aucune écriture.
 */
export function extraireCandidats(res: ResultatLectureGed): RapportExtraction {
  const cotes: CandidatCote[] = [];
  const gabarits: CandidatGabarit[] = [];
  const sousSols: CandidatSousSol[] = [];
  const reperes: CandidatRepere[] = [];
  const piecesSansCandidat: PieceSansCandidat[] = [];
  const pagesAvecCote = new Set<string>();
  const piecesAvecCote = new Set<number>();

  for (const p of res.pieces) {
    let candidatsPiece = 0;
    for (const pg of p.pages) {
      if (!pg.aTexte) continue;
      const prov = (page: number): Provenance => ({ pieceId: p.id, pieceNom: p.nomFichier, page });
      const niveau = niveauDeTexte(pg.texte);
      for (const c of cotesNgfDansTexte(pg.texte)) {
        cotes.push({ texteBrut: c.texteBrut, valeur: c.valeur, niveau, provenance: prov(pg.page) });
        pagesAvecCote.add(`${p.id}:${pg.page}`); piecesAvecCote.add(p.id); candidatsPiece += 1;
      }
      for (const g of gabaritsDansTexte(pg.texte)) { gabarits.push({ ...g, provenance: prov(pg.page) }); candidatsPiece += 1; }
      for (const s of sousSolsDansTexte(pg.texte)) { sousSols.push({ ...s, provenance: prov(pg.page) }); candidatsPiece += 1; }
      for (const r of reperesDansTexte(pg.texte)) { reperes.push({ ...r, provenance: prov(pg.page) }); candidatsPiece += 1; }
    }
    if (candidatsPiece === 0) {
      piecesSansCandidat.push({ pieceId: p.id, pieceNom: p.nomFichier, motif: p.muette ? 'pas_de_texte' : 'texte_sans_motif' });
    }
  }

  // Cote la plus haute (avec provenance) — jamais une moyenne : la valeur RÉELLE la plus élevée.
  const coteMax = cotes.reduce<CandidatCote | null>((max, c) => (max === null || c.valeur > max.valeur ? c : max), null);
  // Niveaux reconnus → leurs cotes (seulement les cotes dont le niveau a été identifié ; ordre d'apparition).
  const parNiveau = new Map<string, { valeur: number; provenance: Provenance }[]>();
  for (const c of cotes) {
    if (c.niveau === null) continue;
    (parNiveau.get(c.niveau) ?? parNiveau.set(c.niveau, []).get(c.niveau)!).push({ valeur: c.valeur, provenance: c.provenance });
  }

  return {
    cotes, gabarits, sousSols, reperes,
    bilan: {
      nbPieces: res.pieces.length,
      piecesAvecCote: piecesAvecCote.size,
      pagesAvecCote: pagesAvecCote.size,
      nbCotes: cotes.length,
      coteMax,
      niveaux: [...parNiveau.entries()].map(([niveau, cts]) => ({ niveau, cotes: cts })),
      piecesSansCandidat,
    },
  };
}
