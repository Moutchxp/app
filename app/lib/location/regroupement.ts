/**
 * ══ 🔴🔴 UNE FICHE BIEN = LES LOTS LOUÉS ENSEMBLE — MODULE PUR (Arno, 17 et 19/10/2026) ═══════════════════════════════
 *
 * Une fiche bien regroupe un logement (« vaisseau mère ») et ses annexes (cave, parking…). Tant que tous ses lots sont loués
 * aux mêmes locataires (même bail), c'est UNE fiche. Au bail d'un nouveau locataire, on coche les lots loués :
 *   · LOGEMENT coché : chaque lot NON coché sort de la fiche et devient un bien autonome — libre (« orphelin », disponible à
 *     la location) ou déjà loué à d'autres (« autre_locataire »).
 *   · LOGEMENT non coché : il reste dans sa fiche (en attente d'un locataire) ; les lots cochés en sortent et forment UNE
 *     nouvelle fiche bien (un « regroupement » s'ils sont plusieurs).
 *   · Dans une fiche autonome à plusieurs lots, ne louer qu'une partie la scinde : la partie louée forme sa fiche, le reste
 *     forme la sienne (ou une par lot libre).
 * RÉINTÉGRATION : dès que TOUS les lots d'une même fiche d'origine sont loués aux MÊMES locataires, ils se réunissent en une
 * seule fiche ; les fiches autonomes ne sont jamais supprimées (statut « réintégrée »).
 * Ce module ne lit rien, n'écrit rien : il décide.
 */

export interface LotDeFiche {
  id: number;
  role: 'logement' | 'annexe';
  /** « Parking n° 14 », « Appartement T3 »… */
  libelle: string;
  type: string | null;
  etage: string | null;
  numeroLot: string | null;
  porte: string | null;
  place: boolean;
  /** Les locataires EN PLACE (identifiants triés) et leurs noms. Vide = libre. */
  occupants: number[];
  noms: string[];
}

export interface FicheBien {
  /** La fiche d'origine : le logement dont les lots sont issus. */
  origineId: number;
  origineLibelle: string;
  /** Le lot dont la fiche présente ce bien. */
  teteId: number;
  /** « origine » : le logement et ses annexes encore avec lui ; « regroupement » : une fiche autonome (un ou plusieurs lots). */
  sorte: 'origine' | 'regroupement' | 'autonome';
  regroupementId: number | null;
  lots: LotDeFiche[];
}

export type MotifAutonome = 'bail' | 'orphelin' | 'autre_locataire' | 'detacher' | 'scission';

export type ActionLot =
  /** Une fiche autonome (un lot, ou plusieurs loués ensemble). */
  | { sorte: 'autonome'; lotIds: number[]; teteId: number; motif: MotifAutonome }
  /** La fiche autonome d'avant est remplacée (scindée) : elle se CLÔT, jamais effacée. */
  | { sorte: 'clore'; regroupementId: number };

export interface PlanBail { lotsLoues: number[]; actions: ActionLot[]; recap: string[] }

export const estLibre = (l: Pick<LotDeFiche, 'occupants'>): boolean => l.occupants.length === 0;

