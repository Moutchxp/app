/**
 * N10-H — DÉCISION PURE de la DÉSIGNATION de l'opération (nom du projet), niveau PERMIS. Aucune base, aucune IA, aucun réseau.
 *
 * RÈGLE (validée) : fait foi = la ligne LIBELLÉE « Nom de l'opération : … » (ou « Désignation de l'opération : … »). La valeur est
 * le texte ENTRE l'étiquette et l'étiquette SUIVANTE (« Nature des travaux », « Adresse travaux », « Désignation des acteurs »…).
 * Sinon ABSTENTION avec motif. On ne remonte JAMAIS aux en-têtes de notice ni aux cartouches de plan : en choisir un serait INFÉRER
 * lequel est « le nom ». Aucun mapping vers la liste fermée des destinations : traduire un titre en case cochée est une inférence
 * invisible (une case a l'apparence d'un fait déclaré).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ON RÉDUIT LES ESPACES MAIS ON NE RECOLLE PAS LES MOTS (motif porteur, Arno) :
 *   La règle « verbatim » existe pour empêcher la machine d'inventer du SENS — traduire un titre libre en case cochée, choisir un
 *   cartouche parmi trois. Elle n'a jamais eu pour but de sanctifier un artefact d'extraction. Le document, lu par un humain, écrit
 *   « Équipement Multisports » ; « M ultisport s » est ce que produit pdfjs sur une typographie espacée, pas ce que dit le document.
 *   Mais on REFUSE de recoller les mots : là on devinerait des frontières, et une fois sur dix on se tromperait sans que personne
 *   ne le voie. Un mot recollé de travers passe inaperçu ; un résidu typographique, non — il saute aux yeux, et c'est ce qui le
 *   rend acceptable. Il est laid, il n'est jamais faux. DONC : on stocke la ligne libellée telle qu'elle sort, espaces multiples
 *   réduits à un seul, rien d'autre touché. Éditable, et une correction la fige en 'saisie' pour toujours (invariant 103).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Une page de la GED à examiner (texte brut extrait). `page` tel que rendu par la lecture GED (1-based). */
export interface PagePermis { piece: string; page: number; texte: string }

export type DecisionDesignation =
  | { statut: 'retenue'; valeur: string; piece: string; page: number }
  | { statut: 'abstenue'; motif: string };

export const MOTIF_AUCUNE_LIGNE_LIBELLEE =
  'aucune ligne libellée « Nom de l’opération » dans le corpus (désignation non capturée — à saisir à la main)';

// Étiquettes d'OUVERTURE (le nom suit le « : »). Insensibles à la casse, à l'apostrophe droite/courbe et à l'accent de « opération ».
const OUVERTURES = [/nom de l['’]op[eé]ration\s*:/i, /d[eé]signation de l['’]op[eé]ration\s*:/i];
// Étiquettes de FERMETURE (la valeur s'arrête à la première rencontrée après l'ouverture). Liste fermée, jamais un délimiteur d'espace.
const FERMETURES = [
  'nature des travaux', 'adresse travaux', 'adresse des travaux', 'désignation des acteurs', 'designation des acteurs',
  'maitrise d’ouvrage', 'maîtrise d’ouvrage', 'maitrise d’œuvre', 'maître d’ouvrage', 'renseignements généraux',
];

/** Réduit les suites d'espaces à UN seul et trim. C'est la SEULE transformation autorisée (cf. motif ci-dessus) : rien d'autre. */
const espacesSimples = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Décide la désignation. Parcourt les pages dans l'ORDRE ; retient la PREMIÈRE ligne libellée porteuse d'une valeur non vide, avec
 * sa provenance (pièce, page). Aucune valeur → abstention motivée. Ne juge jamais de la « qualité » du texte : un résidu
 * typographique est retenu tel quel (il est visible, jamais faux).
 */
export function decisionDesignation(pages: readonly PagePermis[]): DecisionDesignation {
  for (const p of pages) {
    const plat = espacesSimples(p.texte); // espaces multiples → un seul (transformation unique)
    for (const ouv of OUVERTURES) {
      const m = ouv.exec(plat);
      if (!m) continue;
      const debut = m.index + m[0].length;
      const reste = plat.slice(debut);
      // fin = première étiquette de fermeture rencontrée (sinon toute la fin de page).
      let fin = reste.length;
      const bas = reste.toLowerCase();
      for (const f of FERMETURES) { const i = bas.indexOf(f); if (i >= 0 && i < fin) fin = i; }
      const valeur = espacesSimples(reste.slice(0, fin));
      if (valeur !== '') return { statut: 'retenue', valeur, piece: p.piece, page: p.page };
    }
  }
  return { statut: 'abstenue', motif: MOTIF_AUCUNE_LIGNE_LIBELLEE };
}
