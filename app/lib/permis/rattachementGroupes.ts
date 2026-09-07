import type { EtatSuivi } from './rattachementSuiviRepo';

/**
 * LOT COMPLET (règle Arno, 07/09/2026) — L'ONGLET est décidé par « FRANCHI LE PROCESS » (validationAcquise), plus par la détection
 * d'un signal. SOURCE DE VÉRITÉ UNIQUE, partagée par le TRI (repo, `trierLignesSuivi`) ET l'AFFICHAGE (front, `TableSuivi`).
 *
 * CONDITION D'ENTRÉE dans « Rattachement », unique et suffisante : `validationAcquise` (toutes les altitudes de sommet ET toutes les
 *   emprises des bâtiments VALIDÉES). Rien d'autre — en particulier PAS la détection d'un signal BD TOPO.
 * DEUX CATÉGORIES à l'intérieur, un permis passe de l'une à l'autre SANS CHANGER D'ONGLET :
 *   ① « Rattachement à faire » — un signal de mise à jour BD TOPO a été détecté (arbitrage ouvert `estAFaire`, OU une alerte de
 *      surveillance de polygone `alertesSurveillance > 0` : une alerte polygone sur un permis VALIDÉ EST « un signal BD TOPO détecté,
 *      décision attendue »). AFFICHÉE EN TÊTE. SEULE catégorie comptée par la pastille de l'onglet.
 *   ② « Validés — en attente du signal de mise à jour » — validés, aucun signal pour l'instant. AFFICHÉE EN DESSOUS.
 *   Le signal ne fait QUE faire monter un permis de ② vers ① ; il ne commande ni l'entrée dans l'onglet ni la sortie.
 * « Sous surveillance » garde TOUT LE RESTE : les permis NON validés (« Permis suivis, non instruits » + 3e groupe « dossier incomplet »).
 *
 * ⚠️ PIÈGE DE VOCABULAIRE (levé ici) — « En attente d'une mise à jour » désignait AUTREFOIS la liste de « Sous surveillance ». Deux
 *   populations OPPOSÉES ne doivent JAMAIS porter le même libellé : dans « Rattachement », ② = permis ENTIÈREMENT VALIDÉS attendant le
 *   signal → `RATT_VALIDES_TITRE` (« Validés — … ») ; dans « Sous surveillance », la liste = permis SUIVIS et NON INSTRUITS →
 *   `SURV_SUIVIS_TITRE` (« Permis suivis, non instruits »). Le mot « validés » vs « non instruits » rend les deux populations non confondables.
 *
 * Import de type UNIQUEMENT depuis le repo (effacé au build) : ce module reste pur et client-safe. SOURCE UNIQUE de la pastille
 * « Rattachement » (= catégorie ①, cf. `compterRattachement`).
 */
export const ETATS_A_FAIRE: readonly EtatSuivi[] = ['arbitrage_demande', 'acheve_sans_bati'];

/** L'état de suivi porte-t-il un arbitrage OUVERT (un des signaux de la catégorie ①) ? (l'alerte de surveillance est l'autre signal.) */
export function estAFaire(etat: EtatSuivi): boolean {
  return ETATS_A_FAIRE.includes(etat);
}

/** Un permis VALIDÉ porte-t-il un SIGNAL de mise à jour BD TOPO (→ catégorie ① « Rattachement à faire ») ? Arbitrage ouvert OU alerte polygone. */
export function aSignalMiseAJour(l: Pick<LigneGroupable, 'etat' | 'alertesSurveillance'>): boolean {
  return estAFaire(l.etat) || l.alertesSurveillance > 0;
}

export const GROUPE1_TITRE = 'Rattachement à faire';
// ② de « Rattachement » : permis ENTIÈREMENT VALIDÉS, en veille du signal. Libellé DISTINCT de la liste de « Sous surveillance » (homonymie levée).
export const RATT_VALIDES_TITRE = 'Validés — en attente du signal de mise à jour';
// « Sous surveillance » (liste principale) : permis SUIVIS et NON INSTRUITS. Remplace l'ancien « En attente d'une mise à jour » (homonyme du ②).
export const SURV_SUIVIS_TITRE = 'Permis suivis, non instruits';
// RATT-1 (décision Arno, 30/08/2026) — 3e groupe de « Sous surveillance », REPLIÉ par défaut : les permis surveillés dont le DOSSIER est
//   diagnostiqué « incomplet » (au moins une pièce attendue manque). « Jamais diagnostiqué » ≠ « incomplet » → hors de ce groupe.
export const GROUPE_INCOMPLET_TITRE = 'Permis avec dossier incomplet';

