import { classementsDuRepere } from './avantApres';
import { motClassement, type Classement, type Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — QUELS CHANGEMENTS DE SUIVI PORTENT UNE ACCOLADE. Module PUR ══
 *
 * DEMANDE D'ARNO (12/10/2026) : « TOUT changement de portée “Ce mail + futurs échanges” (et “Toute la conversation”)
 * affiche l'accolade complète, ancrée AU MAIL DÉCLENCHEUR […] dans chaque vue où ce mail apparaît […], que le bien
 * entre, sorte ou reste suivi. […] Si deux changements portent sur le même mail, affiche le plus récent et mentionne
 * l'existence de l'autre dans la fenêtre du “i”. »
 *
 * ═══ CE QUI MANQUAIT ═══════════════════════════════════════════════════════════════════════════════════════════════
 *   ① Une fenêtre qui commence au PREMIER mail de la conversation n'avait jamais d'accolade (« elle ne sépare rien »,
 *     `reperesDuFil`). Or c'est exactement ce que pose un changement fait SUR le premier mail — le cas du fil 16502,
 *     dont le mail de Valentin TALHOUARN est le premier —, et ce que pose « Toute la conversation » (la fenêtre part
 *     du premier mail). Ces changements-là étaient muets.
 *   ② L'« avant » d'un changement fait sur un mail qui portait DÉJÀ une fenêtre était la fenêtre du mail précédent,
 *     et non celle que le geste a remplacée.
 *
 * ═══ LA RÈGLE ══════════════════════════════════════════════════════════════════════════════════════════════════════
 *   · Toute fenêtre VIVANTE qui ne commence pas au premier mail a son accolade (inchangé — aucune n'est retirée).
 *   · Une fenêtre vivante qui commence au premier mail a la sienne SI ELLE VIENT D'UN GESTE (`estUnGeste`) : la fenêtre
 *     initiale de la reprise des données (« reprise des périodes ») n'est pas un changement.
 *   · L'AVANT est la fenêtre que ce geste a remplacée sur le même mail (refermée à l'instant où elle a été posée) ;
 *     à défaut, celle qui couvrait le mail précédent ; à défaut, rien.
 *   · LES AUTRES CHANGEMENTS du même mail (fenêtres refermées posées par un geste) sont rendus pour la fenêtre du « i ».
 *     La fenêtre vivante est, par construction, la plus récente : une seule fenêtre vit par mail.
 *
 * ⚠️ « Toute la conversation » ne garde pas le mail où l'on a cliqué : sa fenêtre part du premier mail, et c'est là
 * que l'accolade se pose (« à partir d'ici » = tout l'échange).
 */

/** Une fenêtre refermée (remplacée ou annulée) : pour l'« avant » et les « autres changements du même mail ». */
export interface PeriodeAncienne extends Periode {
  remplaceeLe: string | null;
}

/** La fenêtre vient-elle d'un geste ? Les reprises de données ne sont pas des changements. PUR. */
export function estUnGeste(p: { parLibelle?: string | null }): boolean {
  const l = (p.parLibelle ?? '').trim().toLowerCase();
  return l !== '' && !l.startsWith('reprise');
}

/** Deux instants à moins de cinq secondes : le même geste (la fermeture et l'ouverture sont dans une transaction). */
const memeInstant = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (a == null || b == null) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) <= 5000;
};

export interface ChangementSuivi {
  periode: Periode;
  depuisMessageId: number;
  avant: Classement | null;
  apres: Classement;
  /** Les autres changements posés sur ce même mail, du plus récent au plus ancien (fenêtre du « i »). */
  autres: PeriodeAncienne[];
}

/** LES CHANGEMENTS QUI PORTENT UNE ACCOLADE, dans l'ordre des mails. PUR. */
export function changementsDuFil(o: {
  mails: readonly number[];
  periodes: readonly Periode[];
  anciennes?: readonly PeriodeAncienne[];
}): ChangementSuivi[] {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const anciennes = o.anciennes ?? [];
  return [...o.periodes]
    .filter((p) => {
      const r = rang.get(p.depuisMessageId) ?? -1;
      return r > 0 || (r === 0 && estUnGeste(p));
    })
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number))
    .map((p) => {
      const memeMail = anciennes
        .filter((x) => x.id !== p.id && x.depuisMessageId === p.depuisMessageId)
        .sort((a, b) => String(b.le ?? '').localeCompare(String(a.le ?? '')));
      const remplacee = memeMail.find((x) => memeInstant(x.remplaceeLe, p.le)) ?? null;
      const precedente = classementsDuRepere({ mails: o.mails, periodes: o.periodes, periodeId: p.id });
      return {
        periode: p,
        depuisMessageId: p.depuisMessageId,
        avant: remplacee !== null ? remplacee.classement : (precedente?.avant ?? null),
        apres: p.classement,
        autres: memeMail.filter(estUnGeste),
      };
    });
}

/** Le changement de cette fenêtre, ou `null`. PUR. */
export function changementDeLaPeriode(o: {
  mails: readonly number[]; periodes: readonly Periode[]; anciennes?: readonly PeriodeAncienne[]; periodeId: number;
}): ChangementSuivi | null {
  return changementsDuFil(o).find((c) => c.periode.id === o.periodeId) ?? null;
}

/**
 * « Autre changement sur ce mail : 12/10/2026 00:12 · a.jorel@… — 25 rue Edith Cavell… (remplacé le 12/10/2026 00:13) ».
 * `dateHeure` est passé par l'écran (le format de date de l'application). PUR.
 */
export function lignesAutresChangements(
  autres: readonly PeriodeAncienne[], dateHeure: (iso: string) => string,
): string[] {
  return autres.map((x) => {
    const quand = x.le == null ? '' : dateHeure(x.le);
    const qui = (x.parLibelle ?? '').trim();
    const ferme = x.remplaceeLe == null ? '' : ` (remplacé le ${dateHeure(x.remplaceeLe)})`;
    const tete = [quand, qui].filter((s) => s !== '').join(' · ');
    return `Autre changement sur ce mail : ${tete === '' ? '' : `${tete} — `}${motClassement(x.classement)}${ferme}`;
  });
}

/** « 2 biens rattachés », « 1 bien rattaché », « aucun bien rattaché ». PUR. */
export function motBiensRattaches(n: number): string {
  if (n <= 0) return 'aucun bien rattaché';
  return n === 1 ? '1 bien rattaché' : `${n} biens rattachés`;
}

export const nbBiensDuClassement = (c: Classement | null): number => (c?.sorte === 'biens' ? c.biens.length : 0);

/**
 * « suivi de fond modifié — 2 biens rattachés » : l'accolade d'un bien qui RESTE suivi (Arno). PUR.
 * 🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — « suivi modifié » devient « suivi de fond modifié » (Arno, 12/10/2026).
 */
export function libelleSuiviModifie(apres: Classement): string {
  return `suivi de fond modifié — ${motBiensRattaches(nbBiensDuClassement(apres))}`;
}
