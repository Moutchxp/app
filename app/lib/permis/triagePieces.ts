/**
 * N7-A — TRIAGE DÉTERMINISTE des pages à faire lire VISUELLEMENT. Fonctions PURES : entrée = ce que rendent déjà `lireGedPermis`
 * (N4) et `extraireCandidats` (N5-A), sortie = un PLAN DE LECTURE typé. Ce module NE LIT PAS les pages (aucune IA, aucun réseau,
 * aucune écriture) : il DÉSIGNE, de façon reproductible, les pages qui mériteraient un œil humain (les deux questions hors de
 * portée du texte : projet vs voisin, et attribution d'une cote à un lot — cf. N5-F).
 *
 * 🔒 RÈGLES (arbitrées) :
 * - EXCLUSION d'abord, toujours journalisée (avec sa PORTÉE) : par NOM de fichier → portée PIÈCE ; par MARQUEUR d'identité du
 *   demandeur → portée PAGE. Ce qui porte nom/adresse/signature du demandeur ne doit JAMAIS sortir dans un plan de lecture.
 * - SÉLECTION par priorité : R1 cote_qualifiee > R2 planche_multi_corps > R3 planche_muette. Une page ne figure qu'UNE fois.
 * - PLAFOND PAR PIÈCE (PLAFOND_PAGES_PAR_PIECE) appliqué à R2/R3 SEULEMENT : une seule pièce ne peut pas manger tout le budget.
 *   R1 n'est JAMAIS plafonné (une cote qualifiée passe toujours). Les pages écartées par ce plafond ont un motif DISTINCT de la
 *   troncature globale.
 * - PLAFOND GLOBAL (PLAFOND_PAGES_TRIAGE) : au-delà, on garde par priorité puis ordre naturel, `tronque=true`, et ce qui saute est
 *   journalisé (jamais de troncature silencieuse).
 *
 * ⚠️ R2 'planche_multi_corps' NE CAPTE PAS les vues aériennes par lot. Mesuré (N5-F/N7-A) : ces vues (ex. C_A2 p.14/16) ne sont
 * PAS des pages muettes (l'extracteur en tire du texte) et AUCUN signal textuel ne les isole. R2 capte les pages muettes d'une
 * pièce citant ≥2 repères de corps — typiquement un PLAN DE MASSE muet (l'emprise des bâtiments y est dessinée, précisément ce
 * qui manque pour attribuer une cote à un lot). Que personne ne croie que le problème d'attribution est résolu par cette règle :
 * les vues par lot seront prises explicitement par la lecture visuelle, pas par un critère texte.
 *
 * ⚠️ Le détecteur de repères de corps est ÉLARGI ici (formes « 2D1 »/« 2D2 » nues, « LOT/Lot/lot 2Dx », « Bâtiment 2Dx »…) : le
 * `reperesDansTexte` existant ne voit que « BATIMENT 2Dx » et rate la majorité des formes. On n'élargit QUE dans ce module.
 */
import type { ResultatLectureGed } from './lectureGed';
import type { RapportExtraction } from './extractionCaracteristiques';

/** Plafond GLOBAL de pages dans un plan de lecture. Constante exportée (pilotable). */
export const PLAFOND_PAGES_TRIAGE = 20;
/** Plafond PAR PIÈCE, appliqué à R2/R3 seulement (jamais R1). Empêche une seule pièce de manger tout le budget. */
export const PLAFOND_PAGES_PAR_PIECE = 5;

export type RegleSelection = 'cote_qualifiee' | 'planche_multi_corps' | 'planche_muette';
/** Priorité : plus petit = plus prioritaire. */
const PRIORITE: Record<RegleSelection, number> = { cote_qualifiee: 1, planche_multi_corps: 2, planche_muette: 3 };
/** Qualificatifs de sommet retenus pour R1 (page « à cote qualifiée »). */
const QUALIFS_R1 = new Set(['acrotère', 'faîtage', 'édicule', 'local technique']);

