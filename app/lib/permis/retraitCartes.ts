/**
 * BAT-3 — DÉCISION PURE du changement de NOMBRE de bâtiments (nb_batiments_valide) et du RETRAIT NON DESTRUCTIF des cartes en trop.
 * Aucune I/O. Deux décisions séparées, testables sans base :
 *
 *  1. `planRetraitCartes(cartes, cible)` — le PLAN déterministe pour atteindre `cible` cartes actives :
 *       · cible ≥ actuel → CRÉER (cible − actuel) cartes vides, RIEN à retirer, aucune confirmation (geste anodin — BAT-1) ;
 *       · cible < actuel → RETIRER (actuel − cible) cartes. ORDRE (décision porteur) : cartes VIDES d'abord (ni sommet, ni emprise,
 *         ni repère, ni mesure), les PLUS RÉCENTES en premier (id DESC) ; on ne « franchit » vers une carte PORTEUSE DE VALEUR que
 *         si les vides ne suffisent pas. `besoinConfirmation` = le plan touche ≥ 1 carte porteuse de valeur → l'écran EXIGE une
 *         confirmation récapitulative NOMMANT les cartes (dont celles à ALTITUDE VALIDÉE). Les cartes VIDES partent sans confirmation.
 *
 *  2. `selectionRetraitValide(cartes, corpsIds, cible)` — VALIDE une sélection EXPLICITE de cartes à retirer (le « choix réel » offert à
 *       l'écran quand plusieurs cartes porteuses de valeur sont éligibles) : la sélection doit ne contenir que des cartes ACTIVES du
 *       dossier ET compter EXACTEMENT (actuel − cible) cartes. Renvoie le détail nommé + `besoinConfirmation`, ou un motif de refus.
 *
 * 🔴 DÉTERMINISTE : le tri ne dépend d'aucune horloge ni hasard (id DESC = ordre de création inverse). « vide » et « valideeAltitude »
 *    sont FOURNIS par l'appelant (lus en base) — ce module ne les recalcule pas.
 */

/** Une carte active, réduite aux signaux nécessaires à la décision. `id` croissant = ordre de création (id DESC = plus récente). */
export interface CartePourPlan {
  id: number;
  vide: boolean;            // aucune valeur : ni altitude de sommet, ni emprise, ni repère, ni aucune mesure
  valideeAltitude: boolean; // altitude de sommet VALIDÉE (confirme_le posé) — drapeau NOMMÉ dans la confirmation
  nom: string;              // libellé humain stable (repère / nom de repli / « bâtiment {id} »)
}

/** Une carte que le plan désigne au retrait, avec de quoi la NOMMER et dire si elle porte une valeur validée. */
export interface CarteRetiree { id: number; nom: string; vide: boolean; valideeAltitude: boolean }

export interface PlanRetrait {
  actuel: number;               // nombre de cartes actives AVANT
  cible: number;                // nombre visé (borné à ≥ 0)
  aCreer: number;               // cartes vides à créer (0 si diminution/égalité)
  aRetirer: CarteRetiree[];     // cartes à retirer, DANS L'ORDRE de retrait (vides d'abord, puis récentes) ; [] si création/égalité
  besoinConfirmation: boolean;  // le plan touche ≥ 1 carte porteuse de valeur → confirmation récapitulative EXIGÉE
}

const detail = (c: CartePourPlan): CarteRetiree => ({ id: c.id, nom: c.nom, vide: c.vide, valideeAltitude: c.valideeAltitude });

/** ORDRE de retrait (décision porteur) : cartes VIDES d'abord, puis DANS CHAQUE groupe les PLUS RÉCENTES (id DESC). Déterministe. */
function ordreRetrait(cartes: readonly CartePourPlan[]): CartePourPlan[] {
  return [...cartes].sort((a, b) => (a.vide !== b.vide ? (a.vide ? -1 : 1) : b.id - a.id));
}

export function planRetraitCartes(cartes: readonly CartePourPlan[], nombreCible: number): PlanRetrait {
  const actuel = cartes.length;
  const cible = Math.max(0, Math.trunc(Number.isFinite(nombreCible) ? nombreCible : actuel));
  if (cible >= actuel) return { actuel, cible, aCreer: cible - actuel, aRetirer: [], besoinConfirmation: false };
  const aRetirer = ordreRetrait(cartes).slice(0, actuel - cible).map(detail);
  return { actuel, cible, aCreer: 0, aRetirer, besoinConfirmation: aRetirer.some((c) => !c.vide) };
}

export type SelectionRetrait =
  | { ok: true; aRetirer: CarteRetiree[]; besoinConfirmation: boolean }
  | { ok: false; motif: string };

/**
 * VALIDE une sélection EXPLICITE `corpsIds` (le « choix réel » de l'écran) pour atteindre `cible`. Refuse — sans rien retirer — si un id
 * n'est pas une carte ACTIVE du dossier (doublons neutralisés) ou si le compte ne fait pas EXACTEMENT (actuel − cible). L'ordre du détail
 * suit `ordreRetrait` (stable), indépendamment de l'ordre de saisie.
 */
export function selectionRetraitValide(cartes: readonly CartePourPlan[], corpsIds: readonly number[], nombreCible: number): SelectionRetrait {
  const actuel = cartes.length;
  const cible = Math.max(0, Math.trunc(Number.isFinite(nombreCible) ? nombreCible : actuel));
  const attendu = Math.max(0, actuel - cible);
  const parId = new Map(cartes.map((c) => [c.id, c]));
  const uniques = [...new Set(corpsIds)];
  if (uniques.some((id) => !parId.has(id))) return { ok: false, motif: 'sélection invalide : une carte visée n’est pas une carte active de ce permis' };
  if (uniques.length !== attendu) return { ok: false, motif: `sélection invalide : ${attendu} carte(s) à retirer attendue(s), ${uniques.length} fournie(s)` };
  const choisies = new Set(uniques);
  const aRetirer = ordreRetrait(cartes.filter((c) => choisies.has(c.id))).map(detail);
  return { ok: true, aRetirer, besoinConfirmation: aRetirer.some((c) => !c.vide) };
}
