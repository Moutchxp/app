/**
 * Q2b — STOCK de permis encore À DEMANDER, par commune et par type. Logique PURE et testable.
 *
 * ⚠️ NE REDÉFINIT JAMAIS « éligible » : l'unique définition reste `estCandidatEligible` (demande.ts, partagée avec
 * `proposerLots`/`diagnostiquer` depuis Q2a). Ici on l'APPELLE, on ne la réécrit pas. La catégorie vient elle aussi de la
 * source unique (`classer`, via `DossierAffiche.categorie`) — aucun prédicat de type recopié. Ce module ne fait qu'AGRÉGER.
 *
 * Deux bornes de date DISTINCTES, à ne pas confondre :
 *  - `dateMin` = borne d'ÉLIGIBILITÉ (aujourd'hui − `anciennete_max_demande_annees`), passée telle quelle à
 *    `estCandidatEligible`. NON touchée par ce chantier.
 *  - `dateMin6mois` = borne d'AFFICHAGE de CE tableau (« moins de 6 mois »), un SOUS-ENSEMBLE de la fenêtre d'éligibilité
 *    (cf. `FENETRE_STOCK_MOIS`). Elle ne change rien à l'éligibilité : elle restreint seulement ce que la colonne montre.
 */
import { estCandidatEligible, type CandidatDossier } from './demande';
import type { CleCategorie } from './priorite';

/** Fenêtre d'AFFICHAGE du tableau de stock (mois). Borne de PRÉSENTATION, PAS une variable du moteur d'éligibilité. */
export const FENETRE_STOCK_MOIS = 6;

/**
 * Catégories affichées en COLONNES, dans l'ordre canonique de `priorite.ts` (immeuble neuf = chiffre principal, en tête).
 * La catégorie « autre » (rang 9999 — un dossier qui ne qualifie AUCUNE catégorie ; « ne devrait pas arriver pour un dossier
 * retenu à l'ingestion ») n'a pas de colonne et n'entre pas dans le stock : elle reste visible dans le panneau « tous les types ».
 */
export const CATEGORIES_STOCK: readonly Exclude<CleCategorie, 'autre'>[] = [
  'immeuble_neuf', 'surelevation', 'construction_neuve', 'extension', 'demolition',
];

/** Un dossier prêt pour l'agrégat : le candidat (pour l'ÉLIGIBILITÉ via `estCandidatEligible`) + sa catégorie DÉJÀ classée. */
export interface DossierStock {
  candidat: CandidatDossier;
  categorie: CleCategorie; // issue de `classer` (DossierAffiche.categorie) — source unique, jamais reclassée ici
}

/** Une ligne du tableau de stock : une commune, le décompte par type nommé, et le total (somme des types nommés montrés). */
export interface LigneStock {
  codeInsee: string;
  communeNom: string | null;
  parType: Partial<Record<Exclude<CleCategorie, 'autre'>, number>>; // 0 absent = 0 (le rendu lit `?? 0`)
  total: number;
  canal?: string | null; // D2 : canal de la commune (mairie_contact) — SCOPE process d'affichage. Optionnel (compat des littéraux/fixtures).
}

/**
 * Agrège le stock par commune : ne compte QUE les dossiers à la fois ÉLIGIBLES (`estCandidatEligible` — exclut annulé,
 * absent du millésime, hors fenêtre d'éligibilité, déjà rattaché, sans canal, courrier) ET dans la fenêtre d'AFFICHAGE
 * « moins de 6 mois » (`dateReelleAutorisation >= dateMin6mois`). La date est non-nulle dès que le dossier est éligible
 * (hors_fenetre écarte les dates nulles), mais on garde le test explicite pour que la fonction soit correcte quelle que
 * soit l'entrée (testée avec des dossiers hors fenêtre fabriqués). Tri : immeubles décroissant, puis total, puis nom.
 * PURE — aucune I/O, aucune redéfinition d'éligibilité ni de catégorie.
 */
export function agregerStock(
  dossiers: DossierStock[], dateMin: string | null, dejaRattaches: ReadonlySet<number>, dateMin6mois: string,
): LigneStock[] {
  const parCommune = new Map<string, LigneStock>();
  for (const { candidat, categorie } of dossiers) {
    if (!estCandidatEligible(candidat, dateMin, dejaRattaches)) continue; // MÊME définition que proposerLots (Q2a)
    const d = candidat.dateReelleAutorisation;
    if (d === null || d < dateMin6mois) continue;                          // borne d'AFFICHAGE 6 mois (sous-ensemble)
    if (categorie === 'autre') continue;                                   // pas de colonne « autre » (voir CATEGORIES_STOCK)
    const l = parCommune.get(candidat.codeInsee)
      ?? { codeInsee: candidat.codeInsee, communeNom: candidat.communeNom, parType: {}, total: 0, canal: candidat.canal ?? null };
    l.parType[categorie] = (l.parType[categorie] ?? 0) + 1;
    l.total += 1;
    parCommune.set(candidat.codeInsee, l);
  }
  return [...parCommune.values()].sort((a, b) => {
    const nomA = a.communeNom ?? a.codeInsee, nomB = b.communeNom ?? b.codeInsee;
    return (b.parType.immeuble_neuf ?? 0) - (a.parType.immeuble_neuf ?? 0)
      || b.total - a.total
      || (nomA < nomB ? -1 : nomA > nomB ? 1 : 0);
  });
}

// ── Panneau de détail : périodes de recherche (6 mois par défaut → jusqu'à l'origine) ─────────────────────────────────
export interface PeriodeStock { cle: string; libelle: string; mois: number | null } // mois null = depuis l'origine

/** Périodes proposées dans le panneau de détail. La 1re (6 mois) est le DÉFAUT ; « origine » (mois null) élargit à tout l'historique. */
export const PERIODES_STOCK: readonly PeriodeStock[] = [
  { cle: '6m', libelle: '6 derniers mois', mois: 6 },
  { cle: '12m', libelle: '12 derniers mois', mois: 12 },
  { cle: '24m', libelle: '24 derniers mois', mois: 24 },
  { cle: 'origine', libelle: 'Depuis l’origine', mois: null },
];
export const PERIODE_STOCK_DEFAUT = '6m';

/**
 * Nombre de mois d'une clé de période (null = depuis l'origine). Clé inconnue/absente → DÉFAUT 6 mois (jamais « origine »
 * par erreur, ce qui déclencherait la requête la plus large sur une entrée invalide). PURE.
 */
export function moisDePeriode(cle: string | null): number | null {
  const p = PERIODES_STOCK.find((x) => x.cle === cle);
  return p ? p.mois : FENETRE_STOCK_MOIS;
}
