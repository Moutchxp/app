/**
 * ══ 🔴🔴 LES RÈGLES UNIFORMES DE MODIFICATION D'UN RENDEZ-VOUS (Arno, 19/11/2026) — MODULE PUR ══════════════════════════════════════════════════
 * Pré-visite, état des lieux de sortie et tâches : les mêmes règles.
 *  · D — le collaborateur INITIAL, quand QUELQU'UN D'AUTRE lui retire le rendez-vous (changement de collaborateur), reçoit un mail : ancien et
 *    nouveau créneau, ancien et nouveau collaborateur, auteur ; H — s'il avait l'événement dans son agenda Google, le mail le dit (la
 *    réconciliation de l'agenda, existante, le retire). Le même collaborateur gardé : la nouvelle invitation existante (« Tâche déplacée »,
 *    règle G) l'informe déjà — pas de second mail. La personne qui modifie ne se prévient jamais elle-même.
 *  · J — un rendez-vous passé ou effectué ne se modifie plus.
 *  · F — la phrase de la fenêtre de confirmation.
 * Aucune base, aucun réseau.
 */

/** Une personne en charge du rendez-vous (le collaborateur « Confié à » et les autres invités). */
export interface CollaborateurRdv { id: number | null; libelle: string; email: string | null;
  /** L'événement est (était) dans SON agenda Google. */
  agenda: boolean }
/** Le rendez-vous, tel qu'il était (ou est) : créneau et personnes. */
export interface EtatRdv { jour: string; heure: string | null; dureeMinutes: number | null; collaborateurs: CollaborateurRdv[] }

const memeQuelquun = (a: CollaborateurRdv, b: CollaborateurRdv): boolean =>
  (a.id !== null && b.id !== null && Number(a.id) === Number(b.id)) || (a.email !== null && b.email !== null && a.email.toLowerCase() === b.email.toLowerCase());

/**
 * Qui prévenir (règle D) : les collaborateurs d'AVANT qui ne sont plus en charge APRÈS, sauf l'auteur de la modification, et seulement ceux qui
 * ont une adresse. PUR.
 */
export function collaborateursAPrevenir(avant: EtatRdv, apres: EtatRdv, auteurId: number | null): CollaborateurRdv[] {
  return avant.collaborateurs.filter((c) => c.email !== null && c.email.trim() !== ''
    && !apres.collaborateurs.some((x) => memeQuelquun(x, c))
    && !(auteurId !== null && c.id !== null && Number(c.id) === Number(auteurId)));
}

const jourFr = (j: string): string => { const [a, m, d] = j.slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const heureFr = (h: string): string => h.slice(0, 5).replace(':', 'h');
const finDe = (h: string, duree: number): string => {
  const [hh, mm] = h.slice(0, 5).split(':').map(Number);
  const t = Math.min(hh * 60 + mm + duree, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}h${String(t % 60).padStart(2, '0')}`;
};
/** « 20/11/2026 de 10h00 à 11h00 » (ou « le 20/11/2026 » sans heure). PUR. */
export function creneauLisible(e: Pick<EtatRdv, 'jour' | 'heure' | 'dureeMinutes'>): string {
  if (e.heure === null) return jourFr(e.jour);
  return e.dureeMinutes ? `${jourFr(e.jour)} de ${heureFr(e.heure)} à ${finDe(e.heure, e.dureeMinutes)}` : `${jourFr(e.jour)} à ${heureFr(e.heure)}`;
}
const noms = (l: readonly CollaborateurRdv[]): string => (l.length === 0 ? '—' : l.map((c) => c.libelle).join(', '));

export const PREFIXE_OBJET_MODIFICATION_RDV = '[Copie interne] Rendez-vous modifié';

/** Le mail au collaborateur initial (règle D, et H pour l'agenda). PUR. */
export function mailModificationRdv(o: { pour: CollaborateurRdv; objetRdv: string; adresse: string | null; avant: EtatRdv; apres: EtatRdv; auteur: string }):
  { objet: string; corps: string } {
  const lieu = o.adresse ? ` — ${o.adresse}` : '';
  const lignes = [
    `Bonjour ${o.pour.libelle},`,
    '',
    `Le rendez-vous « ${o.objetRdv} »${o.adresse ? ` (${o.adresse})` : ''} a été modifié par ${o.auteur}. Il ne vous est plus confié : vous n’avez plus rien à faire pour ce rendez-vous.`,
    '',
    `Ancien créneau : ${creneauLisible(o.avant)}`,
    `Nouveau créneau : ${creneauLisible(o.apres)}`,
    `Ancien collaborateur : ${noms(o.avant.collaborateurs)}`,
    `Nouveau collaborateur : ${noms(o.apres.collaborateurs)}`,
    ...(o.pour.agenda ? ['', 'L’événement est retiré de votre agenda Google.'] : []),
    '',
    '— Mail automatique de l’application Sans Vis-à-Vis.',
  ];
  return { objet: `${PREFIXE_OBJET_MODIFICATION_RDV} — ${o.objetRdv}${lieu}`, corps: lignes.join('\n') };
}

/**
 * J (corrigée par Arno le 19/11/2026) — le rendez-vous ne se modifie plus seulement s'il est EFFECTUÉ (compte rendu fait, état des lieux réalisé,
 * tâche faite) ou ANNULÉ. Une date passée sans compte rendu (« pré-visite du 13/11, compte rendu à faire ») reste modifiable. PUR.
 */
export function rdvModifiable(o: { etat?: string | null; effectue?: boolean }): boolean {
  return o.effectue !== true && (o.etat === undefined || o.etat === null || o.etat === 'a_faire');
}
export const MOTIF_RDV_NON_MODIFIABLE = 'Ce rendez-vous est effectué ou annulé : il ne peut plus être modifié.';

/** F — la phrase de la fenêtre de confirmation, après chaque geste sur un rendez-vous. PUR. */
export function phraseConfirmationRdv(geste: 'fixe' | 'modifie' | 'valide_sans_confirmation' | 'validation_annulee', quoi: 'previsite' | 'edl' | 'tache',
  creneau?: string | null): string {
  const nom = quoi === 'previsite' ? 'La pré-visite' : quoi === 'edl' ? 'L’état des lieux de sortie' : 'Le rendez-vous';
  const fem = quoi === 'previsite'; // « la pré-visite » ; « l’état des lieux », « le rendez-vous » : masculin
  const le = creneau ? ` le ${creneau}` : '';
  switch (geste) {
    case 'fixe': return `${nom} est ${fem ? 'fixée' : 'fixé'}${le}.`;
    case 'modifie': return `${nom} est ${fem ? 'modifiée' : 'modifié'}${creneau ? ` : ${creneau}` : ''}.`;
    case 'valide_sans_confirmation': return `${nom} est ${fem ? 'confirmée' : 'confirmé'} côté locataires, sans leur demander de confirmation.`;
    case 'validation_annulee': return `La validation à la main est annulée : ${nom.charAt(0).toLowerCase()}${nom.slice(1)} n’est plus ${fem ? 'confirmée' : 'confirmé'} côté locataires.`;
  }
}
