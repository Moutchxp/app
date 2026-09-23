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
import { noterErreur, nouvelEtat, surveiller, type ClientDossier } from './clientSurveille';
import { chargerConfigGestion } from './config';
import { depsReellesCapture, finaliserRun, insererRun, journaliserReconnexion, verrouGestion } from './captureRepo';
import { executerReleveGestion, type DepsReleveGestion, type IssueReleve } from './releve';

/**
 * Dépendances RÉELLES de la passe. Le client IMAP n'est construit qu'au moment où on en a besoin.
 *
 * 🔴 LOT 3-ter — DEUX PROTECTIONS POSÉES ICI, et nulle part ailleurs :
 *   ① un ÉCOUTEUR « error » est fourni au client. Sans lui, une panne réseau fait émettre « error » sans écouteur sur
 *      l'instance ImapFlow, et Node TUE LE PROCESSUS (c'est ce qui est arrivé : Socket timeout, ETIMEOUT, processus mort) ;
 *   ② le client est ENVELOPPÉ (`surveiller`) : dès qu'une erreur de connexion est notée, tout appel suivant échoue vite et
 *      CLAIREMENT — au lieu de laisser la passe compter 397 messages « illisibles » et rendre un faux succès.
 */
export function depsReellesReleve(journal?: (ligne: string) => void): DepsReleveGestion {
  const verrou = verrouGestion();
  // Le client COURANT de la passe. Une reconnexion en installe un NEUF : capturer doit toujours lire celui-là, jamais le
  //   cadavre du précédent — d'où le getter passé à `depsReellesCapture`.
  let courant: ClientDossier | null = null;
  let runCourant: number | null = null;

  /** Fabrique un client NEUF : nouvelle connexion, nouvel écouteur d'erreur, nouvelle surveillance. */
  const fabriquer = async (): Promise<ClientDossier | null> => {
    const { lireCompteImap } = await import('../email');
    const compte = lireCompteImap(''); // compte PAR DÉFAUT = la boîte qui porte le libellé de gestion
    if (compte === null) return null;  // profil inactif : rien à relever, ce n'est pas une erreur
    const { creerClientApprofondi } = await import('../email/imap');
    const etat = nouvelEtat();
    const brut = creerClientApprofondi(compte, noterErreur(etat)) as unknown as ClientDossier;
    return surveiller(brut, etat);
  };

  return {
    maintenant: () => new Date(),
    journal,
    config: chargerConfigGestion,
    creerClient: async () => { courant = await fabriquer(); return courant; },
    acquerirVerrou: verrou.acquerir,
    libererVerrou: verrou.liberer,
    insererRun: async (dossier) => { runCourant = await insererRun('manuel', dossier); return runCourant; },
    finaliserRun,
    capturer: (_client, appliquer) => capturer({
      ...depsReellesCapture(() => courant!),
      journal,
      /**
       * RECONNEXION : on referme (au mieux — la connexion est probablement déjà morte), on fabrique un client NEUF et on
       * rouvre le dossier. Réutiliser l'ancienne instance ImapFlow après une coupure n'est pas fiable : on en prend une
       * autre, avec son propre écouteur d'erreur et son propre état.
       */
      reconnecter: async (chemin: string) => {
        try { await courant?.fermer(); } catch { /* best-effort : refermer un mort ne doit jamais faire échouer la reprise */ }
        courant = await fabriquer();
        if (courant === null) throw new Error('reconnexion impossible : aucun compte IMAP configuré');
        await courant.ouvrir();
        await courant.ouvrirBoite(chemin);
      },
      attendre: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      journaliserReconnexion: async (tentative: number, motif: string) => {
        if (runCourant !== null) await journaliserReconnexion(runCourant, tentative, motif);
      },
    }, appliquer),
  };
}

/** UNE passe réelle (ou simulée). Ne relance jamais : l'appelant décide quoi faire de l'issue. */
export function relever(appliquer: boolean, journal?: (ligne: string) => void): Promise<IssueReleve> {
  return executerReleveGestion(depsReellesReleve(journal), appliquer);
}
