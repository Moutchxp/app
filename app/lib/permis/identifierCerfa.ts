import type { ResultatLectureGed, PieceGedMeta } from './lectureGed';

/**
 * LECT-1 (A) — IDENTIFIER le Cerfa « Demande de permis de construire » par son CONTENU, jamais par son nom de fichier (les mairies
 * versent le Cerfa sous des noms opaques : « PC 075 120 25 V0006_… »). Le n° NATIONAL du formulaire PC est **13409** (`13409*NN`,
 * NN = version) — il est imprimé EN TÊTE du formulaire (« N° 13409*14 CERFA Demande de Permis… »). Générique (toute mairie, toute
 * version). Discriminant : 13407 = déclaration d'ouverture de chantier, 13406/13405 = autres formulaires → « 13409 » ne désigne
 * QUE le PC. On exige EN PLUS « cerfa » OU « permis de construire » à proximité (dans les premières pages) pour ne pas prendre une
 * NOTICE qui CITERAIT le numéro. PUR (aucune I/O), testable.
 *
 * ⚠️ Fragilité assumée (à redire au porteur) : si une mairie fournissait un Cerfa dont la 1re page n'imprime PAS « 13409 » (formulaire
 *   tronqué, ré-export sans en-tête), l'identification échoue → la vision ne part pas (motif explicite), aucune fausse identification.
 *   C'est un ÉCHEC VISIBLE, jamais un faux positif.
 */
const NUM_CERFA_PC = /\b13\s?409(?:\s*\*\s*\d{1,2})?\b/i; // 13409, 13409*14, « 13 409 » — le n° national du PC
const CONTEXTE_CERFA = /cerfa|permis\s+de\s+construire/i;
const NB_PAGES_TETE = 3; // le n° de formulaire est en tête ; 3 pages = marge sûre sans dépendre d'un dossier de 300 pages

/** La TÊTE d'une pièce (ses premières pages) est-elle le FORMULAIRE Cerfa PC ? PUR. `pagesTete` = textes des 1res pages. */
export function estPieceCerfaPc(pagesTete: readonly (string | null | undefined)[]): boolean {
  const tete = pagesTete.map((t) => t ?? '').join(' \n ');
  return NUM_CERFA_PC.test(tete) && CONTEXTE_CERFA.test(tete);
}

/**
 * Trouve, PARMI les pièces DÉJÀ LUES (`ged`), celle qui est le Cerfa PC, et renvoie sa métadonnée (dont `cleStockage`, via `metas`).
 * `null` si aucune. AUCUNE lecture supplémentaire : réutilise le texte déjà extrait par `lireGedPermis`. Appariement par `id`
 * (jamais par nom : deux homonymes ne se devinent pas).
 */
export function trouverCerfaPc(ged: ResultatLectureGed, metas: readonly PieceGedMeta[]): PieceGedMeta | null {
  for (const p of ged.pieces) {
    if (estPieceCerfaPc(p.pages.slice(0, NB_PAGES_TETE).map((pg) => pg.texte))) {
      const meta = metas.find((mm) => mm.id === p.id);
      if (meta) return meta;
    }
  }
  return null;
}