const et = (mots: readonly string[]): string => (mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`);
const majuscule = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * LE PLAN D'UN NOUVEAU BAIL sur une fiche : ce qui va se passer, dit en toutes lettres AVANT la validation, et les
 * actions à écrire. Au moins un lot coché ; un lot coché doit être libre. PUR.
 */
export function planifierBail(fiche: FicheBien, coches: readonly number[]): { ok: true; plan: PlanBail } | { ok: false; motif: string } {
  const choisis = fiche.lots.filter((l) => coches.includes(l.id));
  if (choisis.length === 0) return { ok: false, motif: 'Cochez au moins un lot loué.' };
  if (choisis.length !== new Set(coches).size) return { ok: false, motif: 'Un des lots cochés n’appartient pas à ce bien : rechargez la page.' };
  const occupe = choisis.find((l) => !estLibre(l));
  if (occupe !== undefined) return { ok: false, motif: `${majuscule(occupe.libelle)} : lot déjà loué à ${et(occupe.noms)}, il ne peut pas être coché.` };
  const restes = fiche.lots.filter((l) => !coches.includes(l.id));
  const actions: ActionLot[] = [];
  const recap: string[] = [];
  const lotsLoues = choisis.map((l) => l.id);
  if (restes.length === 0) {
    return { ok: true, plan: { lotsLoues, actions, recap: [`Le bail porte sur tous les lots de ce bien (${choisis.length}) : la fiche ne change pas.`] } };
  }
  const autonomesParLot = (lots: readonly LotDeFiche[], motifLibre: MotifAutonome): void => {
    for (const l of lots) {
      const motif: MotifAutonome = estLibre(l) ? motifLibre : 'autre_locataire';
      actions.push({ sorte: 'autonome', lotIds: [l.id], teteId: l.id, motif });
      recap.push(estLibre(l)
        ? `${majuscule(l.libelle)} deviendra un bien autonome, disponible à la location.`
        : `${majuscule(l.libelle)} (lot loué à ${et(l.noms)}) deviendra un bien autonome.`);
    }
  };
  const logement = fiche.lots.find((l) => l.role === 'logement') ?? null;
  if (fiche.sorte === 'origine' && logement !== null) {
    if (coches.includes(logement.id)) {
      // Le logement est loué : les lots non repris sortent, chacun dans sa fiche autonome.
      autonomesParLot(restes, 'orphelin');
    } else {
      // Le logement n'est pas loué : il reste dans sa fiche ; les lots cochés en sortent ensemble.
      actions.push({ sorte: 'autonome', lotIds: lotsLoues, teteId: lotsLoues[0], motif: 'bail' });
      recap.push(choisis.length === 1
        ? `${majuscule(choisis[0].libelle)} deviendra un bien autonome, loué à ce locataire.`
        : `${majuscule(et(choisis.map((l) => l.libelle)))} formeront une nouvelle fiche bien, louée à ce locataire.`);
      recap.push(estLibre(logement)
        ? `${majuscule(logement.libelle)} reste dans sa propre fiche, en attente d’un locataire${restes.length > 1 ? ' (avec les lots non cochés)' : ''}.`
        : `${majuscule(logement.libelle)} reste dans sa propre fiche (lot loué à ${et(logement.noms)}).`);
    }
    return { ok: true, plan: { lotsLoues, actions, recap } };
  }
  // Une fiche autonome à plusieurs lots : la partie louée forme sa fiche ; le reste, groupé par occupants identiques.
  if (fiche.regroupementId !== null) actions.push({ sorte: 'clore', regroupementId: fiche.regroupementId });
  actions.push({ sorte: 'autonome', lotIds: lotsLoues, teteId: lotsLoues[0], motif: 'bail' });
  recap.push(choisis.length === 1
    ? `${majuscule(choisis[0].libelle)} formera sa propre fiche bien, louée à ce locataire.`
    : `${majuscule(et(choisis.map((l) => l.libelle)))} formeront une nouvelle fiche bien, louée à ce locataire.`);
  autonomesParLot(restes.filter(estLibre), 'scission');
  const groupes = new Map<string, LotDeFiche[]>();
  for (const l of restes.filter((x) => !estLibre(x))) groupes.set(l.occupants.join(','), [...(groupes.get(l.occupants.join(',')) ?? []), l]);
  for (const g of groupes.values()) {
    actions.push({ sorte: 'autonome', lotIds: g.map((l) => l.id), teteId: g[0].id, motif: 'scission' });
    recap.push(`${majuscule(et(g.map((l) => l.libelle)))} (${g.length > 1 ? 'lots loués' : 'lot loué'} à ${et(g[0].noms)}) ${g.length > 1 ? 'forment' : 'forme'} sa propre fiche.`);
  }
  return { ok: true, plan: { lotsLoues, actions, recap } };
}

/**
 * RÉINTÉGRER ? Tous les lots de la fiche d'origine (le logement ET toutes ses annexes) sont loués, aux MÊMES locataires, et
 * au moins un est aujourd'hui hors de la fiche d'origine (détaché ou dans une fiche autonome). PUR.
 */
export function doitReintegrer(lots: readonly Pick<LotDeFiche, 'occupants'>[], horsOrigine: boolean): boolean {
  if (!horsOrigine || lots.length < 2) return false;
  const cle = (l: Pick<LotDeFiche, 'occupants'>): string => [...l.occupants].sort((a, b) => a - b).join(',');
  if (lots.some((l) => l.occupants.length === 0)) return false;
  return lots.every((l) => cle(l) === cle(lots[0]));
}

const FEMININS = new Set(['cave', 'maison', 'chambre', 'place', 'remise', 'cour', 'terrasse', 'annexe', 'boutique', 'villa']);
const NOMS_CATEGORIE: Record<string, string> = { logement: 'logement', cave: 'cave', parking: 'parking', box: 'box', local: 'local' };

/** « la cave n°3 », « le parking n°14 », « l’appartement T3 » : le lot, avec son article. PUR. */
export function libelleLot(o: { categorie: string | null; nature: string | null; typeBien: string | null; porte: string | null; role: 'logement' | 'annexe' }): string {
  const parCategorie = o.categorie !== null && o.categorie !== 'autre' ? NOMS_CATEGORIE[o.categorie] ?? null : null;
  const base = parCategorie ?? ([o.nature, o.typeBien].filter((x) => x !== null && x.trim() !== '').join(' ') || (o.role === 'logement' ? 'logement' : 'annexe'));
  const nom = base.charAt(0).toLowerCase() + base.slice(1);
  const premier = nom.split(' ')[0].toLowerCase();
  const article = /^[aeiouyéèêh]/i.test(nom) ? 'l’' : FEMININS.has(premier) ? 'la ' : 'le ';
  return `${article}${nom}${o.porte ? ` n°${o.porte}` : ''}`;
}

/**
 * ══ 🔴 RATTACHER UNE ANNEXE DÉTACHÉE À SON LOT PRINCIPAL (Arno, 21/10/2026). PUR. ════════════════════════════════════════════════
 * « Autorisé si l'annexe est VACANTE ; autorisé si elle est louée AU MÊME LOCATAIRE que le lot principal (mêmes locataires sur les
 * baux en cours) ; refusé si elle est louée à un autre locataire. » `null` = autorisé ; sinon la raison, dite telle quelle.
 */
export function refusRattachement(annexe: { occupants: readonly number[]; noms: readonly string[] },
  principal: { occupants: readonly number[]; noms: readonly string[]; mot: string }): string | null {
  if (annexe.occupants.length === 0) return null;
  const cle = (x: readonly number[]): string => [...x].sort((a, b) => a - b).join(',');
  if (principal.occupants.length > 0 && cle(annexe.occupants) === cle(principal.occupants)) return null;
  const qui = (n: readonly string[]): string => n.join(', ');
  return `Rattachement impossible : cette annexe est louée à ${qui(annexe.noms)}, ${principal.occupants.length === 0
    ? `${principal.mot} n’est pas loué` : `${principal.mot} à ${qui(principal.noms)}`}.`;
}

/**
 * LE RATTACHEMENT AUTOMATIQUE (Arno, 21/10/2026) : parmi les annexes DÉTACHÉES d'un lot principal, celles louées EXACTEMENT aux
 * mêmes locataires que lui (et louées : jamais deux vacants) — elles se rattachent sans clic. PUR.
 */
export function annexesARattacher(principal: Pick<LotDeFiche, 'occupants'>, annexes: readonly (Pick<LotDeFiche, 'id' | 'occupants'> & { detachee: boolean })[]): number[] {
  if (principal.occupants.length === 0) return [];
  const cle = (x: readonly number[]): string => [...x].sort((a, b) => a - b).join(',');
  return annexes.filter((a) => a.detachee && a.occupants.length > 0 && cle(a.occupants) === cle(principal.occupants)).map((a) => a.id);
}
