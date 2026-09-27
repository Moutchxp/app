/**
 * MODULE « GESTION » — LOT 3 : CÂBLAGE RÉEL de la passe de relève. Ce fichier existe pour une raison précise : garder les
 * IMPORTS LOURDS (imapflow via imap.ts, le SDK S3 via le stockage) HORS du graphe statique des tests et de l'écran. Ils
 * sont chargés DYNAMIQUEMENT, au moment d'ouvrir la boîte — jamais à l'import.
 *
 * 🔒 `app/lib/email/imap.ts` N'EST PAS MODIFIÉ : on n'appelle que `creerClientApprofondi`, qui savait déjà lister les
 * dossiers et en ouvrir un par son chemin en `readOnly`. Le compte est le compte PAR DÉFAUT — la boîte déjà relevée par
 * la veille des permis, celle qui porte le libellé de gestion. Aucun nouvel identifiant, aucun OAuth.
 */
import { capturer, type OptionsCapture, type RapportCapture } from './capture';
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
    /**
     * ══ 🔴 LOT ERGO-BOITE-3 — DEUX DOSSIERS DANS UNE SEULE PASSE ═══════════════════════════════════════════════
     * La relève lit d'abord le libellé de gestion, comme elle l'a toujours fait, puis — et seulement si la
     * migration 263 est appliquée — le dossier de SPAM de Gmail. Les deux rapports sont ADDITIONNÉS : une seule
     * ligne de journal des passes, un seul verrou, un seul run. C'est ce qui évite de perturber la veille, qui
     * compte les passes pour savoir si la relève tourne encore.
     *
     * 🔴 LA PASSE DE SPAM NE PEUT PAS FAIRE ÉCHOUER LA RELÈVE. Elle est enveloppée : si le dossier n'existe pas
     * (boîte non Gmail, nom local différent) ou si la connexion tombe, on le DIT dans le journal et on rend le
     * rapport principal intact. Le courrier ordinaire est la fonction vitale ; le spam est un confort.
     *
     * 🔒 LECTURE SEULE, comme tout le reste : `ouvrirBoite` ouvre en EXAMINE (cf. imap.ts, non modifié). Rien
     * n'est marqué lu, rien ne sort du spam, aucun libellé n'est posé. Gmail effacera son spam au bout de
     * 30 jours ; ce que nous avons relevé, nous le gardons.
     */
    capturer: async (_client, appliquer) => {
      /**
       * ══ 🔴 CHAQUE PASSE A SA PROPRE CONNEXION, et ce n'est pas un choix de confort ═══════════════════════════
       * Deux tentatives, deux échecs MESURÉS en lançant la chose pour de vrai — aucun test ne pouvait les voir, le
       * client y est simulé :
       *   ① dépendances NEUVES, même client : `depsReellesCapture` garde un drapeau « déjà connecté » qu'un objet
       *      neuf croit à faux ; il rappelle `ouvrir()` sur la même instance ImapFlow, qui refuse net
       *      (« Can not re-use ImapFlow instance ») ;
       *   ② dépendances PARTAGÉES : `capturer` referme TOUJOURS la boîte dans son `finally` — c'est une garantie du
       *      lot 3-ter, et elle ferme la connexion entière. La seconde passe trouvait alors « Connection not
       *      available », avec un drapeau qui la croyait connectée.
       * La seule forme qui tienne est donc celle que la RECONNEXION utilisait déjà : un client NEUF, avec son propre
       * écouteur d'erreur et sa propre surveillance, et des dépendances neuves par-dessus.
       */
      const principal = await capturer(depsCapture(), appliquer, optionsCapture);
      const spam = await capturerSpam(async () => { courant = await fabriquer(); return depsCapture(); }, appliquer, journal);
      return spam === null ? principal : additionnerRapports(principal, spam);
    },
  };

  /** Les dépendances de capture : elles lisent le client COURANT par un getter, jamais un cadavre de reconnexion. */
  function depsCapture(): Parameters<typeof capturer>[0] {
    return {
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
    };
  }
}

