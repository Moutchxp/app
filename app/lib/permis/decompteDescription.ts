/**
 * LOT 69 — RAPPROCHEMENT DÉTERMINISTE du CHAMP LIBRE du récapitulatif (« Courte description de votre projet »). Le champ libre
 * déclare EN TOUTES LETTRES ce qu'AUCUN champ structuré ne porte : le décompte des logements PAR bâtiment, le nombre de bâtiments,
 * les locaux commerciaux, le stationnement. Ce module lit ces nombres de façon DÉTERMINISTE (regex, ZÉRO IA, ZÉRO réseau) et — c'est
 * TOUT le lot — n'en RETIENT le décompte QUE si l'ARITHMÉTIQUE CONCORDE avec un total déjà connu par une AUTRE source (le nombre de
 * logements des champs STRUCTURÉS). La somme est la preuve : 40 + 18 + 9 = 67, et 67 est le total structuré → on écrit. Si la somme
 * ne tombe pas juste, on n'écrit RIEN et on dit pourquoi. PUR (aucune I/O), testable.
 *
 * DISCIPLINE (doctrine P4/P5 — l'attribution automatique PAR LOT est FERMÉE) :
 * - AUCUNE INTERPRÉTATION, AUCUNE ATTRIBUTION : on ne rattache ici aucune cote, aucune altitude, aucune géométrie à un bâtiment. On
 *   lit un DÉCOMPTE déclaré et on le VÉRIFIE par une somme. Rien d'autre n'en est déduit.
 * - La corroboration arithmétique GATE l'ÉCRITURE (concordant → à écrire), jamais l'ÉCRASEMENT d'une autre méthode : la source reste
 *   une phrase en prose → confiance JAMAIS `confirmee` (portée par l'écrivain, `cerfaRecapRepo`).
 * - Régime MESURÉ (base locale, 6 récapitulatifs) : un SEUL document (dossier 7424) porte à la fois un décompte par bâtiment ET un
 *   total structuré ; les 5 autres n'ont pas de total structuré → la porte arithmétique les laisse tous VIDES. Les motifs (« N plots »,
 *   « N logements pour le Bat. X ») sont volontairement ÉTROITS et tolèrent les coupures d'aplatissement pdfjs OBSERVÉES (« po ur »,
 *   « so us-sol »). La généralisation à d'autres formulations n'est PAS mesurée — la porte arithmétique reste le garde-fou.
 */

/** Un décompte lu PAR bâtiment : le repère (A/B/C…) et le nombre de logements déclaré pour lui. */
export interface BatimentLogements { repere: string; logements: number }
/** Un local commercial lu dans la description (INFORMATIF, jamais corroboré) : sa surface déclarée si elle figure. */
export interface LocalCommercial { surfaceM2: number | null }

export interface DecompteDescription {
  /** Décompte des logements par bâtiment lu dans la prose (ex. [{A,40},{B,18},{C,9}]). Vide si rien lu. */
  batiments: BatimentLogements[];
  /** Nombre de bâtiments DÉCLARÉ en toutes lettres (« 3 plots »), indépendamment du décompte. null si non lu. */
  nbBatimentsDeclare: number | null;
  /** Somme des logements du décompte (null si aucun décompte lu). C'est la valeur confrontée au total structuré. */
  sommeLogements: number | null;
  /** Total des logements des champs STRUCTURÉS (l'autre source), recopié ici pour la traçabilité de la preuve. */
  logementsTotalStructure: number | null;
  /** VRAI seulement si la somme du décompte égale le total structuré ET que le nb de bâtiments déclaré (s'il est lu) = nb d'entrées. */
  concordant: boolean;
  /** Nombre de bâtiments RETENU (écrit) — uniquement si `concordant`. null sinon. Cohérent avec le nb d'entrées du décompte. */
  nbBatimentsRetenu: number | null;
  /** Motif de NON-ÉCRITURE quand un décompte a été LU mais ne concorde pas (N10-R : jamais un rejet muet). null si concordant ou rien lu. */
  motifEcart: string | null;
  /** Locaux commerciaux lus (INFORMATIF, non corroboré). */
  locauxCommerciaux: LocalCommercial[];
  /** Places de stationnement lues dans la prose (INFORMATIF, non corroboré ; le champ arbitré `nb_places_stationnement` n'est PAS touché). */
  placesStationnement: number | null;
  /** Fragment de prose d'où provient le décompte (provenance affichable) — le décompte par bâtiment, tel que lu. null si rien lu. */
  extrait: string | null;
}

/** Décompte VIDE (rien lu, rien à corroborer) — jamais concordant. */
function vide(logementsTotalStructure: number | null): DecompteDescription {
  return {
    batiments: [], nbBatimentsDeclare: null, sommeLogements: null, logementsTotalStructure,
    concordant: false, nbBatimentsRetenu: null, motifEcart: null, locauxCommerciaux: [], placesStationnement: null, extrait: null,
  };
}

