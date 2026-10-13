/**
 * ══ 🔴🔴 LOT PLEIN-ECRAN-COMPOSEUR (Arno, 13/10/2026) — LE PLEIN ÉCRAN DU COMPOSEUR, UN SEUL COMPORTEMENT PARTAGÉ ═══════
 *
 * CONSTAT D'ARNO (fiche du 7 avenue de l'Union → « Répondre » sous un mail de l'historique → plein écran) : fond gris
 * et semi-transparent, la page se voit à travers ; la fenêtre ne couvre pas l'écran ; « Réduire » flotte au milieu.
 *
 * CAUSE (la réponse en place, `.red--plein` de `Redaction.tsx`) :
 *   ① le voile était un `::before` en `position:fixed` ; or la fenêtre portait un `transform` (centrage) : ce
 *     `transform` devient le REPÈRE des descendants fixes, le voile ne couvrait donc que la fenêtre, et — enfant à
 *     `z-index:-1` d'un contexte d'empilement — il se peignait PAR-DESSUS son fond : fenêtre grise, page non voilée ;
 *   ② une fenêtre centrée de 900 px avec 4vh de marge haut et bas, et la règle `.red` (padding 12px 0), écrite
 *     APRÈS dans la même feuille et de même poids, qui lui ôtait ses marges intérieures ;
 *   ③ l'en-tête répartissait trois éléments (`space-between`) : le bouton du milieu restait au milieu.
 * Le plein écran de la boîte (`.fre--plein`) n'avait pas ①, mais restait une fenêtre centrée de 900 px.
 *
 * 🔴 LE REMÈDE, ÉCRIT ICI UNE FOIS, employé par les DEUX cadres (`.red--plein` et `.fre--plein`) : la fenêtre couvre
 * TOUTE la zone de travail, à droite de la colonne « Admin SVAV® » (240 px dès 768 px, cf. `Sidebar.tsx`), tout
 * l'écran sur téléphone ; fond OPAQUE du thème ; AUCUN `transform` ; défilement interne. La colonne de gauche est
 * voilée par une OMBRE portée hors de la fenêtre (jamais un pseudo-élément qui pourrait repasser dessus).
 *
 * PUR.
 */

/** La largeur de la colonne « Admin SVAV® » sur grand écran — la même que `.svv-adm-sidebar` (Sidebar.tsx). */
export const LARGEUR_COLONNE_ADMIN_PX = 240;
export const SEUIL_COLONNE_ADMIN_PX = 768;

/**
 * LES RÈGLES DU PLEIN ÉCRAN pour un sélecteur donné. Le sélecteur doit être assez précis pour l'emporter sur la règle
 * de base du cadre (ex. `.red.red--plein`, et non `.red--plein` seul). ⚠️ Aucun accent grave : texte de feuille.
 */
export function cssPleinEcranComposeur(selecteur: string): string {
  return `
${selecteur}{position:fixed;top:0;right:0;bottom:0;left:0;transform:none;width:auto;max-width:none;max-height:none;
  margin:0;border:0;border-radius:0;z-index:60;background:var(--color-svv-surface);overflow-y:auto;
  box-shadow:0 0 0 100vmax color-mix(in srgb, var(--color-svv-ink) 42%, transparent)}
${selecteur}::before{content:none;display:none}
@media (min-width:${SEUIL_COLONNE_ADMIN_PX}px){${selecteur}{left:${LARGEUR_COLONNE_ADMIN_PX}px}}
`;
}
