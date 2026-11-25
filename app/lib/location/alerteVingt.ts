/**
 * ══ 🔴🔴 L'ALERTE HEBDOMADAIRE « 20 % À RESTITUER » (Arno, 24/11/2026) — LE CALENDRIER ET LE MAIL. MODULE PUR. ═════════════════════════════════════
 *
 * Arno : « Alerte hebdomadaire (choix d'Arno : une fois par semaine) : chaque lundi matin (heure de Paris), si au moins un locataire est en
 * « Urgence », UN mail récapitulatif à gestion@criterimmo.fr : objet « [Urgent] 20 % à restituer — N locataire(s) », liste (locataire, logement,
 * AG, date limite, jours restants/dépassés) et lien vers l'écran. Aucun mail si personne en urgence. »
 * Le lundi « matin » : à partir de `HEURE_ALERTE` h (Paris) ; un serveur arrêté le lundi matin envoie dès son retour LE MÊME lundi, jamais un autre jour.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

import { capsulesAgo, type LigneVingtPourcent } from './vingtPourcent';

export const HEURE_ALERTE = 8;
export const CHEMIN_ECRAN_VINGT = '/admin/location/vingt-pourcent';
export const PREFIXE_OBJET_ALERTE_VINGT = '[Urgent] 20 % à restituer — ';

/** Le jour (AAAA-MM-JJ), le jour de la semaine (1 = lundi … 7 = dimanche) et l'heure, À PARIS, d'un instant. PUR. */
export function momentParis(d: Date): { jour: string; jourSemaine: number; heure: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const jours: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { jour: `${p.year}-${p.month}-${p.day}`, jourSemaine: jours[p.weekday] ?? 0, heure: Number(p.hour) };
}

/** Est-ce le moment de l'alerte (le lundi, à partir de 8 h, Paris) ? PUR. */
export const alerteDue = (m: { jourSemaine: number; heure: number }): boolean => m.jourSemaine === 1 && m.heure >= HEURE_ALERTE;

/** « [Urgent] 20 % à restituer — 3 locataires ». PUR. */
export const objetAlerteVingt = (n: number): string => `${PREFIXE_OBJET_ALERTE_VINGT}${n} locataire${n > 1 ? 's' : ''}`;

const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Une ligne de l'alerte : « DUPONT Alice — 1 rue A — AG du 15/09/2026 (date officielle) — date limite 15/10/2026 — dépassée de 40 jours ». PUR. */
export function ligneAlerteVingt(l: LigneVingtPourcent): string {
  const s = l.suivi;
  const qui = l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`;
  if (s.etat !== 'ok') return `${qui} — ${l.logement ?? `Bien ${l.lotId}`}`;
  const j = s.joursRestants;
  const jours = j < 0 ? `dépassée de ${-j} jour${-j > 1 ? 's' : ''}` : j === 0 ? 'aujourd’hui' : `${j} jour${j > 1 ? 's' : ''} restant${j > 1 ? 's' : ''}`;
  return `${qui} — ${l.logement ?? `Bien ${l.lotId}`} — AG du ${dateFr(s.ago.date)} (${s.ago.statut === 'officielle' ? 'date officielle' : 'date projetée'}) — date limite ${dateFr(s.limite)} — ${jours}`;
}

/** Le nombre de LOCATAIRES de l'alerte (colocataires un par un) — le même que la pastille et le compteur « Urgence ». PUR. */
export const nombreLocatairesAlerte = (lignes: readonly LigneVingtPourcent[]): number => capsulesAgo(lignes).total;

/** LE MAIL (objet, texte, HTML) : la liste des locataires en « Urgence » et le lien vers l'écran. PUR. */
export function mailAlerteVingt(lignes: readonly LigneVingtPourcent[], lien: string, aujourdhui: string): { objet: string; texte: string; html: string } {
  // 🔴 (Arno, 25/11/2026) « compter en locataires partout » : l'objet et l'intro comptent des LOCATAIRES (colocataires un par un), plus des sorties
  const n = nombreLocatairesAlerte(lignes);
  const objet = objetAlerteVingt(n);
  const intro = `${n === 1 ? 'Un locataire est' : `${n} locataires sont`} en « Urgence » sur l’écran « 20 % à restituer » au ${dateFr(aujourdhui)} : l’AG qui arrête ses comptes est passée depuis plus de 20 jours, la restitution des 20 % retenus est à faire.`;
  const items = lignes.map(ligneAlerteVingt);
  const fin = 'Une fois la restitution faite, cliquez sur « Restitution faite » sur sa ligne : il sort de la liste et de cette alerte.';
  const texte = ['Bonjour,', intro, items.map((x) => `- ${x}`).join('\n'), `Ouvrir l’écran : ${lien}`, fin, 'Alerte automatique du lundi — Sans Vis-à-Vis.'].join('\n\n');
  const html = `<p>Bonjour,</p><p>${echapper(intro)}</p><ul>${items.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>`
    + `<p><a href="${echapper(lien)}">Ouvrir l’écran « 20 % à restituer »</a></p><p>${echapper(fin)}</p><p><em>Alerte automatique du lundi — Sans Vis-à-Vis.</em></p>`;
  return { objet, texte, html };
}
