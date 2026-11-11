import { locatairesAvis } from './mailsPreavisSortieRepo';
import { MOTIF_AUCUN_EMAIL_LOCATAIRE, rendezVousBloque } from './emailLocataireRequis';

/**
 * 🔴 Arno (11/11/2026) — le refus du SERVEUR quand aucun locataire du préavis n'a d'e-mail (adresses EN VIGUEUR, celles des mails de la
 * Location). Appelé en TÊTE de chaque geste de rendez-vous (pré-visite, état des lieux de sortie), avant toute écriture. `null` : permis.
 */
export async function refusSansEmailLocataire(occupationIds: readonly number[]): Promise<{ etat: 'refus'; motif: string; champ: 'locataires' } | null> {
  const ids = [...new Set(occupationIds)];
  if (ids.length === 0) return null; // la demande incomplète est refusée plus loin, par le geste lui-même
  return rendezVousBloque(await locatairesAvis(ids)) ? { etat: 'refus', motif: MOTIF_AUCUN_EMAIL_LOCATAIRE, champ: 'locataires' } : null;
}
