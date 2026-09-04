/**
 * LOT 70 — REPORT des DÉCLARATIONS du Cerfa (récapitulatif, LOT 67) dans les CHAMPS de caractéristiques. Jusqu'ici le bloc
 * « Déclarations du Cerfa » n'était qu'INFORMATIF : la valeur était sous les yeux d'Arno mais aucun geste ne la portait dans le
 * champ (défaut d'interface traqué depuis N6-F). Ce module décide, de façon PURE, QUELS champs déclarés peuvent alimenter QUELLE
 * colonne de caractéristique, et SOUS QUELLES GARDES.
 *
 * DOCTRINE :
 * - La source est un RÉCAPITULATIF déclaratif → méthode `recap` (precedenceMethodes.ts, LOT 69), la PLUS FAIBLE : elle n'écrit QUE
 *   dans un champ VIDE (elle ne domine aucune autre méthode). Un champ déjà rempli par 'cerfa' (AcroForm), 'enonce', 'plan'… n'est
 *   JAMAIS écrasé.
 * - 🔴 UN CHAMP `saisie` (la main) N'EST JAMAIS TOUCHÉ (invariant 103) — garde EXPLICITE ici, en plus de la garde du dépôt.
 * - Idempotence : un champ déjà détenu par 'recap' peut être ré-écrit (même valeur) sans être considéré comme « occupé ».
 * - Confiance jamais `confirmee` sur cette base (portée par l'écrivain) : la source reste une déclaration.
 *
 * Un champ du bloc SANS colonne de destination reste INFORMATIF et le DIT (N10-R) : voir `CHAMPS_INFORMATIFS_SEULS`.
 */
import type { DeclarationsRecapCerfa } from './recapCerfa';

/** Clés (nom logique caracteristiquesRepo) des champs déclarés REPORTABLES au niveau PERMIS. */
export type ChampReportable = 'nbLogements' | 'nbPlacesStationnement' | 'surfacePlancherM2';

export interface DescriptionReportable {
  cle: ChampReportable;
  colonne: string;                                // colonne SQL (= `champ` journalisé par ecrireCerfa → même clé de précédence)
  libelleRecap: string;                           // libellé de la déclaration lue
  libelleChamp: string;                           // libellé du champ de caractéristique cible
  valeurRecap: (d: DeclarationsRecapCerfa) => number | null;
}

/**
 * Correspondance déclaration → champ de caractéristique (niveau PERMIS uniquement — jamais un corps, pour ne pas rejouer
 * l'attribution par lot fermée en P4/P5). Trois champs ont une destination NON AMBIGUË :
 *  - « Nombre total de logements créés »            → nb_logements
 *  - « Stationnement — places APRÈS réalisation »   → nb_places_stationnement  (le nombre FINAL du projet)
 *  - « Surfaces totales » (colonne Surface totale)  → surface_plancher_m2      (surface de PLANCHER Cerfa, jamais la surface créée Sitadel)
 */
export const CHAMPS_REPORTABLES: readonly DescriptionReportable[] = [
  { cle: 'nbLogements', colonne: 'nb_logements', libelleRecap: 'Logements créés', libelleChamp: 'Nombre de logements', valeurRecap: (d) => d.logementsTotal },
  { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', libelleRecap: 'Stationnement (après réalisation)', libelleChamp: 'Places de stationnement', valeurRecap: (d) => d.stationnementApres },
  { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', libelleRecap: 'Surface de plancher (total déclaré)', libelleChamp: 'Surface de plancher', valeurRecap: (d) => d.surfacePlancherTotaleM2 },
];

/** Champs du bloc « Déclarations du Cerfa » SANS colonne de destination → INFORMATIFS seuls (dits, jamais reportés — N10-R). */
export const CHAMPS_INFORMATIFS_SEULS: readonly { libelle: string; motif: string }[] = [
  { libelle: 'Date de dépôt', motif: 'la date de référence fait foi côté Sitadel, jamais réécrite depuis une déclaration' },
  { libelle: 'Superficie du terrain', motif: 'la superficie relève du cadastre / des parcelles, pas d’un champ de caractéristique' },
  { libelle: 'Répartition individuels / collectifs', motif: 'aucun champ de caractéristique dédié (seul le total est reporté)' },
  { libelle: 'Stationnement avant réalisation', motif: 'aucun champ de caractéristique (seul le nombre APRÈS réalisation est reporté)' },
  { libelle: 'Niveaux du bâtiment le plus élevé', motif: 'le nombre de niveaux est un champ PAR bâtiment ; le rattacher à un corps précis n’est pas établi (P4/P5) — reste informatif' },
  { libelle: 'Emprise au sol créée', motif: 'aucun champ numérique d’emprise (l’emprise est une géométrie, pas une surface déclarée)' },
  { libelle: 'Description du projet', motif: 'texte libre du pétitionnaire (régime ②), jamais une valeur de champ' },
];

export type OrigineActuelle = 'saisie' | 'extraite' | null;
/** État courant d'un champ cible : sa valeur, son origine (invariant), et le PROPRIÉTAIRE de précédence (méthode de la 'retenue'). */
export interface EtatChampCourant { valeur: number | null; origine: OrigineActuelle; proprietaire: string | null }

export interface AReporter { cle: ChampReportable; colonne: string; valeur: number }

/**
 * DÉCISION PURE : quels champs déclarés reporter, compte tenu de leur état courant. `recap` étant la méthode la PLUS FAIBLE :
 *  - jamais un champ `saisie` (garde explicite) ;
 *  - un champ occupé par une AUTRE méthode automatique (valeur présente, propriétaire ≠ 'recap') n'est PAS écrasé ;
 *  - un champ VIDE, ou déjà détenu par 'recap' (ré-écriture idempotente), est reporté.
 */
export function decisionReportDeclarations(d: DeclarationsRecapCerfa, etat: Record<ChampReportable, EtatChampCourant>): AReporter[] {
  const out: AReporter[] = [];
  for (const c of CHAMPS_REPORTABLES) {
    const v = c.valeurRecap(d);
    if (v === null) continue;                         // rien de déclaré pour ce champ
    const e = etat[c.cle];
    if (e.origine === 'saisie') continue;             // 🔴 invariant 103 — la main n'est JAMAIS écrasée
    const vide = e.valeur === null;
    const detenuParRecap = e.proprietaire === 'recap';
    if (!vide && !detenuParRecap) continue;           // occupé par une méthode que 'recap' ne domine pas → on n'écrase pas
    out.push({ cle: c.cle, colonne: c.colonne, valeur: v });
  }
  return out;
}
