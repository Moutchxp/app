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
  const arreter = (signal: string) => {
    if (!vivant) return;
    vivant = false;
    console.log(`\n[gestion:relever-continu] ${signal} reçu — arrêt après le tour en cours.`);
  };
  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('SIGTERM', () => arreter('SIGTERM'));

  const tours = await boucleContinue({
    relever: async () => {
      // `appliquer = true` : c'est une VRAIE passe. Le journal de la passe est écrit par `executerReleveGestion`.
      const issue = await relever(true);
      toursRestants -= 1;
      return { resultat: issue.resultat, captures: issue.rapport?.captures ?? null };
    },
    // RELU à chaque tour : `UPDATE gestion_config SET releve_continue_secondes = 30` prend effet au tour suivant,
    //   sans rien redémarrer. Base injoignable ⇒ `chargerConfigGestion` se replie sur 60 s (elle ne jette jamais).
    intervalle: async () => (await chargerConfigGestion()).releveContinueSecondes,
    attendre: (s) => new Promise<void>((resolve) => {
      const t = setTimeout(resolve, s * 1000);
      // `unref` : une attente en cours n'empêche pas Node de sortir quand on a demandé l'arrêt.
      if (typeof t.unref === 'function') t.unref();
      if (!vivant) { clearTimeout(t); resolve(); }
    }),
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
