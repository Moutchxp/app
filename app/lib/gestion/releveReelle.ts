/**
 * MODULE « GESTION » — LOT 3 : CÂBLAGE RÉEL de la passe de relève. Ce fichier existe pour une raison précise : garder les
 * IMPORTS LOURDS (imapflow via imap.ts, le SDK S3 via le stockage) HORS du graphe statique des tests et de l'écran. Ils
 * sont chargés DYNAMIQUEMENT, au moment d'ouvrir la boîte — jamais à l'import.
 *
 * 🔒 `app/lib/email/imap.ts` N'EST PAS MODIFIÉ : on n'appelle que `creerClientApprofondi`, qui savait déjà lister les
 * dossiers et en ouvrir un par son chemin en `readOnly`. Le compte est le compte PAR DÉFAUT — la boîte déjà relevée par
 * la veille des permis, celle qui porte le libellé de gestion. Aucun nouvel identifiant, aucun OAuth.
 */
import { capturer, type OptionsCapture } from './capture';
import { noterErreur, nouvelEtat, surveiller, type ClientDossier } from './clientSurveille';
import { chargerConfigGestion } from './config';
import { depsReellesCapture, finaliserRun, insererRun, journaliserReconnexion, verrouGestion } from './captureRepo';
import { executerReleveGestion, type DepsReleveGestion, type IssueReleve } from './releve';

/**
 * LOT R — RAPATRIEMENT D'HISTORIQUE. Réglages PONCTUELS d'une passe, portés par l'appel et jamais écrits en base.
 *
 * 🔴 POURQUOI ILS NE TOUCHENT PAS `gestion_config` : remonter `rattrapage_jours` à 3 000 jours rapatrierait bien
 * l'historique, mais ferait aussi repartir de zéro la fenêtre de TOUTES les relèves suivantes, pour toujours. Le
 * rattrapage est une OPÉRATION, pas un réglage : il vit le temps d'une commande, et la relève quotidienne (écran,
 * planificateur) continue de lire exactement les mêmes réglages qu'avant.
 */
export interface OptionsRattrapage {
  /** Remonter à l'ORIGINE du dossier plutôt qu'à `rattrapage_jours`. La passe est alors journalisée « rattrapage ». */
  depuisOrigine?: boolean;
  /** Plafond de CETTE passe seulement (la configuration n'est pas touchée). */
  plafond?: number;
  /**
   * LOT 5-VEILLE — la passe vient de l'ORDONNANCEUR (job launchd), pas d'un humain. Elle est alors journalisée
   * « planifie », valeur que la base acceptait déjà sans que personne ne la pose.
   *
   * 🔴 POURQUOI CETTE DISTINCTION EXISTE. Jusqu'au 25/09/2026, les passes automatiques s'enregistraient « manuel »,
   * exactement comme un clic sur « Relever maintenant » : impossible de savoir, en base, si l'ordonnanceur tournait
   * encore. Le jour de l'incident — dix heures sans courrier — cette question était précisément celle qu'il fallait
   * pouvoir poser, et l'écran ne pouvait pas y répondre.
   */
  automatique?: boolean;
}

/**
 * L'« origine » d'un dossier IMAP. Aucune boîte n'a de message antérieur, et `SEARCH SINCE` ne connaît de toute façon
 * que le jour : une date de garde très ancienne vaut mieux qu'un `1970` qui heurte les serveurs comptant en temps Unix.
 */
export const ORIGINE_DOSSIER = new Date(Date.UTC(1990, 0, 1));

/**
 * SOUS QUELLE ÉTIQUETTE une passe est journalisée. PUR, et écrit UNE fois : trois `? :` dispersés finiraient par se
 * contredire, et c'est le journal des passes — la seule mémoire de ce qui a tourné — qui en paierait le prix.
 *
 * L'ordre compte : un rattrapage LANCÉ par l'ordonnanceur resterait un rattrapage. C'est ce qu'il a fait qui le
 * qualifie (remonter à l'origine du dossier), pas qui l'a lancé.
 */
export function declencheurDe(o: OptionsRattrapage): 'manuel' | 'planifie' | 'rattrapage' {
  if (o.depuisOrigine === true) return 'rattrapage';
  return o.automatique === true ? 'planifie' : 'manuel';
}

