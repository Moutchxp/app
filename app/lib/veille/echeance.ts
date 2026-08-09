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

export type EtatEcheance = 'non_delivree' | 'repondue' | 'repondue_partiellement' | 'indeterminee' | 'depassee' | 'proche' | 'en_cours';

export interface EntreeEcheance {
  envoyeLe: Date | null;             // demande_acheminement.envoye_le (envoi RÉEL) ; null si pas encore envoyée
  statutAcheminement: string;        // statut du canal e-mail : 'en_attente' | 'envoye' | 'rebond' | 'echec'
  dossiersActifs: number;            // R6c : nb de dossiers ACTIFS de la demande
  dossiersSatisfaits: number;        // R6c : nb de ces dossiers dont les pièces ont été OBTENUES (satisfait_le renseigné)
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
 * X2 — critère de FRAÎCHEUR de la relève (EXTRAIT d'etatEcheance pour être partagé, jamais réinventé) : la dernière relève
 * réussie est-elle assez récente pour qu'on puisse SE PRONONCER sur le silence de la mairie ? `null` (jamais relevé) ou trop
 * ancienne → non fraîche → on ne peut PAS affirmer que la mairie n'a pas répondu.
 */
export function releveEstFraiche(derniereReleveOkLe: Date | null, maintenant: Date, fraicheurHeures: number): boolean {
  return derniereReleveOkLe !== null && (maintenant.getTime() - derniereReleveOkLe.getTime()) <= fraicheurHeures * MS_HEURE;
}

/** X2 — état de la FENÊTRE de saisine CADA (trois valeurs). Ancré sur l'envoi réel de la demande initiale. */
export type EtatFenetreCada = 'pas_ouverte' | 'ouverte' | 'fermee';
export interface FenetreCada {
  refusTaciteLe: Date;          // naissance du refus tacite = envoi + 1 mois calendaire (echeanceDe)
  forclusionLe: Date;           // fin du délai de saisine = refus + 2 mois calendaires (forclusion au-delà)
  etat: EtatFenetreCada;        // pas_ouverte (refus non acquis) | ouverte (dans les 2 mois) | fermee (forclos)
  joursAvantForclusion: number; // jours entiers avant la forclusion (négatif une fois forclos)
}

/**
 * X2 — fenêtre de saisine CADA à partir de l'envoi réel. Le refus tacite naît à UN mois (echeanceDe) ; la CADA se saisit dans
 * les DEUX mois suivants — soit `echeanceDe` appliqué DEUX fois de plus (réutilise le mois calendaire, avec son débordement de
 * fin de mois). La borne de forclusion est INCLUSIVE (le dernier jour du délai est encore ouvert). PUR, aucune requête.
 */
export function fenetreCada(envoyeLe: Date, maintenant: Date): FenetreCada {
  const refusTaciteLe = echeanceDe(envoyeLe);                       // + 1 mois
  const forclusionLe = echeanceDe(echeanceDe(refusTaciteLe));        // + 2 mois après le refus (mois calendaires réutilisés)
  const joursAvantForclusion = Math.ceil((forclusionLe.getTime() - maintenant.getTime()) / MS_JOUR);
  const t = maintenant.getTime();
  const etat: EtatFenetreCada = t < refusTaciteLe.getTime() ? 'pas_ouverte' : (t <= forclusionLe.getTime() ? 'ouverte' : 'fermee');
  return { refusTaciteLe, forclusionLe, etat, joursAvantForclusion };
}

/**
 * État d'échéance, ordre de PRIORITÉ STRICT (R6c) :
 *   non_delivree (rebond/échec — prioritaire sur tout) > repondue (documents obtenus pour TOUS les dossiers actifs) >
 *   [pas encore envoyée] > indeterminee (relève trop vieille / jamais) > depassee (échéance passée, relève fraîche) >
 *   repondue_partiellement (réponse partielle AVANT l'échéance) > proche > en_cours.
 *
 * ⚠️ « repondue » ne signifie plus « un message est arrivé » mais « documents OBTENUS » : elle exige que TOUS les dossiers
 * actifs soient satisfaits (un accusé de réception ou une réponse partielle ne suffit pas). Une réponse PARTIELLE n'ouvre
 * AUCUN nouveau délai : l'échéance reste ancrée sur l'envoi d'origine (echeanceDe(envoyeLe)), et une fois cette date passée
 * l'état devient 'depassee' (pour réclamer les dossiers restants) — 'repondue_partiellement' est donc l'état d'une réponse
 * partielle tant que le délai court encore. Un message rattaché ne satisfaisant AUCUN dossier ne change rien à l'état.
 */
export function etatEcheance(entree: EntreeEcheance, maintenant: Date, reglages: ReglagesEcheance): ResultatEcheance {
  // 1) NON DÉLIVRÉE — prioritaire sur TOUT. Une demande jamais arrivée ne peut pas produire de refus tacite : parler de
  //    silence de l'administration dans ce cas serait un contresens.
  if (entree.statutAcheminement === 'rebond' || entree.statutAcheminement === 'echec') {
    return { etat: 'non_delivree', joursRestants: null, motif: 'La demande n’est pas parvenue à la mairie (rebond ou échec d’acheminement) : aucun délai ne court, aucun refus tacite possible.' };
  }

  const actifs = entree.dossiersActifs;
  const satisfaits = entree.dossiersSatisfaits;

  // 2) RÉPONDUE — documents OBTENUS pour TOUS les dossiers actifs (fait connu ; indépendant de la fraîcheur de la relève).
  if (actifs > 0 && satisfaits >= actifs) {
    return { etat: 'repondue', joursRestants: null, motif: `Documents obtenus pour la totalité des dossiers (${satisfaits}/${actifs}).` };
  }

  // Pas encore envoyée : le délai d'un mois ne court pas encore.
  if (entree.envoyeLe === null) {
    return { etat: 'en_cours', joursRestants: null, motif: 'Demande pas encore envoyée : le délai d’un mois ne court pas.' };
  }

  // 3) INDÉTERMINÉE — sans relève récente, on ne SAIT pas si la mairie s'est tue ou si on n'a pas regardé. On refuse
  //    d'annoncer un silence non vérifié, MÊME si l'échéance est largement dépassée.
  const releveFraiche = releveEstFraiche(entree.derniereReleveOkLe, maintenant, reglages.releveFraicheurHeures);
  if (!releveFraiche) {
    return { etat: 'indeterminee', joursRestants: null, motif: 'Aucune relève récente de la boîte : impossible d’affirmer que la mairie n’a pas répondu (silence non vérifié).' };
  }

  // 4) Relève fraîche → on peut se prononcer. Échéance = un mois calendaire depuis l'envoi réel (ANCRE fixe, jamais
  //    déplacée par une réponse partielle).
  const echeance = echeanceDe(entree.envoyeLe);
  const resteMs = echeance.getTime() - maintenant.getTime();
  const joursRestants = Math.ceil(resteMs / MS_JOUR);

  if (resteMs <= 0) {
    // Échéance expirée : dossiers restants en souffrance → 'depassee' (relance partielle ou totale des non satisfaits).
    const detail = satisfaits > 0 ? ` Réponse partielle reçue (${satisfaits}/${actifs}) : les dossiers restants demeurent dus.` : '';
    return { etat: 'depassee', joursRestants, motif: `Échéance d’un mois dépassée (relève à jour) : le silence gardé peut valoir refus tacite, ce qui ouvre la voie à la CADA.${detail}` };
  }
  // Délai encore en cours. Une réponse PARTIELLE est un état distinct (documents obtenus pour une partie, le délai courant).
  if (satisfaits > 0) {
    return { etat: 'repondue_partiellement', joursRestants, motif: `Réponse partielle reçue (${satisfaits}/${actifs}) : le délai d’un mois continue de courir (environ ${joursRestants} jour(s) restants).` };
  }
  if (resteMs <= reglages.echeanceAlerteJours * MS_JOUR) {
    return { etat: 'proche', joursRestants, motif: `Échéance proche : environ ${joursRestants} jour(s) avant la fin du délai d’un mois.` };
  }
  return { etat: 'en_cours', joursRestants, motif: `Délai d’un mois en cours : environ ${joursRestants} jour(s) restants.` };
}
