/**
 * Logique PURE de la bulle d'information « année de construction » (carte de curation).
 *
 * ISOLATION (invariant SVAV) : aucune dépendance Leaflet, DOM, réseau ni moteur (`app/lib/svv/**`).
 * Uniquement des fonctions déterministes → testables unitairement (comme `curationEdition.ts`).
 *
 * L'année provient de `bdnb_annee_batiment.annee_construction` (LEFT JOIN par `cleabs`), exposée par
 * la route emprises. C'est une AIDE UI en LECTURE SEULE : elle n'entre dans AUCUN calcul de verdict
 * ni de score. Couverture partielle et fracturée (souvent absente dans Paris) → l'absence DOIT être
 * affichée explicitement, jamais par un vide (sinon l'internaute croit à un bug).
 */

/** Libellé affiché dans la bulle : année connue → « Construit en 1954 » ; sinon message explicite. */
export function libelleAnnee(annee: number | null | undefined): string {
  if (typeof annee === 'number' && Number.isFinite(annee)) {
    // BDNB : `annee_construction` est TOUJOURS un entier (millésime). Affiché brut, sans arrondi ni séparateur.
    return `Construit en ${annee}`;
  }
  return 'Année de construction non renseignée';
}

/**
 * Contenu HTML de la bulle Leaflet (popup). `role="status"` → le libellé est annoncé aux lecteurs
 * d'écran à l'ouverture. AUCUNE donnée non maîtrisée n'est injectée : le seul texte variable est
 * l'année, un entier passé par `libelleAnnee` (pas de `cleabs` ni de contenu arbitraire) → pas de
 * surface d'injection. Aucun jargon de source dans la bulle (BDNB/DGFiP vivent dans l'aide du bouton).
 */
export function contenuBulleAnnee(annee: number | null | undefined): string {
  return `<span class="svv-cur-bulle" role="status">${libelleAnnee(annee)}</span>`;
}

/**
 * Règle de résolution du conflit d'interaction sur la couche de fond : le double-clic crée un tag
 * UNIQUEMENT quand le mode bulle est INACTIF. Mode bulle actif → la création par double-clic est
 * SUSPENDUE (le geste sert alors la lecture). Le rattachement (couche bleue, au-dessus) garde sa
 * priorité indépendamment de ce drapeau : il est intercepté avant d'atteindre la couche de fond.
 */
export function doitCreerAuDoubleClic(modeBulle: boolean): boolean {
  return !modeBulle;
}
