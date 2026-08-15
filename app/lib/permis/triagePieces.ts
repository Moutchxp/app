/**
 * N7-A — TRIAGE DÉTERMINISTE des pages à faire lire VISUELLEMENT. Fonctions PURES : entrée = ce que rendent déjà `lireGedPermis`
 * (N4) et `extraireCandidats` (N5-A), sortie = un PLAN DE LECTURE typé. Ce module NE LIT PAS les pages (aucune IA, aucun réseau,
 * aucune écriture) : il DÉSIGNE, de façon reproductible, les pages qui mériteraient un œil humain (les deux questions hors de
 * portée du texte : projet vs voisin, et attribution d'une cote à un lot — cf. N5-F).
 *
 * 🔒 RÈGLES (arbitrées) :
 * - EXCLUSION d'abord, toujours journalisée : une pièce qui porte nom/adresse/signature du demandeur ne doit JAMAIS figurer dans
 *   un plan destiné à sortir de la machine → exclue EN ENTIER (par NOM de fichier, ou par MARQUEUR de texte).
 * - SÉLECTION par priorité : R1 cote_qualifiee > R2 vue_par_lot > R3 planche_muette. Une page ne figure qu'UNE fois, avec la
 *   règle la plus prioritaire.
 * - PLAFOND (PLAFOND_PAGES_TRIAGE) : au-delà, on garde par priorité puis ordre naturel, `tronque=true`, et ce qui saute est
 *   journalisé (jamais de troncature silencieuse).
 *
 * ⚠️ Le détecteur de repères de corps est ÉLARGI ici (formes « 2D1 »/« 2D2 » nues, « LOT/Lot/lot 2Dx », « Bâtiment 2Dx »…) : le
 * `reperesDansTexte` existant ne voit que « BATIMENT 2Dx » et rate la majorité des formes. On n'élargit QUE dans ce module.
 */
import type { ResultatLectureGed } from './lectureGed';
import type { RapportExtraction } from './extractionCaracteristiques';

/** Plafond de pages dans un plan de lecture. Constante exportée (pilotable). */
export const PLAFOND_PAGES_TRIAGE = 20;

export type RegleSelection = 'cote_qualifiee' | 'vue_par_lot' | 'planche_muette';
/** Priorité : plus petit = plus prioritaire. */
const PRIORITE: Record<RegleSelection, number> = { cote_qualifiee: 1, vue_par_lot: 2, planche_muette: 3 };
/** Qualificatifs de sommet retenus pour R1 (page « à cote qualifiée »). */
const QUALIFS_R1 = new Set(['acrotère', 'faîtage', 'édicule', 'local technique']);

export interface PageRetenue { piece: string; page: number; regle: RegleSelection; priorite: number; indice: string }
export interface Exclusion { piece: string; page?: number; motif: string }
export interface PlanLecture {
  dossierId: number; totalPages: number; totalPieces: number;
  pages: PageRetenue[]; exclusions: Exclusion[]; tronque: boolean; plafond: number;
}

const MOTIF_EXCLUSION = 'porte nom, adresse et signature du demandeur ; ne doit jamais sortir dans un plan de lecture';

const sansAccent = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// Exclusion par NOM de fichier (insensible casse/accents).
const NOMS_EXCLUS = ['cerfa', 'arrete', 'courrier', 'lettre', 'attestation', 'pouvoir', 'mandat', 'declaration', 'notice', 'rib'];
// Frontière « lettres seulement » : « _ », chiffres, espaces et « . » séparent (« Cerfa_13409.pdf » doit matcher « cerfa »),
// mais « predeclaration » ou « distribution » ne matchent pas (lettre adjacente).
const RE_NOM_EXCLU = new RegExp(`(?<![a-z])(${NOMS_EXCLUS.join('|')})(?![a-z])`);
// Exclusion par MARQUEUR de texte (déjà désaccentués/minuscules).
const MARQUEURS = ['je soussigne', 'signature du demandeur', 'nom et prenom', 'siret', 'n° de securite'];

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
 * Produit le plan de lecture d'un permis. PUR et déterministe. `plafond` par défaut = `PLAFOND_PAGES_TRIAGE`.
 */
export function trierPieces(ged: ResultatLectureGed, rapport: RapportExtraction, plafond: number = PLAFOND_PAGES_TRIAGE): PlanLecture {
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
    // EXCLUSION AVANT toute sélection, toujours journalisée. Pièce exclue = en entier.
    const nomExclu = RE_NOM_EXCLU.exec(sansAccent(p.nomFichier));
    if (nomExclu) { exclusions.push({ piece: p.nomFichier, motif: `exclue (nom « ${nomExclu[1]} ») : ${MOTIF_EXCLUSION}` }); continue; }
    const marqueur = p.pages.map((pg) => sansAccent(pg.texte)).flatMap((t) => MARQUEURS.filter((m) => t.includes(m)))[0];
    if (marqueur) { exclusions.push({ piece: p.nomFichier, motif: `exclue (marqueur « ${marqueur} ») : ${MOTIF_EXCLUSION}` }); continue; }

    const reperes = new Set<string>();
    for (const pg of p.pages) for (const x of reperesDeTexte(pg.texte)) reperes.add(x);
    const multiRepere = reperes.size >= 2;
    const pieceAvecNgf = piecesAvecNgf.has(p.id);

    for (const pg of p.pages) {
      const qs = qualifParPage.get(`${p.id}:${pg.page}`);
      if (qs && qs.length > 0) {
        const valeurs = [...new Set(qs.map((x) => x.valeur))].sort((a, b) => a - b);
        const quals = [...new Set(qs.map((x) => x.qualif))].join('/');
        retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'cote_qualifiee', priorite: PRIORITE.cote_qualifiee, indice: `${quals} : ${valeurs.join(', ')}` });
      } else if (!pg.aTexte) {
        if (multiRepere) retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'vue_par_lot', priorite: PRIORITE.vue_par_lot, indice: `repères pièce : {${[...reperes].sort().join(', ')}}` });
        else if (pieceAvecNgf) retenues.push({ piece: p.nomFichier, page: pg.page, regle: 'planche_muette', priorite: PRIORITE.planche_muette, indice: 'planche muette d’une pièce portant des cotes NGF' });
      }
    }
  }

  // Tri par priorité puis ordre naturel (pièce, page) — déterministe.
  retenues.sort((a, b) => a.priorite - b.priorite || a.piece.localeCompare(b.piece) || a.page - b.page);
  const tronque = retenues.length > plafond;
  const pages = tronque ? retenues.slice(0, plafond) : retenues;
  if (tronque) for (const d of retenues.slice(plafond)) exclusions.push({ piece: d.piece, page: d.page, motif: `écartée par plafond (${plafond}) : règle ${d.regle}` });

  return { dossierId: ged.dossierId, totalPages: ged.bilan.nbPages, totalPieces: ged.bilan.nbPieces, pages, exclusions, tronque, plafond };
}
