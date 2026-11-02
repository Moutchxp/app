import type { ModeMois } from './modele';

/**
 * 🔴 MON ESPACE (Arno, 02/11/2026) — LA SOURCE DES CHIFFRES D'UN GRAPHIQUE DU SUIVI CA (« Mois par mois », « Année par année »), facultative.
 * Sans source, `GrapheMois` / `GrapheAnnees` calculent comme toujours sur les ventes de la page (le Suivi CA : rien ne change). Avec une source, le
 * MÊME composant (en-tête, Mensuel / Cumul, barres N et N−1 hachurées, vendu en bas et compromis au-dessus, encadré de détail, légende) montre
 * d'autres chiffres déjà calculés — « Mon espace » : MES chiffres (décision 1), jamais la commission d'un autre. Sans « CA net » (non défini).
 */
export interface SourceGrapheMois {
  /** Le CA HT de chaque mois (12) de l'année `a`, dans le mode du graphique (vendu + compromis), et celui du vendu seul. */
  ca: (a: number) => number[];
  caVendu: (a: number) => number[];
  /** Le nombre d'affaires de chaque mois, dans le mode, et celui du vendu seul. */
  nb: (a: number) => number[];
  nbVendu: (a: number) => number[];
  /** Pas d'année précédente à comparer (« non importé »). */
  sansN1: boolean;
  /** Les compromis en cours non datés de l'année, comptés au mois en cours (la mention). */
  nbReportes: number;
}
export interface SourceGrapheAnnees {
  /** La valeur d'une année dans l'unité affichée (`ht` / `ttc`) ou le nombre, pour un mode (« vendu » : la part du bas de la barre). */
  valeur: (a: number, mode: ModeMois, mesure: 'ca' | 'nombre', unite: 'ht' | 'ttc') => number;
  nbReportes: number;
}
