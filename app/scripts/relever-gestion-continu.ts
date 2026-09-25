/**
 * CLI `gestion:relever-continu` — LOT 5-DIRECT : LA RELÈVE QUI NE S'ARRÊTE PAS.
 *
 * Elle rappelle la MÊME passe que le bouton « Relever maintenant » et que `gestion:relever --appliquer` : mêmes chemins
 * de capture, même verrou, même journal de passes, même idempotence UID + UIDVALIDITY, même reprise après coupure. Elle
 * n'ajoute qu'une chose : un tour toutes les N secondes (réglage `gestion_config.releve_continue_secondes`, 60 par
 * défaut, relu à CHAQUE tour).
 *
 * 🔒 LECTURE STRICTE DE LA BOÎTE, comme toute la relève : ouverture en `readOnly` (EXAMINE), aucun drapeau posé, rien
 * de déplacé ni supprimé, aucun envoi. Ce fichier n'importe RIEN de neuf côté réseau — il réutilise `relever`.
 *
 * 🔴 ELLE NE S'ARRÊTE JAMAIS D'ELLE-MÊME. Ne rien trouver est son état normal. Elle s'arrête sur SIGINT/SIGTERM
 * (Ctrl-C, `launchctl unload`), proprement : le tour en cours se termine, le verrou est rendu, rien n'est laissé à
 * moitié fait.
 *
 * Usage :
 *   npm run gestion:relever-continu            # tourne jusqu'à Ctrl-C
 *   npm run gestion:relever-continu -- --un-tour   # un seul tour (vérification), puis sortie
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';

/** Un seul tour puis sortie — pour vérifier que tout est branché sans lancer un processus de longue durée. PUR. */
export function lireUnTour(argv: readonly string[]): boolean {
  return argv.includes('--un-tour');
}

/** En-tête imprimé AVANT la moindre connexion : devant un terminal muet, « ça tourne » et « c'est bloqué » se ressemblent. */
export function enTete(unTour: boolean): string[] {
  return [
    '',
    '[gestion:relever-continu] RELÈVE CONTINUE — la boîte est relue en boucle, en LECTURE STRICTE.',
    unTour ? '  mode : UN SEUL TOUR (--un-tour), puis sortie.' : '  mode : en continu. Ctrl-C pour arrêter proprement.',
    '  intervalle : lu dans gestion_config.releve_continue_secondes (60 s par défaut), relu à chaque tour.',
    '',
  ];
}

/**
 * L'ATTENTE ENTRE DEUX TOURS, et le moyen de l'interrompre.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA MINUTERIE EST RÉFÉRENCÉE, ET C'EST L'INVERSE DE CE QUI ÉTAIT ÉCRIT ICI. Elle portait un `unref()`, censé
 * « laisser Node sortir quand on a demandé l'arrêt ». Effet RÉEL, mesuré le 25/09/2026 dans le journal du job
 * launchd : une minuterie déréférencée ne retient plus rien, et comme la connexion IMAP est refermée entre deux
 * tours, Node ne voyait plus aucune raison de vivre — il SORTAIT pendant l'attente, proprement (code 0), après UN
 * SEUL tour. Trois en-têtes et trois PID différents dans le journal l'ont montré en trois minutes.
 *
 * CE QUI RENDAIT LE DÉFAUT INVISIBLE : `KeepAlive` relançait le job. Une passe avait bien lieu chaque minute et le
 * résultat semblait juste — mais le processus de longue durée n'existait plus. Chaque tour repayait le démarrage de
 * Node, de tsx et de la connexion ; le réglage « relu à chaud » ne servait plus à rien ; et un redémarrage en boucle
 * ressemblait trait pour trait à un fonctionnement normal.
 *
 * L'ARRÊT PROPRE EST OBTENU PAR UN RÉVEIL EXPLICITE, jamais en laissant Node s'échapper : `reveiller()` annule la
 * minuterie et résout l'attente tout de suite, si bien que SIGTERM rend la main en quelques millisecondes au lieu
 * d'attendre la fin du délai.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `programmer` / `annuler` sont injectables : c'est ce qui permet d'éprouver l'attente sans attendre.
 */
