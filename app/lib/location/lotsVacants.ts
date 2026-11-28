/**
 * ══ 🔴🔴 LE NOMBRE DE LOTS VACANTS, DANS LE TITRE DE LA LOCATION (Arno, 27/11/2026, 23h30, point 6). MODULE PUR. ═══════════════════════════════════════
 *
 * « en première ligne, dans la continuité du titre "Location", mettre entre parenthèses juste après, à droite, le nombre de lots disponibles à l'instant T,
 * en dynamique » → « Location (Nombre de lots vacants : 3) ».
 * 🔴🔴 LA RÈGLE (Arno, 28/11/2026, 11h43) : « je veux le nombre de lots PRINCIPAUX vacants, annexes incluses : un bien vacant composé du lot principal + un
 * parking + une cave (3 lots réunis et rattachés au lot principal) ne compte que pour UN lot vacant. Si une annexe est détachée du lot principal (ex. parking
 * détaché pour être loué à part), elle devient un lot à part entière. » On compte des BIENS (les fiches bien de `lireFiche`, regroupementRepo) :
 *   · un bien ACTIF du portefeuille : en gestion OU en location seule, présent au dernier export, non sorti (sqlBienDuPortefeuille) ;
 *   · UN BIEN = son lot principal + ses annexes RATTACHÉES → 1. Une annexe encore rattachée ne compte jamais à part (ni si son lot principal n'est plus
 *     du portefeuille) ;
 *   · une annexe DÉTACHÉE (« Détacher », 18/10/2026 : `annexe_detachee_le`) ou sortie dans une FICHE AUTONOME (regroupement ouvert, 19/10/2026 : lot
 *     orphelin, loué à un autre locataire, scission) est SON PROPRE bien ; une fiche autonome de plusieurs lots compte pour un ;
 *   · VACANT : aucun lot du bien n'a de locataire EN PLACE à l'instant — une occupation est en place si elle est entrée (entrée vide ou ≤ aujourd'hui,
 *     heure de Paris) et pas encore sortie (sortie vide ou postérieure à aujourd'hui : le jour de la sortie, le bien est libre) ; un préavis ne libère rien.
 * Le serveur calcule à chaque affichage ; la même règle partout (`biensVacants`).
 */
export interface OccupationDuLot { entree: string | null; sortie: string | null }
export interface LotPourVacance {
  id: number;
  /** le lot principal auquel ce lot est rattaché comme annexe (gestion_lot_annexe) ; `null` : aucun */
  parentId: number | null;
  /** « Détacher » (annexe_detachee_le) */
  detachee: boolean;
  /** la fiche autonome OUVERTE qui le contient (gestion_bien_regroupement) ; `null` : aucune */
  regroupement: { id: number; teteId: number } | null;
  occupations: readonly OccupationDuLot[];
}
/** Un bien : son lot de tête (le lot principal, ou la tête de la fiche autonome) et tous ses lots du portefeuille. */
export interface BienPourVacance<L extends LotPourVacance = LotPourVacance> { teteId: number; lots: L[] }

/** Une occupation en place le jour donné (AAAA-MM-JJ). PUR. */
export function occupationEnPlace(o: OccupationDuLot, aujourdhui: string): boolean {
  const entree = (o.entree ?? '').slice(0, 10); const sortie = (o.sortie ?? '').slice(0, 10);
  return (entree === '' || entree <= aujourdhui) && (sortie === '' || sortie > aujourdhui);
}

/**
 * Les BIENS formés par les lots actifs (déjà filtrés par la lecture) — la fiche de `lireFiche` : la fiche autonome ouverte qui contient le lot ; sinon,
 * annexe détachée, sa fiche seule ; sinon, annexe rattachée, la fiche de son lot principal ; sinon, la sienne. Un bien dont la tête n'est pas du
 * portefeuille n'existe pas ici (une annexe rattachée ne compte jamais à part). PUR.
 */
export function biensDesLots<L extends LotPourVacance>(lots: readonly L[]): BienPourVacance<L>[] {
  const parId = new Map(lots.map((l) => [l.id, l]));
  const cleDe = (l: L, vus: Set<number> = new Set()): { cle: string; tete: number } | null => {
    if (l.regroupement !== null) return { cle: `r:${l.regroupement.id}`, tete: l.regroupement.teteId };
    if (l.parentId === null || l.detachee) return { cle: `l:${l.id}`, tete: l.id };
    const parent = parId.get(l.parentId);
    if (parent === undefined || vus.has(l.id)) return null; // son lot principal n'est pas du portefeuille : il ne compte pas à part
    vus.add(l.id);
    return cleDe(parent, vus);
  };
  const biens = new Map<string, BienPourVacance<L>>();
  for (const l of lots) {
    const c = cleDe(l);
    if (c === null || !parId.has(c.tete)) continue;
    const b = biens.get(c.cle) ?? { teteId: c.tete, lots: [] };
    b.lots.push(l);
    biens.set(c.cle, b);
  }
  return [...biens.values()];
}

/** Les biens VACANTS : aucun de leurs lots n'a de locataire en place à l'instant. PUR. */
export function biensVacants<L extends LotPourVacance>(lots: readonly L[], aujourdhui: string): BienPourVacance<L>[] {
  return biensDesLots(lots).filter((b) => !b.lots.some((l) => l.occupations.some((o) => occupationEnPlace(o, aujourdhui))));
}

/** « Location (Nombre de lots vacants : 3) » ; sans nombre (lecture impossible) : « Location ». PUR. */
export function titreLocation(n: number | null): string {
  return n === null ? 'Location' : `Location (Nombre de lots vacants : ${n})`;
}
