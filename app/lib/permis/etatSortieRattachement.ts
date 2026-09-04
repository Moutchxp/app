/**
 * LOT 71 — ÉTAT des CONDITIONS de la SORTIE DÉFINITIVE vers Rattachement (carte « Terminer l'analyse », LOT 51-C). PUR (client-safe).
 *
 * 🔴 RÈGLE D'ARNO (au-delà de ce cas) : « n'écrire une info de VALIDATION que quand je peux la vérifier en visuel ». Un ENSEMBLE VIDE
 *   ne SATISFAIT pas une condition — il la rend SANS OBJET, un TROISIÈME état distinct de « satisfaite » et « non satisfaite ». La
 *   condition « altitudes de sommet renseignées » se calculait sur `nbSansAltitude === 0` : SANS aucun corps, le compte vaut 0 → vert
 *   MENSONGER (rien n'est renseigné, il n'y a rien à renseigner, Arno ne peut RIEN vérifier). On introduit l'état SANS OBJET ; il ne
 *   compte JAMAIS comme satisfait pour la sortie.
 *
 * On ne change PAS la sémantique de la condition (l'altitude reste l'altitude) : on ne traite QUE le cas de l'ensemble vide.
 */
export type EtatConditionSortie = 'satisfaite' | 'non_satisfaite' | 'sans_objet';
export type TonCondition = 'vert' | 'rouge' | 'neutre';
export interface ConditionSortie { etat: EtatConditionSortie; ton: TonCondition; texte: string }

/**
 * Condition « altitudes de sommet (NGF) renseignées » de la sortie. Trois états :
 *  - AUCUN bâtiment déclaré → SANS OBJET (neutre) : rien à renseigner, rien à vérifier → ne satisfait PAS la sortie ;
 *  - ≥ 1 bâtiment MAIS certains sans altitude → NON SATISFAITE (rouge) ;
 *  - ≥ 1 bâtiment ET tous avec leur altitude → SATISFAITE (vert) — le seul cas VÉRIFIABLE à l'écran.
 */
export function conditionAltitudeSortie(nbBatiments: number, nbSansAltitude: number): ConditionSortie {
  if (nbBatiments <= 0) {
    return { etat: 'sans_objet', ton: 'neutre', texte: 'aucun bâtiment déclaré — rien à renseigner (ajoutez un bâtiment et son altitude de sommet dans « Caractéristiques du permis »)' };
  }
  if (nbSansAltitude > 0) {
    return { etat: 'non_satisfaite', ton: 'rouge', texte: `${nbSansAltitude} bâtiment(s) sans altitude de sommet (NGF) — à renseigner dans « Caractéristiques du permis »` };
  }
  return { etat: 'satisfaite', ton: 'vert', texte: '✓ altitudes de sommet (NGF) renseignées' };
}

/**
 * La sortie n'est PRÊTE que si l'empreinte est validable ET la condition altitude est SATISFAITE. 🔴 « sans_objet » (ensemble vide)
 * ne compte JAMAIS comme satisfait : un premier verrou qui mentirait (vert sur du vide) ne doit pas être masqué par le second.
 * Sémantique de la double condition inchangée hors cas vide : `empreinteValidable` requiert déjà ≥ 1 bâtiment (PROJ-3b), donc pour un
 * dossier réel non vide `pretPourSortie === empreinteValidable && (nbSansAltitude === 0)`, comme avant.
 */
export function pretPourSortie(empreinteValidable: boolean, altitude: EtatConditionSortie): boolean {
  return empreinteValidable && altitude === 'satisfaite';
}
