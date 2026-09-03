/**
 * LOT 49 — AFFICHAGE des horodatages EN HEURE DE PARIS (Europe/Paris), fuseau FIXE → DÉTERMINISTE (insensible au fuseau de la machine,
 * testable). Le stockage reste inchangé (les instants sont en UTC dans la base) : on ne corrige QUE le RENDU (décision « affichage, pas
 * stockage »).
 *
 * 🔑 DISTINCTION UTC vs CIVIL (le vrai piège du lot) : un INSTANT stocké arrive en ISO AVEC heure (« …T09:16:00Z ») → il faut le convertir
 * en Europe/Paris. Une DATE CIVILE (sans heure : date déclarée, ancrée 12:00 Europe/Paris au LOT-1) arrive SANS « T » → on la laisse
 * INTACTE (la convertir la décalerait à tort). Le discriminant est donc la présence d'un « T ». null / invalide → « — ».
 */
const partiesParis = (d: Date): Record<string, string> => {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return m;
};

/** Instant → « AAAA-MM-JJ » (JOUR en Europe/Paris — évite le décalage d'un jour près de minuit). Date civile (sans « T ») laissée telle
 *  quelle (jour seul, VALIDÉ). null / invalide → « — ». */
export function jourParisISO(le: string | null): string {
  if (!le) return '—';
  if (!le.includes('T')) {                          // date civile (ancre 12:00 Europe/Paris, LOT-1) → JAMAIS convertie
    const jour = le.slice(0, 10);
    return Number.isNaN(new Date(`${jour}T00:00:00Z`).getTime()) ? '—' : jour;
  }
  const d = new Date(le);
  if (Number.isNaN(d.getTime())) return '—';
  const p = partiesParis(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Instant → « AAAA-MM-JJ HH:MM » en Europe/Paris. Date civile laissée telle quelle (jour seul). null / invalide → « — ». */
export function formaterHorodatageParis(le: string | null): string {
  if (!le) return '—';
  if (!le.includes('T')) return jourParisISO(le);   // date civile → jour seul (validé), jamais convertie
  const d = new Date(le);
  if (Number.isNaN(d.getTime())) return '—';
  const p = partiesParis(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Instant → « JJ/MM/AAAA » (jour en Europe/Paris). Pour les libellés « le … » (caractéristiques, historique de gel). Invalide → « — ». */
export function jourFrParis(le: string | null): string {
  const iso = jourParisISO(le);
  if (iso === '—' || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