/**
 * Dépendances RÉELLES de la passe. Le client IMAP n'est construit qu'au moment où on en a besoin.
 *
 * 🔴 LOT 3-ter — DEUX PROTECTIONS POSÉES ICI, et nulle part ailleurs :
 *   ① un ÉCOUTEUR « error » est fourni au client. Sans lui, une panne réseau fait émettre « error » sans écouteur sur
 *      l'instance ImapFlow, et Node TUE LE PROCESSUS (c'est ce qui est arrivé : Socket timeout, ETIMEOUT, processus mort) ;
 *   ② le client est ENVELOPPÉ (`surveiller`) : dès qu'une erreur de connexion est notée, tout appel suivant échoue vite et
 *      CLAIREMENT — au lieu de laisser la passe compter 397 messages « illisibles » et rendre un faux succès.
 */
export function depsReellesReleve(journal?: (ligne: string) => void, options: OptionsRattrapage = {}): DepsReleveGestion {
  const verrou = verrouGestion();
  // LOT R — options de la passe, calculées UNE fois. Sans option, l'objet est vide et `capturer` se comporte à
  //   l'identique de ce qu'il faisait avant ce lot.
  const optionsCapture: OptionsCapture = {
    ...(options.depuisOrigine === true ? { depuisForce: ORIGINE_DOSSIER } : {}),
    ...((options.plafond ?? 0) > 0 ? { plafondForce: options.plafond } : {}),
  };
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
    // Le DÉCLENCHEUR dit, des mois après, POURQUOI une passe a lu si loin en arrière : « rattrapage » distingue
    //   l'opération ponctuelle d'historique d'une relève ordinaire, sans quoi le journal des passes serait illisible.
    //   LOT 5-VEILLE — et « planifie » distingue l'ORDONNANCEUR d'un clic humain : c'est la seule chose qui permette
    //   à l'écran de dire « la relève automatique est arrêtée » plutôt que « personne n'a cliqué depuis dix heures ».
    insererRun: async (dossier) => {
      runCourant = await insererRun(declencheurDe(options), dossier);
      return runCourant;
    },
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
    }, appliquer, optionsCapture),
  };
}

/**
 * UNE passe réelle (ou simulée). Ne relance jamais : l'appelant décide quoi faire de l'issue.
 *
 * ═══ 🔴 LOT RATTACHEMENT-2 — CE QUI SUIT L'IMPORT, ET POURQUOI C'EST ICI ═════════════════════════════════════════
 * Une passe APPLIQUÉE enchaîne désormais, après l'import : le relevé des adresses des messages nouveaux, puis le
 * rattachement des échanges touchés. C'est branché ICI et non dans la seule boucle continue, pour que les TROIS voies
 * d'une vraie passe — le job launchd, le bouton « Relever maintenant », `gestion:relever --appliquer` — se comportent
 * de la même façon. Trois comportements pour une même passe finiraient par diverger, et c'est toujours celui qu'on
 * regarde le moins qui garde le défaut.
 *
 * 🔴 L'ENCHAÎNEMENT NE PEUT PAS FAIRE ÉCHOUER LA RELÈVE. `enchainerApresReleve` attrape tout et rend un verdict ;
 * l'issue de la relève, elle, n'est pas touchée. Le courrier qui entre est la fonction vitale ; le rattachement est
 * un confort, et un confort ne met jamais la fonction vitale en péril.
 *
 * ⚠️ RIEN EN SIMULATION, ET RIEN QUAND LA PASSE A ÉCHOUÉ. Une simulation n'écrit pas — ce serait sa seule écriture ;
 * une passe ratée n'a rien importé de fiable à rattacher.
 *
 * ⚠️ IMPORT DYNAMIQUE, comme le reste de ce fichier : il garde le graphe des rattachements hors des tests qui
 * n'importent que la relève.
 */
export async function relever(
  appliquer: boolean, journal?: (ligne: string) => void, options: OptionsRattrapage = {},
): Promise<IssueReleve> {
  const issue = await executerReleveGestion(depsReellesReleve(journal, options), appliquer);
  if (!appliquer || issue.resultat !== 'ok') return issue;

  const { consignerSuite, enchainerApresReleve } = await import('./suiteReleveReel');
  const suite = await enchainerApresReleve(journal);
  await consignerSuite(issue.runId, suite);
  return issue;
}

/**
 * NOTER EN BASE POURQUOI LA BOUCLE S'EST ARRÊTÉE. RÉEXPORTÉ ICI, et pas importé directement par la CLI : celle-ci ne
 * doit atteindre AUCUN dépôt d'écriture — c'est sa garantie depuis le lot 3, et un test la tient sur la liste
 * EXHAUSTIVE de ses imports. Le foyer de relève reste donc le seul chemin par lequel elle touche la base.
 */
export { noterArretBoucle } from './captureRepo';