// « 40 logements po ur le Bat. A », « 18 pour le Bat. B », « 9 pour le Bat. C ». Le mot « logements » n'apparaît qu'au 1er ; « pour »
// est parfois coupé « po ur » par l'aplatissement pdfjs ; le token discriminant est « Bat. <Lettre> ». On ne capte QUE ce gabarit.
const RE_LGT_PAR_BAT = /(\d{1,4})\s+(?:logements?\s+)?po\s?ur\s+(?:le\s+)?(?:b[âa]t\.?|b[âa]timent)\s*([A-Za-z])\b/gi;
// « répartis sur 3 plots », « 3 bâtiments », « 3 immeubles ». On EXCLUT « lots » (piège du gabarit Cerfa vierge : « Nombre maximum de lots »).
const RE_NB_BAT = /(\d{1,3})\s+(?:plots?|b[âa]timents?|immeubles?)\b/i;
// « 2 locaux commerciaux à rdc (de 177m² et 69m² …) » — le compte, puis les surfaces qui suivent dans une fenêtre courte.
const RE_LOCAUX = /(\d{1,3})\s+locaux\s+commerciaux/i;
const RE_SURFACE = /(\d{1,5})(?:[.,]\d{1,2})?\s?m²/gi;
// « parking de 49 pl. », « parking de 49 places ». INFORMATIF.
const RE_PARKING = /parking\s+de\s+(\d{1,4})\s?(?:pl\.?|places?)/i;

/**
 * Lit le décompte déclaré dans la description et le CORROBORE par le total structuré des logements.
 * @param description  le champ libre VERBATIM (peut être null) — non modifié ; une copie whitespace-normalisée sert au matching.
 * @param logementsTotalStructure  le total des logements des champs STRUCTURÉS (l'autre source) — null si absent.
 */
export function lireDecompteDescription(description: string | null, logementsTotalStructure: number | null): DecompteDescription {
  const t = (description ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return vide(logementsTotalStructure);

  // Décompte par bâtiment (dédupliqué par repère, 1re occurrence gardée — jamais recomposé, jamais deviné).
  const batiments: BatimentLogements[] = [];
  const vus = new Set<string>();
  for (const m of t.matchAll(RE_LGT_PAR_BAT)) {
    const repere = m[2].toUpperCase();
    const logements = Number(m[1]);
    if (!Number.isFinite(logements) || vus.has(repere)) continue;
    vus.add(repere);
    batiments.push({ repere, logements });
  }

  const nbBatM = RE_NB_BAT.exec(t);
  const nbBatimentsDeclare = nbBatM ? Number(nbBatM[1]) : null;

  // Locaux commerciaux (INFORMATIF) : le compte + les surfaces déclarées dans la fenêtre qui suit la mention.
  const locauxCommerciaux: LocalCommercial[] = [];
  const locM = RE_LOCAUX.exec(t);
  if (locM) {
    const nb = Number(locM[1]);
    const fenetre = t.slice(locM.index, locM.index + 160);
    const surfaces: number[] = [];
    for (const s of fenetre.matchAll(RE_SURFACE)) { const v = Number(s[1]); if (Number.isFinite(v)) surfaces.push(v); }
    for (let i = 0; i < nb; i++) locauxCommerciaux.push({ surfaceM2: surfaces[i] ?? null });
  }

  const parkM = RE_PARKING.exec(t);
  const placesStationnement = parkM ? Number(parkM[1]) : null;

  const sommeLogements = batiments.length > 0 ? batiments.reduce((s, b) => s + b.logements, 0) : null;
  const extrait = batiments.length > 0 ? batiments.map((b) => `Bat. ${b.repere} : ${b.logements}`).join(' · ') : null;

  // CORROBORATION — la somme est la preuve. On ne RETIENT le décompte QUE si elle égale le total structuré, ET (si un nombre de
  // bâtiments est déclaré) qu'il coïncide avec le nombre d'entrées lues (garde contre un parse partiel du décompte).
  let concordant = false;
  let nbBatimentsRetenu: number | null = null;
  let motifEcart: string | null = null;

  if (batiments.length > 0) {
    const somme = sommeLogements!;
    const detail = batiments.map((b) => b.logements).join('+');
    if (logementsTotalStructure === null) {
      motifEcart = `somme des logements par bâtiment (${detail}=${somme}) lue dans la description, mais aucun total structuré de logements pour la corroborer — non écrit`;
    } else if (somme !== logementsTotalStructure) {
      motifEcart = `somme ${detail}=${somme} ≠ total structuré ${logementsTotalStructure} — non écrit`;
    } else if (nbBatimentsDeclare !== null && nbBatimentsDeclare !== batiments.length) {
      motifEcart = `${nbBatimentsDeclare} bâtiments déclarés ≠ ${batiments.length} décompte(s) lu(s) — non écrit`;
    } else {
      concordant = true;
      nbBatimentsRetenu = nbBatimentsDeclare ?? batiments.length;
    }
  }

  return {
    batiments, nbBatimentsDeclare, sommeLogements, logementsTotalStructure,
    concordant, nbBatimentsRetenu, motifEcart, locauxCommerciaux, placesStationnement, extrait,
  };
}
