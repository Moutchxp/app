/**
 * PL-COMPARATIF — module PUR (aucune I/O, testé) : confronte les parcelles DÉCLARÉES au permis (caractéristiques, « ce que le dossier
 * déclare ») aux parcelles SÉLECTIONNÉES dans la composition sur le schéma de la planche cadastrale. C'est un CONSTAT et rien d'autre :
 * il n'ajoute, ne retire, ne coche, ne corrige, n'enregistre RIEN, et ne touche ni au bouton « Valider la sélection » ni à sa règle.
 *
 * ⚠️ NORMALISATION AVANT COMPARAISON (le point qui décide de l'utilité) : une même parcelle s'écrit de plusieurs façons — « DZ 09 »
 * ⟷ « DZ 9 » (zéros de tête), casse de la section, espaces parasites. La clé `cleComparaisonParcelle` — section MAJUSCULE trimée
 * + '#' + numéro trimé SANS zéros de tête — est le MIROIR EXACT du `cle` interne PROUVÉ de `decisionParcelles.ts` (corroboration
 * Cerfa ⟷ Sitadel, « DZ 09 » ⟷ « DZ 9 »). 🔴 NE PAS y remettre les zéros de tête : « DZ 09 » et « DZ 9 » sont la MÊME parcelle. Le
 * préfixe/commune ne discriminent pas ici (comparaison DANS un dossier, même commune) — comme le `cle` de référence, qui ne compare
 * que section + numéro. Aucune écriture, aucune dépendance base : entrée = deux listes de références, sortie = un constat lisible.
 */

export interface RefParcelle { section: string; numero: string }

export type StatutParcelleComparee =
  | 'commune'                    // présente des deux côtés (vert)
  | 'declaree_non_selectionnee'  // déclarée au permis mais absente de la sélection (rouge)
  | 'selectionnee_non_declaree'  // sélectionnée sur le schéma mais non déclarée au permis (rouge)
  | 'a_verifier';               // référence non normalisable (section ou numéro vide) → on ne tranche pas

export interface LigneParcelleComparee {
  cle: string;      // clé normalisée (identité de ligne, dédoublonnage)
  libelle: string;  // forme lisible « Section DZ n° 9 » (prise du côté disponible, brute)
  statut: StatutParcelleComparee;
}

export interface ComparatifParcelles {
  comparable: boolean;   // false si un côté est vide → JAMAIS un faux rouge, un motif explicite à la place
  motif: string | null;  // pourquoi la comparaison n'est pas possible (déclaré vide / sélection vide)
  concordant: boolean;   // true ⟺ comparable ET toutes les lignes sont 'commune'
  lignes: LigneParcelleComparee[];
}

const normaliseSection = (s: string | null | undefined): string => (s ?? '').trim().toUpperCase();
/** Numéro trimé, zéros de tête retirés (« 09 » → « 9 », « 0 » → « 0 »). MÊME règle que le `cle` de decisionParcelles.ts. */
const normaliseNumero = (n: string | null | undefined): string => { const t = (n ?? '').trim().replace(/^0+/, ''); return t === '' ? '0' : t; };

/** Clé de comparaison normalisée d'une parcelle : `SECTION#NUMERO` sans zéros de tête. PURE. « DZ 09 » et « DZ 9 » → même clé « DZ#9 ». */
export function cleComparaisonParcelle(section: string, numero: string): string {
  return `${normaliseSection(section)}#${normaliseNumero(numero)}`;
}

/** Une référence est normalisable si section ET numéro sont non vides (après trim). Sinon on ne tranche pas → 'a_verifier'. */
function estNormalisable(r: RefParcelle): boolean {
  return (r.section ?? '').trim() !== '' && (r.numero ?? '').trim() !== '';
}

const libelleRef = (r: RefParcelle): string => {
  const s = (r.section ?? '').trim(), n = (r.numero ?? '').trim();
  return `Section ${s || '?'} n° ${n || '?'}`;
};

/** Indexe une liste par clé normalisée (dédoublonne « DZ 09 »/« DZ 9 »), en mettant à part les réfs non normalisables (doute). */
function indexer(refs: readonly RefParcelle[]): { map: Map<string, RefParcelle>; doute: RefParcelle[] } {
  const map = new Map<string, RefParcelle>(); const doute: RefParcelle[] = [];
  for (const r of refs) {
    if (!estNormalisable(r)) { doute.push(r); continue; }
    const k = cleComparaisonParcelle(r.section, r.numero);
    if (!map.has(k)) map.set(k, r); // 1re écriture rencontrée conservée pour le libellé lisible
  }
  return { map, doute };
}

