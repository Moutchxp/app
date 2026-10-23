/**
 * ══ 🔴🔴 L'HISTORIQUE DES ÉVÉNEMENTS D'UN BIEN — CLÔTURE, PÉRIODES, RÉOUVERTURES (Arno, 23/10/2026). MODULE PUR. ═══════════════
 *
 * « Quand on valide le carré d'étape “Clôturé”, la frise disparaît de la fiche […] Il restera consultable dans l'Historique des
 * événements. » « Une réouverture crée une NOUVELLE PÉRIODE commençant à la date du jour […] Un même événement peut donc avoir
 * plusieurs périodes discontinues. »
 *
 * 🔴 LES PÉRIODES NE SONT PAS STOCKÉES À PART : elles se LISENT sur les cartes de borne de la frise (Ouverture, Clôture,
 * Réouverture — `etatParLaFrise.ts`), chacune datée et signée (`cree_le`, `cree_par_libelle`). Aucune table, aucune migration :
 * une seconde écriture des périodes pourrait contredire la frise. Ce module ne fait que les DIRE.
 */

/** Une période telle que la route de la fiche du bien la rend (`au === null` : en cours). */
export interface PeriodeLue {
  du: string; au: string | null;
  ouvertLe?: string | null; ouvertPar?: string | null; ouvertSource?: string | null;
  closLe?: string | null; closPar?: string | null; closSource?: string | null;
}

/** `2026-09-23T17:02:00+02:00` → `23/09/2026`, par découpage (jamais un `Date` : le fuseau du lecteur ne décale pas le jour). PUR. */
export function jourDe(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j === undefined ? iso : `${j}/${m}/${a}`;
}

/** L'heure d'un instant, à Paris : « 17:24 ». PUR (le fuseau est nommé). */
export function heureDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
}

/** « du 01/03/2026 au 02/04/2026 » ; « depuis le 23/10/2026 » pour la période en cours. PUR. */
export function motPeriode(p: PeriodeLue): string {
  return p.au === null ? `depuis le ${jourDe(p.du)}` : `du ${jourDe(p.du)} au ${jourDe(p.au)}`;
}

/** Qui a fait un geste : son auteur ; une carte posée par Monga : « Monga » ; inconnu : rien. PUR. */
function par(nom: string | null | undefined, source: string | null | undefined): string {
  if (nom !== null && nom !== undefined && nom.trim() !== '') return ` par ${nom.trim()}`;
  return source === 'monga' ? ' par Monga' : '';
}

/** « clos le 02/04/2026 à 17:24 par arno@… » — l'instant ET l'auteur du geste de clôture. `null` : période en cours. PUR. */
export function motCloture(p: PeriodeLue): string | null {
  if (p.au === null) return null;
  const quand = p.closLe ? `${jourDe(p.closLe)} à ${heureDe(p.closLe)}` : jourDe(p.au);
  return `clos le ${quand}${par(p.closPar, p.closSource)}`;
}

/** « rouvert le 23/10/2026 à 09:12 par … » (ou « ouvert le … » pour la première période). PUR. */
export function motOuverture(p: PeriodeLue, premiere: boolean): string {
  const quand = p.ouvertLe ? `${jourDe(p.ouvertLe)} à ${heureDe(p.ouvertLe)}` : jourDe(p.du);
  return `${premiere ? 'ouvert' : 'rouvert'} le ${quand}${par(p.ouvertPar, p.ouvertSource)}`;
}

/** Combien de fois l'événement a été rouvert : une réouverture = une période de plus. PUR. */
export function nbReouvertures(periodes: readonly PeriodeLue[]): number {
  return Math.max(0, periodes.length - 1);
}

/** « 1 réouverture », « 3 réouvertures », « jamais rouvert ». PUR. */
export function motReouvertures(n: number): string {
  return n === 0 ? 'jamais rouvert' : `${n} réouverture${n > 1 ? 's' : ''}`;
}

/**
 * La date À LAQUELLE UN ÉVÉNEMENT COMPTE (Arno : « un événement rouvert compte à la date de sa réouverture, jamais à sa première
 * ouverture ») : le début de sa DERNIÈRE période. PUR.
 */
export function dateQuiCompte(periodes: readonly PeriodeLue[]): string | null {
  if (periodes.length === 0) return null;
  return [...periodes].sort((a, b) => Date.parse(a.du) - Date.parse(b.du))[periodes.length - 1].du;
}

/**
 * LA DURÉE OUVERTE, en jours, période par période — les intervalles fermés ne comptent pas (Arno). Jusqu'à `jusqua` (exclu au-delà)
 * pour une période en cours ou pour un jalon. PUR.
 */
export function joursOuverts(periodes: readonly PeriodeLue[], jusqua: string): number {
  const fin = Date.parse(jusqua);
  let total = 0;
  for (const p of periodes) {
    const du = Date.parse(p.du);
    if (Number.isNaN(du) || du >= fin) continue;
    const au = p.au === null ? fin : Math.min(Date.parse(p.au), fin);
    if (au > du) total += au - du;
  }
  return total / 86_400_000;
}

/** L'historique : les événements CLOS, du plus récemment clos au plus ancien. PUR. */
export function ordreHistorique<T extends { clos: boolean; closLe: string | null; id: number }>(evenements: readonly T[]): T[] {
  return evenements.filter((e) => e.clos)
    .sort((a, b) => (Date.parse(b.closLe ?? '') || 0) - (Date.parse(a.closLe ?? '') || 0) || b.id - a.id);
}