export interface PageRetenue { piece: string; page: number; regle: RegleSelection; priorite: number; indice: string }
/** Portée d'une exclusion : 'piece' (par nom, toute la pièce) ou 'page' (par marqueur, la page seule). */
export interface Exclusion { piece: string; page?: number; portee: 'piece' | 'page'; motif: string }
export interface PlanLecture {
  dossierId: number; totalPages: number; totalPieces: number;
  pages: PageRetenue[]; exclusions: Exclusion[]; tronque: boolean; plafond: number;
}

const MOTIF_EXCLUSION = 'porte nom, adresse et signature du demandeur ; ne doit jamais sortir dans un plan de lecture';

const sansAccent = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’‘]/g, "'").toLowerCase();
// EXCLUSION par NOM de fichier → portée PIÈCE (insensible casse/accents).
const NOMS_EXCLUS = ['cerfa', 'arrete', 'courrier', 'lettre', 'attestation', 'pouvoir', 'mandat', 'declaration', 'notice', 'rib'];
// Frontière « lettres seulement » : « _ », chiffres, espaces et « . » séparent (« Cerfa_13409.pdf » doit matcher « cerfa »),
// mais « predeclaration » ou « distribution » ne matchent pas (lettre adjacente).
const RE_NOM_EXCLU = new RegExp(`(?<![a-z])(${NOMS_EXCLUS.join('|')})(?![a-z])`);
// EXCLUSION par MARQUEUR → portée PAGE (déjà désaccentués/minuscules). Ce qu'on protège = l'identité du DEMANDEUR.
// Marqueurs AUTONOMES (suffisent seuls) :
const MARQUEURS_AUTONOMES = ['je soussigne', 'signature du demandeur', 'nom et prenom'];
// « siret » n'exclut QUE s'il co-occurre, sur la MÊME page, avec un contexte demandeur (un SIRET de cartouche d'architecte
// n'est pas la donnée protégée) :
const CONTEXTE_DEMANDEUR = ['je soussigne', 'demandeur', 'nom et prenom', "maitre d'ouvrage"];
/** Marqueur d'identité du demandeur sur une page (texte déjà normalisé), ou `null`. */
function marqueurDemandeur(texteNormalise: string): string | null {
  const auto = MARQUEURS_AUTONOMES.find((m) => texteNormalise.includes(m));
  if (auto) return `« ${auto} »`;
  if (texteNormalise.includes('siret') && CONTEXTE_DEMANDEUR.some((c) => texteNormalise.includes(c))) return '« siret » + contexte demandeur';
  return null;
}

// Détecteur de repères ÉLARGI (interne à ce module).
const RE_LOT = /\b2D(\d)\b/gi;
const RE_CORPS_KW = /(?:b[aâ]timent|lots?|corps|cage|bloc)\s+([A-Za-z]{1,2}\s?\d{1,2}|\d[A-Za-z]\d?)\b/gi;
function reperesDeTexte(texte: string): Set<string> {
  const s = new Set<string>();
  for (const m of texte.matchAll(RE_LOT)) s.add('2D' + m[1]);
  for (const m of texte.matchAll(RE_CORPS_KW)) s.add(m[1].replace(/\s+/g, '').toUpperCase());
  return s;
}

/**
 * Produit le plan de lecture d'un permis. PUR et déterministe. `plafond` = plafond GLOBAL (défaut `PLAFOND_PAGES_TRIAGE`) ;
 * `plafondParPiece` = plafond PAR PIÈCE sur R2/R3 (défaut `PLAFOND_PAGES_PAR_PIECE`).
 */