/**
 * Confronte les parcelles déclarées (A) aux parcelles sélectionnées (B), APRÈS normalisation. PURE.
 *  · A vide → non comparable (« aucune référence déclarée ») — jamais un faux rouge.
 *  · B vide → non comparable (« aucune sélection ») — idem.
 *  · sinon → une ligne par clé normalisée présente d'un côté ou l'autre, statut selon l'appartenance ; + une ligne 'a_verifier' par
 *    référence non normalisable (référence incomplète). `concordant` seulement si TOUTES les lignes sont 'commune'.
 */
export function comparerParcelles(declarees: readonly RefParcelle[], selectionnees: readonly RefParcelle[]): ComparatifParcelles {
  if (declarees.length === 0) return { comparable: false, motif: 'Aucune référence de parcelle déclarée dans les caractéristiques — comparaison impossible.', concordant: false, lignes: [] };
  if (selectionnees.length === 0) return { comparable: false, motif: 'Aucune parcelle sélectionnée sur le schéma — comparaison impossible.', concordant: false, lignes: [] };

  const A = indexer(declarees), B = indexer(selectionnees);
  const lignes: LigneParcelleComparee[] = [];
  for (const k of [...new Set([...A.map.keys(), ...B.map.keys()])].sort()) {
    const inA = A.map.has(k), inB = B.map.has(k);
    const ref = (A.map.get(k) ?? B.map.get(k)) as RefParcelle;
    const statut: StatutParcelleComparee = inA && inB ? 'commune' : inA ? 'declaree_non_selectionnee' : 'selectionnee_non_declaree';
    lignes.push({ cle: k, libelle: libelleRef(ref), statut });
  }
  for (const r of [...A.doute, ...B.doute]) lignes.push({ cle: `?#${libelleRef(r)}`, libelle: libelleRef(r), statut: 'a_verifier' });

  const concordant = lignes.length > 0 && lignes.every((l) => l.statut === 'commune');
  return { comparable: true, motif: null, concordant, lignes };
}

export type CasBilanComparatif =
  | 'correspondance'          // ① les deux ensembles sont identiques (vert)
  | 'manquantes'              // ② toutes les sélectionnées sont déclarées, mais des déclarées ne sont pas sélectionnées → il en MANQUE (rouge)
  | 'en_trop'                 // ③ toutes les déclarées sont sélectionnées, mais des sélectionnées ne sont pas déclarées → il y en a EN TROP (rouge)
  | 'manquantes_et_en_trop'   // ④ il MANQUE des parcelles ET il y en a EN TROP — cas réel du 07511924V0040 (rouge)
  | 'a_verifier'              // référence(s) non normalisable(s) uniquement → on ne tranche pas (rouge)
  | 'impossible';             // un côté vide → comparaison impossible (neutre)

export interface BilanComparatif { cas: CasBilanComparatif; ton: 'vert' | 'rouge' | 'neutre'; phrase: string }

/**
 * BILAN en UNE phrase, dérivé des statuts DÉJÀ classés par `comparerParcelles` (jamais recalculé) : la phrase dit à elle seule DE QUEL
 * CÔTÉ est l'écart — il en MANQUE (moins) vs il y en a EN TROP (plus) vs LES DEUX. 4 cas colorés + comparaison impossible. PURE.
 * ⚠️ Le cas ④ (manquantes ET en trop) EXISTE en données réelles (07511924V0040) : sans phrase dédiée, le bilan serait faux (ni « plus »
 * ni « moins »). Réutilise la classification manquante/en trop, ne la refait pas.
 */
export function bilanComparatif(c: ComparatifParcelles): BilanComparatif {
  if (!c.comparable) return { cas: 'impossible', ton: 'neutre', phrase: c.motif ?? 'Comparaison impossible.' };
  const manque = c.lignes.filter((l) => l.statut === 'declaree_non_selectionnee').length;
  const enTrop = c.lignes.filter((l) => l.statut === 'selectionnee_non_declaree').length;
  const aVerifier = c.lignes.filter((l) => l.statut === 'a_verifier').length;
  if (manque > 0 && enTrop > 0) return { cas: 'manquantes_et_en_trop', ton: 'rouge', phrase: 'La sélection ne correspond pas : des parcelles manquent et d’autres sont en trop.' };
  if (manque > 0) return { cas: 'manquantes', ton: 'rouge', phrase: 'Moins de parcelles sélectionnées que déclarées au permis.' };
  if (enTrop > 0) return { cas: 'en_trop', ton: 'rouge', phrase: 'Plus de parcelles sélectionnées que déclarées au permis.' };
  if (aVerifier > 0) return { cas: 'a_verifier', ton: 'rouge', phrase: 'Certaines références n’ont pas pu être comparées (incomplètes).' };
  return { cas: 'correspondance', ton: 'vert', phrase: 'Les mêmes parcelles sont sélectionnées que celles déclarées au permis.' };
}
