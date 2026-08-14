/**
 * Constantes de la GED d'un permis — MODULE-FEUILLE VOLONTAIREMENT PROPRE (aucun import : ni `server-only`, ni base, ni
 * @aws-sdk). Il peut donc entrer dans le graphe STATIQUE d'un CLI sans réveiller le piège du 09/08 (un `import 'server-only'`
 * happé par un script). `demandeRepo` ré-exporte `MARQUEUR_FICHE_SYNTHESE` d'ici → une seule source de vérité.
 */

/**
 * N1-B — MARQUEUR d'une fiche de synthèse GÉNÉRÉE, posé dans `dossier_document.note` (colonne texte libre, migration 089).
 * Distingue la fiche des documents ajoutés à la main (origine 'genere' vs 'manuel'), garantit l'unicité par permis, interdit
 * sa suppression manuelle, et sert à l'EXCLURE de la lecture GED (N4 : c'est notre production, pas un document de mairie).
 * Valeur distinctive, jamais posée par un upload manuel (dont la `note` reste NULL) → aucune collision possible.
 */
export const MARQUEUR_FICHE_SYNTHESE = '__fiche_synthese_generee__';
