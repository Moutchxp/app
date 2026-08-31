/**
 * LOT 20/27 — prédicat PUR « cette étape fait-elle partie des N DERNIÈRES du parcours ? » — SANS AUCUN import (ni DB, ni serveur), pour
 * être utilisable AUSSI côté CLIENT (frise du suivi) sans tirer le driver `pg` dans le bundle. Extrait de `destinatairesCommune.ts`
 * (LOT 20) au LOT 27, quand la frise en a eu besoin. `destinatairesCommune` le RÉEXPORTE pour ne pas casser les importeurs serveur.
 *
 * Ordinaire : rangs rappel=1 / avis=2 / saisine=3, total=3. Partiel : relances 1..N puis annonce (rang N+1), total=N+1.
 * `nbDernieres=0` → aucune ; `nbDernieres≥total` → toutes.
 */
export function estParmiDernieres(rang: number, total: number, nbDernieres: number): boolean {
  return nbDernieres > 0 && rang > total - nbDernieres;
}
