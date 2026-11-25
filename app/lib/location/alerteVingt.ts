/**
 * ══ 🔴🔴 L'ALERTE « 20 % À RESTITUER EN RETARD » (Arno, 25/11/2026 — remplace l'alerte du lundi du 24/11) — LE CALENDRIER ET LE MAIL. MODULE PUR. ═
 *
 * Arno : « Tous les 2 jours (choix d'Arno), le matin à partir de 8 h heure de Paris, s'il y a au moins un locataire en « Alerte restitution en
 * retard », UN mail récapitulatif à l'adresse Gestion du réglage : objet « [Alerte] 20 % à restituer en retard — N locataire(s) », liste
 * (locataire, logement, AGO officielle, date limite, jours de retard) et lien vers l'écran. Aucun mail si personne. […] pas de double envoi le
 * même jour, jour suivant si le serveur était arrêté. L'ancien envoi du lundi ne part plus (garde son historique). »
 * Le rythme : à partir de `HEURE_ALERTE` h (Paris), un envoi si le dernier envoi RÉUSSI de cette alerte date d'au moins `INTERVALLE_JOURS_ALERTE`
 * jours (ou s'il n'y en a jamais eu) : un serveur arrêté le jour prévu envoie dès son retour, le lendemain ; un jour sans personne en retard,
 * rien ne part et rien n'est compté. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

import { capsulesAgo, type LigneVingtPourcent } from './vingtPourcent';

export const HEURE_ALERTE = 8;
export const CHEMIN_ECRAN_VINGT = '/admin/location/vingt-pourcent';
export const PREFIXE_OBJET_ALERTE_VINGT = '[Alerte] 20 % à restituer en retard — ';
/** 🔴 (Arno, 25/11/2026) « tous les 2 jours ». */
export const INTERVALLE_JOURS_ALERTE = 2;

/** Le jour (AAAA-MM-JJ), le jour de la semaine (1 = lundi … 7 = dimanche) et l'heure, À PARIS, d'un instant. PUR. */
export function momentParis(d: Date): { jour: string; jourSemaine: number; heure: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const jours: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { jour: `${p.year}-${p.month}-${p.day}`, jourSemaine: jours[p.weekday] ?? 0, heure: Number(p.hour) };
}

const joursEntre = (de: string, a: string): number => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Est-ce le moment de l'alerte ? À partir de 8 h (Paris), si le dernier envoi réussi (`dernierEnvoi`, AAAA-MM-JJ, ou `null`) date d'au moins
 * deux jours. Le jour même d'un envoi : non (jamais deux fois le même jour) ; le lendemain : non ; le surlendemain et après : oui. PUR.
 */
export const alerteDue = (m: { jour: string; heure: number }, dernierEnvoi: string | null): boolean =>
  m.heure >= HEURE_ALERTE && (dernierEnvoi === null || joursEntre(dernierEnvoi, m.jour) >= INTERVALLE_JOURS_ALERTE);

/** « [Alerte] 20 % à restituer en retard — 3 locataires ». PUR. */
export const objetAlerteVingt = (n: number): string => `${PREFIXE_OBJET_ALERTE_VINGT}${n} locataire${n > 1 ? 's' : ''}`;

const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Une ligne de l'alerte : « DUPONT Alice — 1 rue A — AGO officielle du 15/09/2026 — date limite 15/10/2026 — 41 jours de retard ». PUR. */
export function ligneAlerteVingt(l: LigneVingtPourcent, aujourdhui: string): string {
  const s = l.suivi;
  const qui = l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`;
  if (s.etat !== 'ok') return `${qui} — ${l.logement ?? `Bien ${l.lotId}`}`;
  const r = joursEntre(s.limite, aujourdhui);
  // 🔴 (Arno, 25/11/2026) une AGO projetée en retard est dite telle quelle (« à confirmer »), jamais « officielle »
  const ago = s.ago.statut === 'officielle' && !s.incertaine ? 'AGO officielle' : 'AGO projetée (à confirmer)';
  return `${qui} — ${l.logement ?? `Bien ${l.lotId}`} — ${ago} du ${dateFr(s.ago.date)} — date limite ${dateFr(s.limite)} — ${r} jour${r > 1 ? 's' : ''} de retard`;
}

/** Le nombre de LOCATAIRES de l'alerte (colocataires un par un) — le même que la pastille et le compteur « Urgence ». PUR. */
export const nombreLocatairesAlerte = (lignes: readonly LigneVingtPourcent[]): number => capsulesAgo(lignes).total;

/** LE MAIL (objet, texte, HTML) : la liste des locataires en « Alerte restitution en retard » et le lien vers l'écran. PUR. */
export function mailAlerteVingt(lignes: readonly LigneVingtPourcent[], lien: string, aujourdhui: string): { objet: string; texte: string; html: string } {
  // 🔴 (Arno, 25/11/2026) « compter en locataires partout » : l'objet et l'intro comptent des LOCATAIRES (colocataires un par un), plus des sorties
  const n = nombreLocatairesAlerte(lignes);
  const objet = objetAlerteVingt(n);
  const intro = `${n === 1 ? 'Un locataire est' : `${n} locataires sont`} en « Alerte restitution en retard » sur l’écran « 20 % à restituer » au ${dateFr(aujourdhui)} : l’AGO qui arrête les comptes est passée et la date limite de restitution des 20 % retenus (un mois après l’AGO) est dépassée.`;
  const items = lignes.map((l) => ligneAlerteVingt(l, aujourdhui));
  const fin = 'Une fois la restitution faite, cliquez sur « Faire restitution » sur sa ligne : il sort de la liste et de cette alerte.';
  const texte = ['Bonjour,', intro, items.map((x) => `- ${x}`).join('\n'), `Ouvrir l’écran : ${lien}`, fin, 'Alerte automatique (tous les 2 jours) — Sans Vis-à-Vis.'].join('\n\n');
  const html = `<p>Bonjour,</p><p>${echapper(intro)}</p><ul>${items.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>`
    + `<p><a href="${echapper(lien)}">Ouvrir l’écran « 20 % à restituer »</a></p><p>${echapper(fin)}</p><p><em>Alerte automatique (tous les 2 jours) — Sans Vis-à-Vis.</em></p>`;
  return { objet, texte, html };
}
