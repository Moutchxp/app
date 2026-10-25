/**
 * ══ 🔴 Arno (25/10/2026, migration 426) — LES ANNEXES NE COMPTENT PAS COMME DES GESTIONS, À PARTIR DE LA DATE DE BASCULE ═══════════════
 * « Un mandat de gestion ne fait augmenter le compteur de gestions que par ses LOTS PRINCIPAUX : 1 lot principal = 1 gestion ; une annexe
 * (parking, cave, box, cellier…) = 0, même louée séparément. » Une annexe = un lot RELIÉ à un lot principal (`gestion_lot_annexe`,
 * détachée ou non) — rien n'est deviné d'après la nature. La règle ne vaut que pour les mouvements et locations datés de la BASCULE ou
 * après (paramètre, pas une constante) : avant, tout est compté EXACTEMENT comme avant. Sans bascule (migration absente) : comme avant.
 * Les montants (honoraires de gestion) ne changent pas : seul le NOMBRE de gestions est concerné. PUR.
 */
export interface RegleAnnexes {
  /** « AAAA-MM-JJ » : la date de bascule ; null : aucune bascule (tout comme avant). */
  bascule: string | null;
  /** Les lots qui sont des annexes (reliés à un lot principal). */
  annexes: ReadonlySet<number>;
}
export const SANS_REGLE_ANNEXES: RegleAnnexes = { bascule: null, annexes: new Set() };

/** La règle telle que le serveur la transmet (date de bascule, identifiants des annexes). PUR. */
export const regleAnnexesDe = (d: { basculeAnnexes?: string | null; annexes?: readonly number[] }): RegleAnnexes =>
  ({ bascule: d.basculeAnnexes ?? null, annexes: new Set(d.annexes ?? []) });

/** Un lot est-il une annexe NON COMPTÉE à cette date (bascule passée) ? PUR. */
export function annexeNonComptee(lotId: number | null, date: string, r: RegleAnnexes): boolean {
  return r.bascule !== null && lotId !== null && date.slice(0, 10) >= r.bascule && r.annexes.has(lotId);
}

/** Ce mouvement compte-t-il comme une gestion (entrée ou sortie) ? Avant la bascule : toujours, comme avant. PUR. */
export const compteCommeGestion = (lotId: number | null, date: string, r: RegleAnnexes): boolean => !annexeNonComptee(lotId, date, r);

/**
 * Le NOMBRE DE BIENS EN GESTION : on part du stock actuel des lots « en gestion » (le chiffre d'avant), et l'on défait seulement l'effet
 * des mouvements d'annexes datés de la bascule ou après (une annexe entrée ne s'ajoute pas, une annexe sortie ne retire rien). PUR.
 */
export function stockGestion(stockLots: number, transitions: readonly { lotId: number; avant: string | null; apres: string; effetLe: string }[], r: RegleAnnexes): number {
  return stockLots - transitions.filter((t) => annexeNonComptee(t.lotId, t.effetLe, r))
    .reduce((s, t) => s + (t.apres === 'en_gestion' && t.avant !== 'en_gestion' ? 1 : t.avant === 'en_gestion' && t.apres !== 'en_gestion' ? -1 : 0), 0);
}

/** Une location d'annexe datée de la bascule ou après : son lot principal (en gestion à la signature ?). */
export interface AnnexeLouee { parentId: number; libelle: string; principalEnGestion: boolean; mandat: string | null }

/** La mention du formulaire : « Annexe de <lot principal> (gestion n° …) — comptée en relocation ». PUR. */
export const motAnnexeLouee = (a: AnnexeLouee): string => `Annexe de ${a.libelle}${a.mandat ? ` (gestion n° ${a.mandat})` : ''} — comptée en relocation`;
