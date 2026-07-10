/**
 * Logique PURE de la bulle d'information « bâtiment » (carte de curation) : année de construction
 * ET nombre d'étages. Anciennement `bulleAnnee.ts` — renommé quand la bulle est passée à deux données.
 *
 * ISOLATION (invariant SVAV) : aucune dépendance Leaflet, DOM, réseau ni moteur (`app/lib/svv/**`).
 * Uniquement des fonctions déterministes → testables unitairement (comme `curationEdition.ts`).
 *
 * Les deux valeurs proviennent de `bdtopo_batiment` (année via LEFT JOIN `bdnb_annee_batiment`,
 * étages = colonne `nombre_d_etages` de la même table — aucune jointure), exposées par la route
 * emprises. C'est une AIDE UI en LECTURE SEULE : elle n'entre dans AUCUN calcul de verdict ni de
 * score. Couverture partielle → chaque absence DOIT être affichée explicitement, jamais par un vide.
 *
 * ⚠️ `0` étage est une VRAIE valeur (≠ `null`) : elle s'affiche « 0 étage » telle quelle. Ne JAMAIS
 * la traiter comme « non renseignée » (aucun test falsy `!etages` / `etages ? … : …` — un `0` serait
 * avalé). Distinction VALEUR (nombre fini, y compris 0) vs ABSENCE (`null`/`undefined`).
 */

/** Ligne « année » : année connue → « Construit en 1954 » ; sinon message explicite (jamais un vide). */
export function libelleAnnee(annee: number | null | undefined): string {
  if (typeof annee === 'number' && Number.isFinite(annee)) {
    // BDNB : millésime entier. Affiché brut, sans arrondi ni séparateur de milliers.
    return `Construit en ${annee}`;
  }
  return 'Année de construction non renseignée';
}

/**
 * Ligne « étages » : nombre connu (Y COMPRIS 0) → « N étage(s) » ; sinon message explicite. Le test
 * est `typeof number` (PAS falsy) → `0` est une valeur affichée « 0 étage », jamais « non renseigné ».
 * Pluriel : singulier pour |n| < 2 (« 0 étage », « 1 étage »), pluriel au-delà (« 2 étages »).
 */
export function libelleEtages(etages: number | null | undefined): string {
  if (typeof etages === 'number' && Number.isFinite(etages)) {
    return `${etages} étage${Math.abs(etages) < 2 ? '' : 's'}`;
  }
  return 'Nombre d’étages non renseigné';
}

/**
 * Contenu HTML de la bulle Leaflet (popup) : DEUX lignes indépendantes (année puis étages), chacune
 * gérant sa propre absence — les deux absences peuvent donc s'empiler. `role="status"` → l'ensemble
 * est annoncé aux lecteurs d'écran à l'ouverture. Seules variables injectées : deux entiers passés par
 * `libelleAnnee`/`libelleEtages` (pas de `cleabs` ni de contenu arbitraire) → aucune surface d'injection.
 * Aucun jargon de source (BDNB/DGFiP/BD TOPO vivent dans l'aide du bouton, jamais dans la bulle).
 */
export function contenuBulleBatiment(
  annee: number | null | undefined,
  etages: number | null | undefined,
): string {
  return (
    `<span class="svv-cur-bulle" role="status">` +
    `<span class="svv-cur-bulle-l">${libelleAnnee(annee)}</span>` +
    `<span class="svv-cur-bulle-l">${libelleEtages(etages)}</span>` +
    `</span>`
  );
}

/**
 * Règle de résolution du conflit d'interaction sur la couche de fond : le double-clic crée un tag
 * UNIQUEMENT quand le mode bulle est INACTIF. Mode bulle actif → la création par double-clic est
 * SUSPENDUE (le geste sert alors la lecture). Le rattachement (couche bleue, pane au-dessus) garde sa
 * priorité indépendamment de ce drapeau. (Règle ACQUISE au lot précédent, inchangée ici.)
 */
export function doitCreerAuDoubleClic(modeBulle: boolean): boolean {
  return !modeBulle;
}
