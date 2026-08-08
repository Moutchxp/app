/**
 * R6 — ÉCHÉANCE d'une demande CRPA. Module PUR : aucune I/O, aucun import de pg ni d'imapflow. Contexte établi (non
 * rediscuté ici) : le silence gardé pendant UN MOIS sur une demande CRPA vaut décision de refus (refus tacite), ce qui
 * ouvre la voie à la CADA ; le délai court à partir de l'ENVOI RÉEL (demande_acheminement.envoye_le). Ce module se borne à
 * CALCULER l'échéance (un mois calendaire) et un ÉTAT qualifiant la situation. Il NE génère aucune relance, N'ENVOIE aucune
 * alerte, et NE CITE AUCUN numéro d'article de loi (voir le compte rendu du chantier pour ce point).
 *
 * ⚠️ Point CENTRAL : on n'annonce JAMAIS un silence qu'on n'a pas vérifié. Sans relève récente (fraîcheur), l'état est
 * 'indeterminee' — impossible de distinguer « la mairie s'est tue » de « on n'a pas regardé ».
 */

export type EtatEcheance = 'non_delivree' | 'repondue' | 'indeterminee' | 'depassee' | 'proche' | 'en_cours';

export interface EntreeEcheance {
  envoyeLe: Date | null;             // demande_acheminement.envoye_le (envoi RÉEL) ; null si pas encore envoyée
  statutAcheminement: string;        // statut du canal e-mail : 'en_attente' | 'envoye' | 'rebond' | 'echec'
  aReponseRattachee: boolean;        // une réponse est-elle déjà rattachée à cette demande ?
  derniereReleveOkLe: Date | null;   // termine_le du dernier releve_run « ok » (fraîcheur) ; null si jamais relevé
}

export interface ReglagesEcheance {
  echeanceAlerteJours: number;       // fenêtre « proche » : nombre de jours avant l'échéance
  releveFraicheurHeures: number;     // au-delà de cette ancienneté, la dernière relève est trop vieille → 'indeterminee'
}

export interface ResultatEcheance {
  etat: EtatEcheance;
  joursRestants: number | null;      // jours avant l'échéance (négatif si dépassée) ; null si non calculable
  motif: string;                     // phrase française lisible expliquant l'état — TOUJOURS non vide
}

const MS_JOUR = 86_400_000;
const MS_HEURE = 3_600_000;

/**
 * Échéance = envoi + UN MOIS CALENDAIRE (jamais « 30 jours »), avec débordement de fin de mois : un envoi le 31 janvier
 * échoit le 28 février (ou le 29 en année bissextile) — on borne le jour au dernier jour du mois cible. Calcul en UTC
 * (déterministe, indépendant du fuseau de la machine).
 */
export function echeanceDe(envoyeLe: Date): Date {
  const y = envoyeLe.getUTCFullYear();
  const moisCible = envoyeLe.getUTCMonth() + 1;      // Date.UTC normalise décembre → janvier de l'année suivante
  const jour = envoyeLe.getUTCDate();
  const dernierJourCible = new Date(Date.UTC(y, moisCible + 1, 0)).getUTCDate(); // jour 0 du mois suivant = dernier jour du mois cible
  const jourCible = Math.min(jour, dernierJourCible);
  return new Date(Date.UTC(y, moisCible, jourCible,
    envoyeLe.getUTCHours(), envoyeLe.getUTCMinutes(), envoyeLe.getUTCSeconds(), envoyeLe.getUTCMilliseconds()));
}

/**
 * État d'échéance, ordre de PRIORITÉ STRICT :
 *   non_delivree (rebond/échec — prioritaire sur tout) > repondue > [pas encore envoyée] > indeterminee (relève trop
 *   vieille / jamais) > depassee (échéance passée, relève fraîche) > proche > en_cours.
 */
export function etatEcheance(entree: EntreeEcheance, maintenant: Date, reglages: ReglagesEcheance): ResultatEcheance {
  // 1) NON DÉLIVRÉE — prioritaire sur TOUT. Une demande jamais arrivée ne peut pas produire de refus tacite : parler de
  //    silence de l'administration dans ce cas serait un contresens.
  if (entree.statutAcheminement === 'rebond' || entree.statutAcheminement === 'echec') {
    return { etat: 'non_delivree', joursRestants: null, motif: 'La demande n’est pas parvenue à la mairie (rebond ou échec d’acheminement) : aucun délai ne court, aucun refus tacite possible.' };
  }

  // 2) RÉPONDUE — une réponse est rattachée : le silence est rompu (peu importe la fraîcheur de la relève).
  if (entree.aReponseRattachee) {
    return { etat: 'repondue', joursRestants: null, motif: 'Une réponse de la mairie est rattachée à cette demande.' };
  }

  // Pas encore envoyée : le délai d'un mois ne court pas encore.
  if (entree.envoyeLe === null) {
    return { etat: 'en_cours', joursRestants: null, motif: 'Demande pas encore envoyée : le délai d’un mois ne court pas.' };
  }

  // 3) INDÉTERMINÉE — sans relève récente, on ne SAIT pas si la mairie s'est tue ou si on n'a pas regardé. On refuse
  //    d'annoncer un silence non vérifié, MÊME si l'échéance est largement dépassée.
  const releveFraiche = entree.derniereReleveOkLe !== null
    && (maintenant.getTime() - entree.derniereReleveOkLe.getTime()) <= reglages.releveFraicheurHeures * MS_HEURE;
  if (!releveFraiche) {
    return { etat: 'indeterminee', joursRestants: null, motif: 'Aucune relève récente de la boîte : impossible d’affirmer que la mairie n’a pas répondu (silence non vérifié).' };
  }

  // 4) Relève fraîche → on peut se prononcer. Échéance = un mois calendaire depuis l'envoi réel.
  const echeance = echeanceDe(entree.envoyeLe);
  const resteMs = echeance.getTime() - maintenant.getTime();
  const joursRestants = Math.ceil(resteMs / MS_JOUR);

  if (resteMs <= 0) {
    return { etat: 'depassee', joursRestants, motif: 'Échéance d’un mois dépassée (relève à jour) : le silence gardé peut valoir refus tacite, ce qui ouvre la voie à la CADA.' };
  }
  if (resteMs <= reglages.echeanceAlerteJours * MS_JOUR) {
    return { etat: 'proche', joursRestants, motif: `Échéance proche : environ ${joursRestants} jour(s) avant la fin du délai d’un mois.` };
  }
  return { etat: 'en_cours', joursRestants, motif: `Délai d’un mois en cours : environ ${joursRestants} jour(s) restants.` };
}
