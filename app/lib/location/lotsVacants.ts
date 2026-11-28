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
  /** 🔴 (Arno, 28/11/2026, 11h47) le TYPE du lot : catégorie (Location), nom d'une annexe « Autre », nature et type WIPPIMMO */
  categorie?: string | null;
  nomAnnexe?: string | null;
  nature?: string | null;
  typeBien?: string | null;
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

/* ══ 🔴🔴 Arno (28/11/2026, 11h47) — LE DÉTAIL PAR TYPE ═════════════════════════════════════════════════════════════════════════════════════════════
 * « Afficher le nombre de lots vacants totaux en séparant le cumul des logements avec leurs annexes rattachées et les lots annexes séparés. Ex. : 10 logements
 * avec leurs annexes rattachées et 5 parkings séparés à louer → "Lots vacants : 15 dont 10 logements et 5 parkings" ; faire aussi le décompte des caves si le
 * cas se présente, ou d'autres annexes personnalisées. » Le type d'un bien est celui de son lot de TÊTE (le lot principal, ou la tête de la fiche autonome) :
 *   · la catégorie de la Location : logement, parking, cave ; box, local, et une annexe « Autre » sous son nom tel qu'enregistré ;
 *   · sans catégorie (lots importés de WIPPIMMO) : la nature et le type — « box » ; parking, garage, stationnement → parking ; cave, cellier → cave ;
 *     appartement, maison, studio… → logement ; sinon la nature telle qu'enregistrée (ex. « local commercial ») ; rien, ou « A renseigner » : lot à renseigner.
 * Ordre : logements, parkings, caves, puis les autres par ordre alphabétique ; un type à 0 n'est pas dit. PUR. */
const sansAccents = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const propre = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();
export const TYPE_A_RENSEIGNER = 'lot à renseigner';
/** Le type d'un lot, en mot singulier minuscule (« logement », « parking », « cave », « box », « local commercial »…). PUR. */
export function typeDuLotVacant(l: Pick<LotPourVacance, 'categorie' | 'nomAnnexe' | 'nature' | 'typeBien'>): string {
  const c = propre(l.categorie).toLowerCase();
  if (c === 'logement' || c === 'parking' || c === 'cave' || c === 'box' || c === 'local') return c;
  if (c === 'autre') return propre(l.nomAnnexe).toLocaleLowerCase('fr-FR') || 'annexe';
  if (c !== '') return c;
  const t = sansAccents([l.nature, l.typeBien].map(propre).join(' '));
  if (/\bbox\b/.test(t)) return 'box';
  if (/parking|garage|stationnement/.test(t)) return 'parking';
  if (/\bcave|cellier/.test(t)) return 'cave';
  if (/appartement|maison|studio|logement|duplex|triplex|loft|chambre|villa|pavillon|habitation|meuble/.test(t)) return 'logement';
  const nature = propre(l.nature).toLocaleLowerCase('fr-FR');
  return nature === '' || sansAccents(nature) === 'a renseigner' ? TYPE_A_RENSEIGNER : nature;
}

const PREPOSITIONS = new Set(['de', 'du', 'des', 'à', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'sous', 'avec', 'sans']);
/** Le pluriel français d'un mot : s, x, z inchangés ; -au, -eau, -eu → x ; -al → -aux ; sinon + s. PUR. */
export function plurielMot(m: string): string {
  if (/[sxz]$/i.test(m)) return m;
  if (/(au|eu)$/i.test(m)) return `${m}x`;
  if (/al$/i.test(m)) return `${m.slice(0, -2)}aux`;
  return `${m}s`;
}
/** « 1 parking », « 2 parkings », « 2 locaux commerciaux », « 2 lots à renseigner » (rien n'est accordé après une préposition). PUR. */
export function nombreEtType(n: number, type: string): string {
  if (n <= 1) return `${n} ${type}`;
  let apresPreposition = false;
  const mots = type.split(' ').map((m) => {
    if (apresPreposition || PREPOSITIONS.has(m) || m.startsWith('d’') || m.startsWith("d'")) { apresPreposition = true; return m; }
    return plurielMot(m);
  });
  return `${n} ${mots.join(' ')}`;
}

export interface DetailVacants { total: number; parType: { type: string; n: number }[] }
const RANG_TYPE: Record<string, number> = { logement: 0, parking: 1, cave: 2 };
/** Le total et le décompte par type des biens vacants, dans l'ordre d'Arno. PUR. */
export function detailVacants(biens: readonly BienPourVacance[]): DetailVacants {
  const compte = new Map<string, number>();
  for (const b of biens) {
    const tete = b.lots.find((l) => l.id === b.teteId) ?? b.lots[0];
    const t = typeDuLotVacant(tete);
    compte.set(t, (compte.get(t) ?? 0) + 1);
  }
  const parType = [...compte.entries()].map(([type, n]) => ({ type, n })).filter((x) => x.n > 0)
    .sort((a, b) => (RANG_TYPE[a.type] ?? 3) - (RANG_TYPE[b.type] ?? 3) || a.type.localeCompare(b.type, 'fr'));
  return { total: biens.length, parType };
}
/** « a », « a et b », « a, b et c ». PUR. */
const enumerer = (x: readonly string[]): string => (x.length <= 1 ? x.join('') : `${x.slice(0, -1).join(', ')} et ${x[x.length - 1]}`);
/** « Lots vacants : 15 dont 10 logements, 3 parkings et 2 caves » ; un seul type : « Lots vacants : 10 logements » ; aucun : « Lots vacants : 0 ». PUR. */
export function libelleVacants(d: DetailVacants): string {
  if (d.total === 0 || d.parType.length === 0) return `Lots vacants : ${d.total}`;
  const parts = d.parType.map((x) => nombreEtType(x.n, x.type));
  return d.parType.length === 1 ? `Lots vacants : ${parts[0]}` : `Lots vacants : ${d.total} dont ${enumerer(parts)}`;
}

/** « Location (Lots vacants : 15 dont 10 logements et 5 parkings) » ; sans détail (lecture impossible) : « Location ». PUR. */
export function titreLocation(d: DetailVacants | null): string {
  return d === null ? 'Location' : `Location (${libelleVacants(d)})`;
}