export function creerMinuterie(o: {
  programmer?: (rappel: () => void, ms: number) => unknown;
  annuler?: (jeton: unknown) => void;
} = {}): { attendre: (secondes: number) => Promise<void>; reveiller: () => void } {
  const programmer = o.programmer ?? ((rappel, ms) => setTimeout(rappel, ms));
  const annuler = o.annuler ?? ((jeton) => clearTimeout(jeton as ReturnType<typeof setTimeout>));
  let reveil: (() => void) | null = null;
  return {
    attendre: (secondes) => new Promise<void>((resolve) => {
      let sonne = false;
      const jeton = programmer(() => { sonne = true; reveil = null; resolve(); }, secondes * 1000);
      // Si l'horloge a déjà sonné (cas d'une horloge synchrone, en test), il n'y a plus rien à réveiller : poser le
      //   réveil ici ressusciterait une attente terminée, et un `reveiller()` tardif annulerait une minuterie morte.
      if (sonne) return;
      reveil = () => { annuler(jeton); reveil = null; resolve(); };
    }),
    reveiller: () => { reveil?.(); },
  };
}

/** Câblage RÉEL (imports dynamiques : gardent imapflow et pg hors du graphe importé par les tests). */
async function main(): Promise<void> {
  const unTour = lireUnTour(process.argv);
  for (const l of enTete(unTour)) console.log(l);

  const { boucleContinue } = await import('../lib/gestion/releveContinue');
  const { relever } = await import('../lib/gestion/releveReelle');
  const { chargerConfigGestion } = await import('../lib/gestion/config');

  // Arrêt PROPRE : on ne coupe pas au milieu d'une passe. Le drapeau est lu entre deux tours, jamais pendant.
  let vivant = true;
  let toursRestants = unTour ? 1 : Number.POSITIVE_INFINITY;
  const minuterie = creerMinuterie();
  const arreter = (signal: string) => {
    if (!vivant) return;
    vivant = false;
    console.log(`\n[gestion:relever-continu] ${signal} reçu — arrêt après le tour en cours.`);
    // Sans ce réveil, l'arrêt attendrait la fin du délai — jusqu'à une minute avant de rendre la main.
    minuterie.reveiller();
  };
  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('SIGTERM', () => arreter('SIGTERM'));

  const tours = await boucleContinue({
    relever: async () => {
      // `appliquer = true` : c'est une VRAIE passe. Le journal de la passe est écrit par `executerReleveGestion`.
      // LOT 5-VEILLE — `automatique` la fait journaliser « planifie ». C'est ce mot, et lui seul, qui permet à
      //   l'écran de distinguer « l'ordonnanceur tourne » de « quelqu'un a cliqué » — la question qu'on ne pouvait
      //   pas poser le 25/09, pendant les dix heures sans courrier.
      const issue = await relever(true, undefined, { automatique: true });
      toursRestants -= 1;
      return { resultat: issue.resultat, captures: issue.rapport?.captures ?? null };
    },
    // RELU à chaque tour : `UPDATE gestion_config SET releve_continue_secondes = 30` prend effet au tour suivant,
    //   sans rien redémarrer. Base injoignable ⇒ `chargerConfigGestion` se replie sur 60 s (elle ne jette jamais).
    intervalle: async () => (await chargerConfigGestion()).releveContinueSecondes,
    // L'attente RETIENT le processus (voir `creerMinuterie`) ; l'arrêt la réveille au lieu de laisser Node s'échapper.
    attendre: (s) => (vivant ? minuterie.attendre(s) : Promise.resolve()),
    journal: (l) => console.log(`  ${l}`),
    continuer: () => vivant && toursRestants > 0,
    maintenant: () => new Date(),
  });

  console.log(`\n[gestion:relever-continu] arrêt après ${tours} tour(s).`);
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT, jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[gestion:relever-continu] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