/**
 * LA FENÊTRE DE LA PASSE DE SPAM : 33 jours, et rien d'autre.
 *
 * 🔴 POURQUOI ELLE NE SUIT PAS LE CURSEUR ORDINAIRE. Le curseur de la relève avance avec le libellé de gestion ;
 * appliqué au spam, il ferait sauter les spams plus anciens que la dernière passe — c'est-à-dire tous ceux du
 * premier jour. Or GMAIL SUPPRIME LUI-MÊME SON SPAM AU BOUT DE 30 JOURS : au-delà, il n'y a rien à lire. Une
 * fenêtre fixe de 30 jours + la marge habituelle de 3 couvre donc TOUT ce qui existe, à chaque passe, pour un coût
 * dérisoire — le dédoublonnage par Message-ID et le filtre des UID déjà vus font le reste.
 */
export const SPAM_JOURS = 33;

/** Le dossier de spam d'une boîte Gmail. Relevé sur la vraie boîte le 27/09/2026 : « [Gmail]/Spam ». */
export const DOSSIER_SPAM = '[Gmail]/Spam';

/**
 * LA PASSE DE SPAM. Rend `null` quand elle n'a pas eu lieu — migration absente, ou dossier introuvable — et jamais
 * une exception : l'appelant garde alors son rapport principal tel quel.
 */
async function capturerSpam(
  neufDeps: () => Promise<Parameters<typeof capturer>[0]>, appliquer: boolean, journal?: (l: string) => void,
): Promise<RapportCapture | null> {
  const { spamDisponible } = await import('./schema');
  if (!await spamDisponible()) {
    journal?.('spam : ignoré (migration 263 non appliquée — rien à écrire, rien à lire)');
    return null;
  }
  try {
    journal?.(`spam : lecture du dossier « ${DOSSIER_SPAM} » (lecture seule)`);
    return await capturer(await neufDeps(), appliquer, {
      dossierForce: DOSSIER_SPAM,
      depuisForce: new Date(Date.now() - SPAM_JOURS * 86_400_000),
      marquerSpam: true,
    });
  } catch (e) {
    // On le DIT. Un spam non relevé n'est pas grave ; un échec muet le serait.
    journal?.(`spam : passe ignorée (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
}

/**
 * ADDITIONNE deux rapports de capture. Les compteurs se somment, le dossier annonce les deux, et les MESURES de
 * lenteur gardent les pires des deux — c'est précisément après une passe lente qu'on veut savoir laquelle l'était.
 * PUR.
 */
export function additionnerRapports(a: RapportCapture, b: RapportCapture): RapportCapture {
  const parRegle: Record<string, number> = { ...a.parRegle };
  for (const [k, v] of Object.entries(b.parRegle)) parRegle[k] = (parRegle[k] ?? 0) + v;
  return {
    ...a,
    dossier: `${a.dossier} + ${b.dossier}`,
    // La fenêtre annoncée reste la PLUS ANCIENNE des deux : c'est ce que la passe a réellement couvert au plus loin.
    //   `null` se lit « pas de fenêtre annoncée » et ne doit pas gagner par accident dans une comparaison.
    depuis: a.depuis === null ? b.depuis : b.depuis === null ? a.depuis : (a.depuis < b.depuis ? a.depuis : b.depuis),
    uidsServeur: a.uidsServeur + b.uidsServeur,
    plafondAtteint: a.plafondAtteint || b.plafondAtteint,
    vus: a.vus + b.vus, dejaConnus: a.dejaConnus + b.dejaConnus, captures: a.captures + b.captures,
    recus: a.recus + b.recus, envoyes: a.envoyes + b.envoyes, exclus: a.exclus + b.exclus,
    filsCrees: a.filsCrees + b.filsCrees, filsFusionnes: a.filsFusionnes + b.filsFusionnes,
    piecesDeposees: a.piecesDeposees + b.piecesDeposees, piecesNonDeposees: a.piecesNonDeposees + b.piecesNonDeposees,
    echecsLecture: a.echecsLecture + b.echecsLecture, parRegle,
    dejaVusEcartes: a.dejaVusEcartes + b.dejaVusEcartes, resteInconnus: a.resteInconnus + b.resteInconnus,
    reconnexions: a.reconnexions + b.reconnexions,
    dureeTotaleMs: a.dureeTotaleMs + b.dureeTotaleMs,
    dureeMedianeMs: Math.max(a.dureeMedianeMs, b.dureeMedianeMs),
    dureeMaxMs: Math.max(a.dureeMaxMs, b.dureeMaxMs),
    octetsLus: a.octetsLus + b.octetsLus,
    lesPlusLents: [...a.lesPlusLents, ...b.lesPlusLents].sort((x, y) => y.ms - x.ms).slice(0, a.lesPlusLents.length || 3),
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
