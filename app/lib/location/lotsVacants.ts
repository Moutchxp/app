/**
 * ══ 🔴🔴 LE NOMBRE DE LOTS VACANTS, DANS LE TITRE DE LA LOCATION (Arno, 27/11/2026, 23h30, point 6). MODULE PUR. ═══════════════════════════════════════
 *
 * « en première ligne, dans la continuité du titre "Location", mettre entre parenthèses juste après, à droite, le nombre de lots disponibles à l'instant T,
 * en dynamique » → « Location (Nombre de lots vacants : 3) ».
 * LA RÈGLE (choix de Claude, à valider par Arno) :
 *   · un bien ACTIF du portefeuille : en gestion OU en location seule, présent au dernier export, non sorti du portefeuille (sqlBienDuPortefeuille) ;
 *   · VACANT : aucun locataire EN PLACE à l'instant — une occupation est en place si elle est entrée (entrée vide ou ≤ aujourd'hui, heure de Paris) et
 *     pas encore sortie (sortie vide ou postérieure à aujourd'hui : le jour de la sortie, le logement est libre) ; un préavis ne libère rien ;
 *   · une ANNEXE (cave, parking) RATTACHÉE à un logement ne compte pas à part (elle suit son logement) ; une annexe louée SEULE (jamais rattachée, ou
 *     détachée) compte comme un lot.
 * Le serveur calcule à chaque affichage ; la même règle partout (lotsVacants).
 */
export interface OccupationDuLot { entree: string | null; sortie: string | null }
export interface LotPourVacance { id: number; annexeRattachee: boolean; occupations: readonly OccupationDuLot[] }

/** Une occupation en place le jour donné (AAAA-MM-JJ). PUR. */
export function occupationEnPlace(o: OccupationDuLot, aujourdhui: string): boolean {
  const entree = (o.entree ?? '').slice(0, 10); const sortie = (o.sortie ?? '').slice(0, 10);
  return (entree === '' || entree <= aujourdhui) && (sortie === '' || sortie > aujourdhui);
}

/** Les lots vacants : actifs (déjà filtrés par la lecture), hors annexes rattachées, sans occupation en place. PUR. */
export function lotsVacants(lots: readonly LotPourVacance[], aujourdhui: string): LotPourVacance[] {
  return lots.filter((l) => !l.annexeRattachee && !l.occupations.some((o) => occupationEnPlace(o, aujourdhui)));
}

/** « Location (Nombre de lots vacants : 3) » ; sans nombre (lecture impossible) : « Location ». PUR. */
export function titreLocation(n: number | null): string {
  return n === null ? 'Location' : `Location (Nombre de lots vacants : ${n})`;
}
