/**
 * MODULE « GESTION » — LOT 5-DEST : CÂBLAGE RÉEL de la complétion. Même rôle, et mêmes précautions, que
 * `releveReelle.ts` pour la relève : garder les IMPORTS LOURDS (`imapflow`, le pilote `pg`) HORS du graphe statique des
 * tests et de l'écran. Ils sont chargés DYNAMIQUEMENT, au moment d'ouvrir la boîte — jamais à l'import.
 *
 * 🔒 `app/lib/email/imap.ts` N'EST PAS TOUCHÉ. Ce lot n'emprunte à ce module que la LECTURE DU COMPTE
 * (`lireCompteImap`), qui ne fait que lire des variables d'environnement. La connexion, elle, passe par le client
 * propre au module (`clientEntetes.ts`), qui ne demande que quatre lignes d'en-tête et n'expose aucune écriture.
 *
 * 🔒 LE VERROU EST CELUI DE LA RELÈVE, délibérément. Les deux opérations lisent la même boîte et écrivent dans les
 * mêmes lignes : les laisser tourner ensemble ferait, au mieux, du travail en double, au pire deux passes se disputant
 * la limite de téléchargement du fournisseur.
 */
import { executerCompletion, type DepsCompletion, type OptionsCompletion } from './completionPasse';
import { noterErreur, nouvelEtat } from './clientSurveille';
import { chargerConfigGestion } from './config';
import { destinatairesSeparesDisponibles } from './schema';
import { compterRestantes, ecrireLot, journaliserCompletion, lireACompleter } from './completionRepo';
import { verrouGestion } from './captureRepo';
import type { IssueCompletion } from './completion';

/** Dépendances RÉELLES. Le client IMAP n'est construit qu'au moment où on en a besoin. */
export function depsReellesCompletion(journal?: (ligne: string) => void): DepsCompletion {
  const verrou = verrouGestion();
  return {
    schemaPret: destinatairesSeparesDisponibles,
    dossier: async () => (await chargerConfigGestion()).dossierImap,
    acquerirVerrou: verrou.acquerir,
    libererVerrou: verrou.liberer,
    creerClient: async () => {
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(''); // compte PAR DÉFAUT = la boîte qui porte le libellé de gestion
      if (compte === null) return null;  // profil inactif : ce n'est pas une erreur
      const { creerClientEntetes } = await import('./clientEntetes');
      // L'écouteur d'erreur n'est PAS optionnel en pratique : sans lui, une panne réseau tue le processus (lot 3-ter).
      return creerClientEntetes(compte, noterErreur(nouvelEtat()));
    },
    lireACompleter,
    compterRestantes,
    ecrireLot,
    journaliser: journaliserCompletion,
    journal,
  };
}

/** UNE passe réelle (ou simulée). Ne relance jamais : l'appelant décide quoi faire de l'issue. */
export function completer(
  appliquer: boolean, journal: ((ligne: string) => void) | undefined, options: OptionsCompletion,
): Promise<IssueCompletion> {
  return executerCompletion(depsReellesCompletion(journal), appliquer, options);
}
