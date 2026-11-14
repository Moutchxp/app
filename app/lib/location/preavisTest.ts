/**
 * ══ 🔴🔴 LE PRÉAVIS DE TEST (Arno, 14/11/2026) — MODULE PUR ═════════════════════════════════════════════════════════════════════════════════
 * Les libellés du bien et du locataire FICTIFS, le badge, et le rendez-vous « dans 2 minutes » (pour recevoir l'invitation de début de
 * pré-visite tout de suite). ⚠️ AUCUN IMPORT QUI TIRE `pg` (partagé avec l'écran).
 */
export const ADRESSE_TEST = '1 rue du Préavis de Test (FICTIF)';
export const CP_TEST = '00000';
export const COMMUNE_TEST = 'TEST';
export const PROPRIETAIRE_TEXTE_TEST = 'TEST — aucun propriétaire (bien fictif)';
export const NOM_LOCATAIRE_TEST = 'TEST';
export const PRENOM_LOCATAIRE_TEST = 'Locataire fictif';
export const BADGE_TEST = 'TEST';
export const MOTIF_SANS_473 = 'Préavis de test : disponible après la mise à jour de la base (migration 473).';
export const EXPLICATION_TEST = 'Un bien et un locataire FICTIFS ; l’e-mail du locataire est le vôtre. Tous les mails du test (préavis, pré-visite, invitation de début de pré-visite, compte rendu, sortie) ne partent qu’à votre adresse — jamais aux partenaires, aux clients ou aux collègues ; l’agenda : le vôtre seulement. Le test n’entre dans aucun compteur, alerte ni analyse, et les autres ne le voient pas. « Supprimer ce préavis de test » l’annule et le masque partout.';

/** Une ligne « de test » ne compte jamais (pastilles, compteurs, alertes). PUR. */
export const horsTest = <L extends { test?: boolean }>(lignes: readonly L[]): L[] => lignes.filter((l) => l.test !== true);

/** Le rendez-vous « dans 2 minutes » (heure de Paris, à la minute), 15 minutes de durée. PUR. */
export function rdvDansDeuxMinutes(maintenant: Date = new Date()): { jour: string; debut: string; fin: string } {
  const f = (d: Date) => {
    const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return { jour: `${v('year')}-${v('month')}-${v('day')}`, heure: `${v('hour')}:${v('minute')}` };
  };
  // la minute pleine suivante + 2 : jamais dans le passé, même à la 59e seconde
  const debut = new Date(Math.ceil(maintenant.getTime() / 60_000) * 60_000 + 2 * 60_000);
  const fin = new Date(debut.getTime() + 15 * 60_000);
  const a = f(debut); const b = f(fin);
  // un rendez-vous ne passe pas minuit : la fin reste le même jour
  return { jour: a.jour, debut: a.heure, fin: b.jour === a.jour ? b.heure : '23:59' };
}
