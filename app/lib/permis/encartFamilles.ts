/**
 * UNIF-0 — MODÈLE PUR de l'encart de familles du détail d'un permis (client-safe, aucune I/O). Un seul foyer de la RÈGLE
 * D'AFFICHAGE d'Arno, pour que « En cours », « Réponses » et « Archives » ne la réécrivent pas trois fois (précédent 19/08).
 *
 * RÈGLE (Arno, 30/08) : une famille s'affiche si elle CONTIENT des informations (nonVide) OU si l'onglet est fait pour la
 * REMPLIR (statut 'remplissable'). Elle est COMPLÈTEMENT ABSENTE (ni grisée, ni « (vide) ») si les deux sont faux — c.-à-d.
 * statut 'si_non_vide' ET vide, ou statut 'absente' (la famille n'a pas de sens dans cet onglet).
 */
export type FamilleEncart = 'suivi_actions' | 'completude' | 'historique' | 'contact' | 'caracteristiques' | 'batiments' | 'pieces';
export type OngletEncart = 'en_cours' | 'reponses' | 'archives' | 'analyse';

/** 'remplissable' = toujours affichée (l'onglet sert à la remplir) ; 'si_non_vide' = affichée seulement si elle contient des infos ; 'absente' = hors sujet dans cet onglet. */
export type StatutFamille = 'remplissable' | 'si_non_vide' | 'absente';

/** Ordre d'affichage canonique des familles dans l'encart (identique à « Analyse et projection » : gestes/complétude d'abord). */
// LOT 21 (B) — « Contact mairie » en PREMIÈRE position (juste sous le titre de l'encart), avant « Texte de la demande » et « Suivi et
//   actions ». Ordre PARTAGÉ par tous les onglets (socle UNIF-0) : effet réel en En cours ET Réponses (où contact est 'si_non_vide') ;
//   AUCUN effet visible en Analyse et Archives (contact y est 'absente' → filtré, l'ordre relatif des autres familles est inchangé).
export const ORDRE_FAMILLES: readonly FamilleEncart[] = ['contact', 'suivi_actions', 'completude', 'historique', 'caracteristiques', 'batiments', 'pieces'];

/** Titres COURTS (une seule vérité, réutilisée par les 3 onglets → aucune divergence de libellé). */
export const LIBELLE_FAMILLE: Record<FamilleEncart, string> = {
  suivi_actions: 'Suivi et actions de la demande',
  completude: 'Complétude des pièces & relance mail',
  historique: 'Historique des échanges',
  contact: 'Contact mairie', // LOT-9 C — carnet d'adresses : qui nous a écrit + où nous avons écrit
  caracteristiques: 'Caractéristiques du permis',
  batiments: 'Bâtiments et projection',
  pieces: 'Pièces du permis',
};

/**
 * Statut de chaque couple (onglet, famille). Reflète la recon validée : dans « Analyse » les 5 familles de contenu sont
 * remplissables (c'est là qu'on les remplit) ; dans « En cours »/« Réponses » seul le SUIVI est remplissable, le reste s'affiche
 * s'il contient des infos (un dossier incomplet qui revient garde tout sous la main) ; « Archives » remplit Pièces + Caractéristiques.
 */
const STATUTS: Record<OngletEncart, Record<FamilleEncart, StatutFamille>> = {
  analyse: { suivi_actions: 'absente', completude: 'remplissable', historique: 'remplissable', contact: 'absente', caracteristiques: 'remplissable', batiments: 'remplissable', pieces: 'remplissable' },
  en_cours: { suivi_actions: 'remplissable', completude: 'si_non_vide', historique: 'si_non_vide', contact: 'si_non_vide', caracteristiques: 'si_non_vide', batiments: 'si_non_vide', pieces: 'si_non_vide' },
  reponses: { suivi_actions: 'remplissable', completude: 'si_non_vide', historique: 'si_non_vide', contact: 'si_non_vide', caracteristiques: 'si_non_vide', batiments: 'si_non_vide', pieces: 'si_non_vide' },
  archives: { suivi_actions: 'si_non_vide', completude: 'si_non_vide', historique: 'si_non_vide', contact: 'absente', caracteristiques: 'remplissable', batiments: 'si_non_vide', pieces: 'remplissable' },
};

/** Statut (remplissable / si_non_vide / absente) d'une famille dans un onglet. PUR. */
export function statutFamille(onglet: OngletEncart, famille: FamilleEncart): StatutFamille {
  return STATUTS[onglet][famille];
}

/**
 * La famille doit-elle être AFFICHÉE ? Règle d'Arno : 'remplissable' → toujours ; 'si_non_vide' → seulement si `nonVide` ;
 * 'absente' → jamais. (Une famille masquée est totalement absente de l'encart — c'est l'appelant qui ne la rend pas.) PUR.
 */
export function familleAffichee(onglet: OngletEncart, famille: FamilleEncart, nonVide: boolean): boolean {
  const s = STATUTS[onglet][famille];
  if (s === 'remplissable') return true;
  if (s === 'absente') return false;
  return nonVide === true; // 'si_non_vide'
}

/**
 * Liste ORDONNÉE des familles à afficher pour un onglet, d'après leur non-vidité. `nonVide` : par famille (absent → vide).
 * Source unique consommée par l'encart (et testable seule). PUR.
 */
export function famillesAffichees(onglet: OngletEncart, nonVide: Partial<Record<FamilleEncart, boolean>>): FamilleEncart[] {
  return ORDRE_FAMILLES.filter((f) => familleAffichee(onglet, f, nonVide[f] === true));
}
