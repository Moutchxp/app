import type { EtatSuivi } from './rattachementSuiviRepo';

/**
 * L6 (règle Arno, 23/08/2026) — COUPURE EN DEUX du suivi de rattachement. SOURCE DE VÉRITÉ UNIQUE, partagée par le TRI (repo,
 * `trierLignesSuivi`) ET l'AFFICHAGE (front, `TableSuivi`) — jamais deux listes d'états à maintenir.
 *
 * GROUPE 1 « rattachement à faire » = l'arbitrage est OUVERT et une décision humaine est ATTENDUE. DEUX états : `arbitrage_demande`
 *   (le moteur a détecté un changement mais ne sait pas trancher seul) et — ÉTAGE 1 — `acheve_sans_bati` (achèvement déclaré sur un
 *   permis sans signal géométrique possible : Arno doit confirmer et clore). Les autres n'en sont PAS : `valide` = rattachement
 *   automatique déjà conclu ; `refuse` / `annule_par_lidar` / `clos_sans_bati` = terminaux ; `en_attente_bati` = affectation fermée,
 *   en attente du bâti dans BD TOPO ; `suivi_aucun_signal` = aucun déclencheur.
 * GROUPE 2 « en attente d'une mise à jour » = tout le reste.
 *
 * ⚠️ NE PAS réinverser : priorité ABSOLUE au groupe 1, trié par date de DÉCLENCHEMENT décroissante ; le groupe 2 par date de
 * PERMIS décroissante. (Remplace l'échelle d'urgence multi-états de L1.) Import de type UNIQUEMENT depuis le repo (erasé au build) :
 * ce module reste pur et client-safe (aucune dépendance runtime vers db/client). SOURCE UNIQUE de la pastille « Rattachement » (cf. `compterRattachement`).
 */
export const ETATS_A_FAIRE: readonly EtatSuivi[] = ['arbitrage_demande', 'acheve_sans_bati'];

/** Le dossier est-il dans le GROUPE 1 (« rattachement à faire », arbitrage ouvert) ? */
export function estAFaire(etat: EtatSuivi): boolean {
  return ETATS_A_FAIRE.includes(etat);
}

export const GROUPE1_TITRE = 'Rattachement à faire';
export const GROUPE2_TITRE = 'En attente d’une mise à jour';
// RATT-1 (décision Arno, 30/08/2026) — 3e groupe, REPLIÉ par défaut à l'affichage : les permis surveillés dont le DOSSIER est
//   diagnostiqué « incomplet » (au moins une pièce attendue manque). Ils se noyaient dans « En attente d'une mise à jour » et faisaient
//   croire à une progression (cas Aubervilliers). « Jamais diagnostiqué » ≠ « incomplet » → hors de ce groupe.
export const GROUPE_INCOMPLET_TITRE = 'Permis avec dossier incomplet';

/** Forme minimale groupable : l'état de suivi + le signal dérivé « dossier incomplet » + la VALIDATION acquise (LOT 77). */
export interface LigneGroupable { etat: EtatSuivi; completudeIncomplete: boolean; validationAcquise: boolean }

/**
 * LOT 77 (règle Arno) — la VALIDATION du permis est-elle ACQUISE ? = empreinte/projection validée ET AU MOINS UN corps déclaré ET
 * TOUS les corps ont leur altitude de sommet (nbCorpsSansAltitude === 0). 🔴 PIÈGE LOT 71 : `0 corps` NE VAUT PAS « toutes les
 * altitudes validées » — `nbCorps >= 1` est EXIGÉ, sinon un permis sans aucun bâtiment basculerait « validé » par vacuité. PURE.
 */
export function estValidationAcquise(projectionValidee: boolean, nbCorps: number, nbCorpsSansAltitude: number): boolean {
  return projectionValidee && nbCorps >= 1 && nbCorpsSansAltitude === 0;
}

/**
 * RATT-1 + LOT 77 — PARTITION du suivi en TROIS groupes, EXCLUSIVE et EXHAUSTIVE (chaque ligne dans un seul groupe ; la somme des
 * trois vaut toujours le total). SOURCE UNIQUE, partagée par le tri et l'affichage. Priorités :
 *  ① « à faire » (`estAFaire`) — PRIORITÉ ABSOLUE inchangée : un arbitrage ouvert reste visible même si le dossier est incomplet.
 *  ② « incomplet » — MAIS seulement si la VALIDATION N'EST PAS acquise. 🔴 LOT 77 : quand l'instruction est terminée (empreinte +
 *     altitudes de TOUS les corps validées), la complétude DOCUMENTAIRE ne décide plus du groupe — le permis va en « en attente »
 *     même s'il manque une pièce en GED (l'info d'incomplétude n'est pas perdue : elle reste sur la ligne, cf. `completudeIncomplete`).
 *  ③ « en attente » — le reste (dont les validés-incomplets).
 * Tout reste DÉRIVÉ (aucun état stocké) et réversible : un permis qui PERD sa validation (un corps perd son altitude) et reste
 * incomplet RETOMBE en « incomplet ». Préserve l'ordre d'entrée. PUR (aucune I/O).
 */
export function partitionnerSuivi<T extends LigneGroupable>(lignes: readonly T[]): { aFaire: T[]; incomplets: T[]; enAttente: T[] } {
  const aFaire: T[] = [], incomplets: T[] = [], enAttente: T[] = [];
  for (const l of lignes) {
    if (estAFaire(l.etat)) aFaire.push(l);                              // ① priorité absolue : arbitrage ouvert
    else if (l.completudeIncomplete && !l.validationAcquise) incomplets.push(l); // ② incomplet ET pas encore validé
    else enAttente.push(l);                                            // ③ le reste, dont les VALIDÉS-incomplets (LOT 77)
  }
  return { aFaire, incomplets, enAttente };
}