/** Forme minimale groupable : état de suivi + signal dérivé « dossier incomplet » + VALIDATION acquise (LOT 77) + alertes de surveillance (SURV-1). */
export interface LigneGroupable { etat: EtatSuivi; completudeIncomplete: boolean; validationAcquise: boolean; alertesSurveillance: number }

/**
 * 🔴 CRITÈRE « FRANCHI LE PROCESS » (règle Arno, durci depuis le LOT 77) — SOURCE UNIQUE, consommée par le REGROUPEMENT (validationAcquise)
 * ET le GARDE du bouton « Terminer l'analyse » (sortirTestVersRattachement). Un permis a franchi le process quand, pour TOUS ses
 * bâtiments déclarés : ① l'altitude de sommet est VALIDÉE (pas seulement renseignée) ET ② l'emprise du polygone projeté est VALIDÉE
 * (migration 206). Plus strict que le LOT 77 (qui n'exigeait que les altitudes RENSEIGNÉES + permis_projection). 🔴 PIÈGE LOT 71 :
 * `0 corps` NE VAUT PAS « tout validé » — `nbCorps >= 1` EXIGÉ (sinon un permis sans bâtiment franchirait par vacuité). PURE.
 */
export function estValidationAcquise(nbCorps: number, nbSansAltitudeValidee: number, nbSansEmpriseValidee: number): boolean {
  return nbCorps >= 1 && nbSansAltitudeValidee === 0 && nbSansEmpriseValidee === 0;
}

/**
 * LOT COMPLET — PARTITION du suivi en QUATRE groupes, EXCLUSIVE et EXHAUSTIVE (chaque ligne dans un seul groupe ; la somme des quatre
 * vaut toujours le total). SOURCE UNIQUE, partagée par le tri, l'affichage ET la pastille. L'appartenance à l'ONGLET dérive de
 * `validationAcquise` (« franchi le process »), plus d'un signal :
 *  — RATTACHEMENT (validationAcquise) :
 *      ① `rattAFaire`  = un signal de mise à jour a été détecté (`aSignalMiseAJour` : arbitrage ouvert OU alerte polygone) → décision attendue.
 *      ② `rattValides` = validé, aucun signal pour l'instant (en veille). Un signal fait passer un permis de ② vers ① SANS changer d'onglet.
 *  — SOUS SURVEILLANCE (NON validationAcquise) :
 *      `survIncomplets` = diagnostic « dossier incomplet » (au moins une pièce manque) ; `survSuivis` = suivi, non instruit (le reste).
 * Tout reste DÉRIVÉ (aucun état stocké) et réversible : un permis qui PERD sa validation RETOMBE en « Sous surveillance ». Préserve
 * l'ordre d'entrée. PUR (aucune I/O). 🔴 SOURCE UNIQUE : le garde du bouton « Terminer l'analyse », l'appartenance à Rattachement, la
 * catégorie interne et l'appartenance à Sous surveillance dérivent TOUS de `estValidationAcquise` — jamais de lectures parallèles (b7818ff).
 */
export function partitionnerSuivi<T extends LigneGroupable>(lignes: readonly T[]): { rattAFaire: T[]; rattValides: T[]; survSuivis: T[]; survIncomplets: T[] } {
  const rattAFaire: T[] = [], rattValides: T[] = [], survSuivis: T[] = [], survIncomplets: T[] = [];
  for (const l of lignes) {
    if (l.validationAcquise) {                                         // FRANCHI → RATTACHEMENT
      if (aSignalMiseAJour(l)) rattAFaire.push(l);                     //   ① signal BD TOPO détecté → décision attendue (en tête, pastille)
      else rattValides.push(l);                                       //   ② validé, en attente du signal (en dessous)
    } else if (l.completudeIncomplete) survIncomplets.push(l);        // NON validé → SURVEILLANCE : dossier incomplet
    else survSuivis.push(l);                                          //   sinon : suivi, non instruit
  }
  return { rattAFaire, rattValides, survSuivis, survIncomplets };
}
