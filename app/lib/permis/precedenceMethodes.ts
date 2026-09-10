/**
 * N10-T — PRÉCÉDENCE entre méthodes d'extraction, DÉCLARÉE UNE SEULE FOIS. Module PUR (aucune base) : tous les writers et le reader
 * s'en servent, aucun ne la recopie (même discipline que les domaines de purge de N10-S).
 *
 * ORDRE (rang décroissant) :  saisie > cerfa > enonce > plan > teleservice > ia > motifs > recap
 *   - saisie  : la main — au-dessus de tout (invariant 103, géré par l'origine, PAS par ce module ; elle ne va jamais au journal).
 *   - cerfa   : le FORMULAIRE lui-même (champs AcroForm du Cerfa) — la donnée déclarée à la source.
 *   - enonce  : la TABLE STRUCTURÉE des planches (tableaux de niveaux) — structure > cotes isolées (cf. ecritureNiveaux.ts).
 *   - plan    : cote lue par POSITION sur une planche (gabarit/plateau).
 *   - teleservice : (CR-1b) valeurs DÉRIVÉES de la phrase que le TÉLÉSERVICE de la mairie pré-remplit dans le champ libre du Cerfa
 *               (« Construction d'un bâtiment à R+N sur M niveau(x) de sous-sol à destination … Surface créée: S m² »). C'est un dérivé
 *               PRODUIT PAR LA MAIRIE, pas une déclaration d'architecte : SOUS les plans/coupes et la déclaration humaine, mais
 *               AU-DESSUS de l'IA (une valeur écrite en toutes lettres par l'outil officiel > une lecture d'image). Ne pas confondre
 *               avec 'cerfa'. ⚠️ PAS ENCORE dans le CHECK du journal (migrations 109/133/193) : aucune écriture de journal 'teleservice'
 *               dans CR-1b (les valeurs vivent dans le récap) ; l'instruction des champs et la migration du CHECK viendront en CR-3.
 *   - ia      : LECTURE D'IMAGE du même document (OCR + vision) — sous le formulaire qu'elle relit.
 *   - motifs  : la COTE ISOLÉE glanée dans le texte — dernier recours des cotes.
 *   - recap   : (LOT 69) une VALEUR déclarée dans le CHAMP LIBRE du récapitulatif, RETENUE parce que corroborée par une SOMME sur un
 *               total structuré (ex. « 40+18+9=67 logements » = total structuré → nombre de bâtiments écrit). PLACÉ AU PLUS BAS À
 *               DESSEIN : la source est une PHRASE EN PROSE — sa force (la corroboration) gate l'ÉCRITURE d'un champ vierge, jamais
 *               l'ÉCRASEMENT d'une méthode structurée. Ne peut dominer personne ; ne concerne aujourd'hui que des champs neufs
 *               (« nombre de bâtiments ») qu'aucune autre méthode n'écrit.
 *
 * RÈGLE : une écriture 'extraite' n'écrase une autre 'extraite' QUE si sa méthode est de rang supérieur ou égal (`domine`). Sinon
 * elle est ÉCARTÉE (journalisée 'ecartee' avec un motif qui NOMME la règle). 'saisie' reste au-dessus de tout (invariant inchangé).
 */

/** Les méthodes automatiques (CHECK journal migrations 109/133/193 ; 'teleservice' PAS ENCORE dans le CHECK — cf. CR-3). 'saisie' n'y figure pas. */
export type MethodeExtraction = 'cerfa' | 'enonce' | 'plan' | 'teleservice' | 'ia' | 'motifs' | 'recap';

/** Nom de la méthode des valeurs dérivées de la phrase générée par le téléservice (CR-1b). Une seule source de vérité. */
export const METHODE_TELESERVICE = 'teleservice' as const;

/** Rang décroissant : indice 0 = plus fort. `saisie` inclus pour l'ordre complet, mais l'invariant 103 la traite via l'origine. */
export const PRECEDENCE_METHODES = ['saisie', 'cerfa', 'enonce', 'plan', 'teleservice', 'ia', 'motifs', 'recap'] as const;

/** Rang d'une méthode (plus petit = plus fort). Méthode inconnue ou nulle = rang le PLUS FAIBLE (ne domine personne). */
export function rangMethode(m: string | null | undefined): number {
  const i = (PRECEDENCE_METHODES as readonly string[]).indexOf(m ?? '');
  return i === -1 ? PRECEDENCE_METHODES.length : i;
}

/** `incoming` peut-il écrire par-dessus le `owner` actuel ? Vrai si aucun propriétaire, ou si `incoming` est de rang ≥ (indice ≤). */
export function domine(incoming: string, owner: string | null | undefined): boolean {
  if (owner == null) return true;
  return rangMethode(incoming) <= rangMethode(owner);
}

/** Parmi des méthodes de lignes 'retenue', la GAGNANTE = rang le plus fort. Null si aucune méthode nommée (lignes sans méthode). */
export function methodeGagnante(methodes: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestRang = Infinity;
  for (const m of methodes) {
    if (m == null) continue;
    const r = rangMethode(m);
    if (r < bestRang) { best = m; bestRang = r; }
  }
  return best;
}

/** Préfixe STABLE du motif d'écart par précédence — un constant qu'on possède (jamais un rapprochement fragile sur du texte libre). */
export const PREFIXE_MOTIF_PRECEDENCE = 'écartée par précédence :';

/** Motif d'une valeur écartée parce qu'une méthode de rang supérieur détient déjà le champ. NOMME la règle appliquée (visibilité). */
export function motifEcartePrecedence(incoming: string, owner: string): string {
  return `${PREFIXE_MOTIF_PRECEDENCE} ${owner} > ${incoming} (méthode de rang supérieur — fait foi)`;
}

/** Un motif est-il un écart de précédence ? (test EXACT sur le préfixe que ce module produit — pas un rapprochement sémantique). */
export function estMotifPrecedence(motif: string | null | undefined): boolean {
  return !!motif && motif.startsWith(PREFIXE_MOTIF_PRECEDENCE);
}
