/**
 * ══ 🔴 Arno (10/11/2026) — LES LIGNES DE TITRE REPLIÉES DE L'ÉCRAN PARTAGÉ, HARMONISÉES ══════════════════════════════════════════
 *
 * Arno : « harmonise les deux lignes de titre repliées (Tâches et Préavis) : même taille, même hauteur, même style. Présentation
 * uniquement. » UNE feuille pour les deux blocs (`TableauTaches`, `BlocPreavisAccueil`), posée SEULEMENT quand ils sont repliés : le même
 * cadre (celui du bloc Tâches), le même titre, la même flèche, le même repère rouge. Ouverts, chacun garde exactement sa présentation.
 * Spécificité doublée (`.blr-bloc.blr-bloc`) : elle l'emporte sur la feuille propre de chaque bloc, quel que soit l'ordre des feuilles.
 * AUCUN ACCENT GRAVE DANS LE LITTERAL. Jetons du thème seulement ; cible de 44 px.
 */
export const CLASSES_BLOC_REPLIE = { bloc: 'blr-bloc', titre: 'blr-titre', bouton: 'blr-repli', fleche: 'blr-fleche', alerte: 'blr-alerte' } as const;

export const CSS_BLOC_REPLIE = `
.blr-bloc.blr-bloc{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;box-sizing:border-box;min-height:74px;margin:18px 0 8px;padding:14px;
  border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.blr-bloc.blr-bloc > *{flex:1 1 auto;min-width:0;margin:0}
.blr-bloc.blr-bloc .blr-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0;font-size:15px;font-weight:700;line-height:1.3;color:var(--color-svv-ink)}
.blr-bloc.blr-bloc .blr-repli{appearance:none;border:0;background:none;padding:0;margin:0;min-height:44px;font:inherit;color:inherit;display:inline-flex;align-items:center;gap:.4rem;cursor:pointer}
.blr-bloc.blr-bloc .blr-fleche{display:inline-block;width:1em;font-size:15px}
.blr-bloc.blr-bloc .blr-alerte{margin-left:.6rem;font-size:14px;font-weight:800;line-height:1.3;color:var(--color-svv-red)}
`;