export function trierPieces(ged: ResultatLectureGed, rapport: RapportExtraction, plafond: number = PLAFOND_PAGES_TRIAGE, plafondParPiece: number = PLAFOND_PAGES_PAR_PIECE): PlanLecture {
  // Index du rapport : cotes qualifiées R1 par (pièce, page) ; pièces portant au moins une cote NGF.
  const qualifParPage = new Map<string, { valeur: number; qualif: string }[]>();
  const piecesAvecNgf = new Set<number>();
  for (const c of rapport.cotes) {
    piecesAvecNgf.add(c.provenance.pieceId);
    if (c.qualificatifSommet && QUALIFS_R1.has(c.qualificatifSommet)) {
      const k = `${c.provenance.pieceId}:${c.provenance.page}`;
      (qualifParPage.get(k) ?? qualifParPage.set(k, []).get(k)!).push({ valeur: c.valeur, qualif: c.qualificatifSommet });
    }
  }

  const exclusions: Exclusion[] = [];
  const retenues: PageRetenue[] = [];

  for (const p of ged.pieces) {
    // EXCLUSION par NOM = portée PIÈCE, AVANT toute sélection : la pièce entière est écartée et journalisée.
    const nomExclu = RE_NOM_EXCLU.exec(sansAccent(p.nomFichier));
    if (nomExclu) { exclusions.push({ piece: p.nomFichier, portee: 'piece', motif: `pièce exclue (nom « ${nomExclu[1]} ») : ${MOTIF_EXCLUSION}` }); continue; }

    const reperes = new Set<string>();
    for (const pg of p.pages) for (const x of reperesDeTexte(pg.texte)) reperes.add(x);
    const multiRepere = reperes.size >= 2;
    const pieceAvecNgf = piecesAvecNgf.has(p.id);

    for (const pg of p.pages) {
      // EXCLUSION par MARQUEUR = portée PAGE : seule la page marquée est écartée, les autres restent éligibles.
      const marqueur = marqueurDemandeur(sansAccent(pg.texte));
      if (marqueur) { exclusions.push({ piece: p.nomFichier, page: pg.page, portee: 'page', motif: `page exclue (marqueur ${marqueur}) : ${MOTIF_EXCLUSION}` }); continue; }

      const qs = qualifParPage.get(`${p.id}:${pg.page}`);
      if (qs && qs.length > 0) {
        const valeurs = [...new Set(qs.map((x) => x.valeur))].sort((a, b) => a - b);
        const quals = [...new Set(qs.map((x) => x.qualif))].join('/');
        retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'cote_qualifiee', priorite: PRIORITE.cote_qualifiee, indice: `${quals} : ${valeurs.join(', ')}` });
      } else if (!pg.aTexte) {
        if (multiRepere) retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'planche_multi_corps', priorite: PRIORITE.planche_multi_corps, indice: `repères pièce : {${[...reperes].sort().join(', ')}}` });
        else if (pieceAvecNgf) retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'planche_muette', priorite: PRIORITE.planche_muette, indice: 'planche muette d’une pièce portant des cotes NGF' });
      }
    }
  }

  // PLAFOND PAR PIÈCE (R2/R3 seulement) : R1 passe toujours. Par pièce, on garde les N premières pages muettes (ordre naturel),
  // les autres sont écartées avec un motif DISTINCT de la troncature globale.
  const retenuesR1 = retenues.filter((r) => r.regle === 'cote_qualifiee');
  const muettesParPiece = new Map<string, PageRetenue[]>();
  for (const r of retenues) if (r.regle !== 'cote_qualifiee') (muettesParPiece.get(r.piece) ?? muettesParPiece.set(r.piece, []).get(r.piece)!).push(r);
  const muettesGardees: PageRetenue[] = [];
  for (const grp of muettesParPiece.values()) {
    grp.sort((a, b) => a.page - b.page);
    muettesGardees.push(...grp.slice(0, plafondParPiece));
    for (const d of grp.slice(plafondParPiece)) exclusions.push({ piece: d.piece, page: d.page, portee: 'page', motif: `écartée par plafond PAR PIÈCE (${plafondParPiece}) : cette pièce fournit trop de planches muettes (règle ${d.regle})` });
  }

  // Tri par priorité puis ordre naturel (pièce, page) — déterministe.
  const candidats = [...retenuesR1, ...muettesGardees].sort((a, b) => a.priorite - b.priorite || a.piece.localeCompare(b.piece) || a.page - b.page);
  const tronque = candidats.length > plafond;
  const pages = tronque ? candidats.slice(0, plafond) : candidats;
  if (tronque) for (const d of candidats.slice(plafond)) exclusions.push({ piece: d.piece, page: d.page, portee: 'page', motif: `écartée par plafond GLOBAL (${plafond}) : budget total atteint (règle ${d.regle})` });

  return { dossierId: ged.dossierId, totalPages: ged.bilan.nbPages, totalPieces: ged.bilan.nbPieces, pages, exclusions, tronque, plafond };
}
