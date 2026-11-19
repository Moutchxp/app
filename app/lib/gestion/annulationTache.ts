/**
 * ══ 🔴🔴 UNE TÂCHE ANNULÉE DISPARAÎT DES ÉCRANS (Arno, 19/11/2026, choix A) — MODULE PUR ═══════════════════════════════════════════════════════
 * Arno : « Une tâche annulée DISPARAÎT de tous les écrans […] Aucune trace visible. Les rendez-vous qui lui sont rattachés sont annulés et RETIRÉS
 * des agendas Google […] Un mail d'annulation part à chaque contact qui avait ACCEPTÉ ce rendez-vous […] Il précise la tâche, la date et l'heure,
 * et qui annule. Mail interne : « [Copie interne] » […] L'annulation reste inscrite au JOURNAL INTERNE uniquement […] PAS d'effacement réel. »
 * Ici : qui prévenir, le mail, les phrases des fenêtres. Aucune base, aucun réseau.
 */

/** La phrase de la fenêtre AVANT l'annulation (mot pour mot, Arno). */
export const PHRASE_AVANT_ANNULATION = 'La tâche disparaîtra de l’interface et les personnes ayant accepté le rendez-vous seront prévenues par mail.';

/** Les objets des mails internes d'annulation (gabarits des règles « courrier automatique », migration 502). */
export const PREFIXE_OBJET_ANNULATION_RDV = '[Copie interne] Rendez-vous annulé';
export const PREFIXE_OBJET_ANNULATION_TACHE = '[Copie interne] Tâche annulée';

/** Une personne qui a répondu à la demande d'acceptation de la tâche (collaborateur de l'agence). */
export interface ReponseCollaborateur { id: number | null; libelle: string; email: string | null; statut: string }

/**
 * Qui prévenir : les collaborateurs dont la demande est ACCEPTÉE (y compris « acceptée d'office »), avec une adresse, sauf la personne qui annule
 * (elle ne se prévient jamais elle-même, comme la règle D) ; une seule fois chacun. PUR.
 */
export function collaborateursAPrevenirAnnulation(l: readonly ReponseCollaborateur[], auteurId: number | null): ReponseCollaborateur[] {
  const vus = new Set<string>();
  const r: ReponseCollaborateur[] = [];
  for (const c of l) {
    if (c.statut !== 'acceptee' || c.email === null || c.email.trim() === '') continue;
    if (auteurId !== null && c.id !== null && Number(c.id) === Number(auteurId)) continue;
    const cle = c.id !== null ? `id:${Number(c.id)}` : `mail:${c.email.trim().toLowerCase()}`;
    if (vus.has(cle) || vus.has(`mail:${c.email.trim().toLowerCase()}`)) continue;
    vus.add(cle); vus.add(`mail:${c.email.trim().toLowerCase()}`);
    r.push(c);
  }
  return r;
}

const jourFr = (j: string): string => { const [a, m, d] = j.slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const heureFr = (h: string): string => h.slice(0, 5).replace(':', 'h');
const finDe = (h: string, duree: number): string => {
  const [hh, mm] = h.slice(0, 5).split(':').map(Number);
  const t = Math.min(hh * 60 + mm + duree, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}h${String(t % 60).padStart(2, '0')}`;
};
/** « le 20/11/2026 de 10h00 à 10h30 », « le 20/11/2026 à 10h00 », « le 20/11/2026 ». PUR. */
export function quandLisible(c: { jour: string; heure: string | null; dureeMinutes: number | null }): string {
  if (c.heure === null) return `le ${jourFr(c.jour)}`;
  return c.dureeMinutes ? `le ${jourFr(c.jour)} de ${heureFr(c.heure)} à ${finDe(c.heure, c.dureeMinutes)}` : `le ${jourFr(c.jour)} à ${heureFr(c.heure)}`;
}

/** Le mail d'annulation à un collaborateur qui avait accepté. PUR. */
export function mailAnnulationTache(o: { pour: { libelle: string }; rdv: boolean; titre: string; adresse: string | null;
  quand: { jour: string; heure: string | null; dureeMinutes: number | null }; auteur: string }): { objet: string; corps: string } {
  const nom = o.rdv ? 'Le rendez-vous' : 'La tâche';
  const lignes = [
    `Bonjour ${o.pour.libelle},`,
    '',
    `${nom} « ${o.titre} »${o.adresse ? ` (${o.adresse})` : ''}, prévu${o.rdv ? '' : 'e'} ${quandLisible(o.quand)}, est ${o.rdv ? 'annulé' : 'annulée'} par ${o.auteur}.`,
    `Vous l’aviez accepté${o.rdv ? '' : 'e'} : vous n’avez plus rien à faire. ${o.rdv ? 'L’événement est retiré de votre agenda Google.' : 'Elle est retirée de votre agenda Google.'}`,
    '',
    '— Mail automatique de l’application Sans Vis-à-Vis.',
  ];
  const lieu = o.adresse ? ` — ${o.adresse}` : '';
  return { objet: `${o.rdv ? PREFIXE_OBJET_ANNULATION_RDV : PREFIXE_OBJET_ANNULATION_TACHE} — ${o.titre}${lieu}`, corps: lignes.join('\n') };
}

/** La phrase de la fenêtre de confirmation APRÈS l'annulation. PUR. */
export function phraseApresAnnulation(o: { titre: string; prevenus: number; echecs: number }): string {
  const p = o.prevenus === 0 ? 'Personne n’avait accepté : aucun mail n’est parti.'
    : o.prevenus === 1 ? '1 personne a été prévenue par mail.' : `${o.prevenus} personnes ont été prévenues par mail.`;
  const e = o.echecs === 0 ? '' : o.echecs === 1 ? ' 1 mail n’est pas parti.' : ` ${o.echecs} mails ne sont pas partis.`;
  return `La tâche « ${o.titre} » est annulée : elle n’apparaît plus dans l’interface. ${p}${e}`;
}

/** Une tâche se montre-t-elle à l'écran ? Jamais annulée (Arno, 19/11/2026). PUR. */
export const tacheVisible = (t: { etat: string }): boolean => t.etat !== 'annulee';
