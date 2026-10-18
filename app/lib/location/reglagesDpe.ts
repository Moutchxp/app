/**
 * ══ 🔴🔴 TUILE LOCATION — LE DPE : RÉGLAGE DATÉ DES INTERDICTIONS ET ALERTES (Arno, 18/10/2026). PUR. ════════════════════
 *
 * « Dates d'interdiction par classe = réglage daté (classe, date d'effet), jamais en dur » (étude de la tuile Location,
 * §11, vérifié le 17/10/2026 : G interdite à la location — nouveau bail ou renouvellement — depuis le 01/01/2025 ; F à
 * partir du 01/01/2028). Ce module est l'UNIQUE endroit où ces dates sont écrites : l'écran et le serveur le lisent ; il
 * passera tel quel dans les Réglages quand le lot des contrôles à la mise en place (L9) les rendra modifiables.
 *
 * Les alertes sont NON BLOQUANTES (elles informent) ; seule la date dans le futur est refusée (`dateDpeFuture`).
 */

export interface InterdictionDpe { classe: string; /** « AAAA-MM-JJ » : date d'effet de l'interdiction pour un nouveau bail. */ dateEffet: string }

export const INTERDICTIONS_LOCATION_DPE: readonly InterdictionDpe[] = [
  { classe: 'G', dateEffet: '2025-01-01' },
  { classe: 'F', dateEffet: '2028-01-01' },
];

/** Durée de validité d'un DPE (ans). */
export const VALIDITE_DPE_ANS = 10;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateFr = (iso: string): string => { const m = ISO.exec(iso); return m === null ? iso : `${m[3]}/${m[2]}/${m[1]}`; };

/** La date civile du jour à Paris, « AAAA-MM-JJ » (jamais `toISOString`, qui donne la date de Londres la nuit). */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(maintenant);
  const v = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** L'interdiction EN VIGUEUR pour cette classe à cette date (la date d'effet est atteinte), sinon `null`. */
export function interdictionEnVigueur(classe: string | null | undefined, aujourdhui: string,
  reglage: readonly InterdictionDpe[] = INTERDICTIONS_LOCATION_DPE): InterdictionDpe | null {
  if (typeof classe !== 'string' || classe === '') return null;
  return reglage.find((r) => r.classe === classe.toUpperCase() && r.dateEffet <= aujourdhui) ?? null;
}

/** La date du DPE est-elle dans le futur (refusée) ? Une date mal formée n'est pas « future » (refusée ailleurs). */
export function dateDpeFuture(date: string | null | undefined, aujourdhui: string): boolean {
  return typeof date === 'string' && ISO.test(date) && date > aujourdhui;
}

/** Le DPE a-t-il plus de `VALIDITE_DPE_ANS` ans ? */
export function dpePerime(date: string | null | undefined, aujourdhui: string): boolean {
  const m = typeof date === 'string' ? ISO.exec(date) : null;
  if (m === null) return false;
  return `${Number(m[1]) + VALIDITE_DPE_ANS}-${m[2]}-${m[3]}` < aujourdhui;
}

/** Les alertes NON BLOQUANTES sous le champ DPE. */
export function alertesDpe(s: { classe: string | null | undefined; date: string | null | undefined; nonSoumis?: boolean }, aujourdhui: string,
  reglage: readonly InterdictionDpe[] = INTERDICTIONS_LOCATION_DPE): string[] {
  if (s.nonSoumis === true) return [];
  const a: string[] = [];
  const interdiction = interdictionEnVigueur(s.classe, aujourdhui, reglage);
  if (interdiction !== null) a.push(`Location interdite depuis le ${dateFr(interdiction.dateEffet)} pour un nouveau bail`);
  if (dpePerime(s.date, aujourdhui)) a.push(`DPE de plus de ${VALIDITE_DPE_ANS} ans : il n’est plus valable`);
  return a;
}
