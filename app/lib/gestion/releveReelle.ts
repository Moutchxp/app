/**
 * MODULE « GESTION » — LOT 3 : CÂBLAGE RÉEL de la passe de relève. Ce fichier existe pour une raison précise : garder les
 * IMPORTS LOURDS (imapflow via imap.ts, le SDK S3 via le stockage) HORS du graphe statique des tests et de l'écran. Ils
 * sont chargés DYNAMIQUEMENT, au moment d'ouvrir la boîte — jamais à l'import.
 *
 * 🔒 `app/lib/email/imap.ts` N'EST PAS MODIFIÉ : on n'appelle que `creerClientApprofondi`, qui savait déjà lister les
 * dossiers et en ouvrir un par son chemin en `readOnly`. Le compte est le compte PAR DÉFAUT — la boîte déjà relevée par
 * la veille des permis, celle qui porte le libellé de gestion. Aucun nouvel identifiant, aucun OAuth.
 */
import { capturer } from './capture';
import { chargerConfigGestion } from './config';
import { depsReellesCapture, finaliserRun, insererRun, verrouGestion, type ClientDossier } from './captureRepo';
import { executerReleveGestion, type DepsReleveGestion, type IssueReleve } from './releve';

/** Dépendances RÉELLES de la passe. Le client IMAP n'est construit qu'au moment où on en a besoin. */
export function depsReellesReleve(): DepsReleveGestion {
  const verrou = verrouGestion();
  return {
    maintenant: () => new Date(),
    config: chargerConfigGestion,
    creerClient: async (): Promise<ClientDossier | null> => {
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(''); // compte PAR DÉFAUT = la boîte qui porte le libellé de gestion
      if (compte === null) return null;  // profil inactif : rien à relever, ce n'est pas une erreur
      const { creerClientApprofondi } = await import('../email/imap');
      return creerClientApprofondi(compte) as unknown as ClientDossier;
    },
    acquerirVerrou: verrou.acquerir,
    libererVerrou: verrou.liberer,
    insererRun: (dossier) => insererRun('manuel', dossier),
    finaliserRun,
    capturer: (client, appliquer) => capturer(depsReellesCapture(client), appliquer),
  };
}

/** UNE passe réelle (ou simulée). Ne relance jamais : l'appelant décide quoi faire de l'issue. */
export function relever(appliquer: boolean): Promise<IssueReleve> {
  return executerReleveGestion(depsReellesReleve(), appliquer);
}
