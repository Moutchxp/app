/**
 * ══ 🔴🔴 LES MINUTES D'UN RENDEZ-VOUS DU PRÉAVIS (Arno, 18/11/2026) — MODULE PUR ═══════════════════════════════════════════════════════════════
 * Arno : « MINUTES LIMITÉES À 00, 15, 30 ET 45 pour TOUS les rendez-vous qu'on fixe ou qu'on déplace : pré-visite, état des lieux de sortie […].
 * Le serveur refuse aussi toute autre minute. La liste des minutes autorisées est un réglage en configuration, avec 00/15/30/45 par défaut. Les
 * rendez-vous existants qui ont d'autres minutes (ex. 09h53) s'affichent tels quels, sans arrondi silencieux. »
 * Le réglage : `gestion_config.minutes_rdv` (migration 498) ; sans elle, ou illisible : le défaut ci-dessous. Lisible par l'écran comme par le serveur.
 */

/** Le défaut (et le repli sans la 498) : 00, 15, 30, 45. */
export const MINUTES_RDV_DEFAUT: readonly number[] = [0, 15, 30, 45];

/** Une liste de minutes lue (base, réponse du serveur) : entiers 0 à 59, sans doublon, triés ; vide ou illisible → le défaut. PUR. */
export function lireMinutesRdv(x: unknown): number[] {
  const l = Array.isArray(x) ? x.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 59) : [];
  const u = [...new Set(l)].sort((a, b) => a - b);
  return u.length > 0 ? u : [...MINUTES_RDV_DEFAUT];
}

/** « 09:53 » → 53 ; autre forme → null. PUR. */
export function minuteDe(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim().slice(0, 5));
  return m === null ? null : Number(m[2]);
}

/** « 05 », « 30 » : deux chiffres. PUR. */
export const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** Le refus du SERVEUR si l'heure de début ou de fin n'a pas une minute autorisée (« Les minutes autorisées : 00, 15, 30 ou 45. »), sinon null. PUR. */
export function refusMinutesRdv(heures: { debut: string; fin: string }, minutes: readonly number[]): string | null {
  for (const [nom, h] of [['début', heures.debut], ['fin', heures.fin]] as const) {
    if (h.trim() === '') continue; // un champ vide : la règle existante (champ obligatoire) le dit
    const m = minuteDe(h);
    if (m !== null && !minutes.includes(m)) return `L’heure de ${nom} doit tomber sur ${listeMinutesFr(minutes)} minutes.`;
  }
  return null;
}

/** « 00, 15, 30 ou 45 ». PUR. */
export function listeMinutesFr(minutes: readonly number[]): string {
  const l = minutes.map(deuxChiffres);
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`;
}
