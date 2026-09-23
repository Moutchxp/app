/**
 * CLI `gestion:relever` — MODULE « GESTION », LOT 3. DEUX modes, UNE SEULE frontière d'écriture.
 *
 *   • DÉFAUT (sans --appliquer) = SIMULATION. La boîte est LUE (ouverture `readOnly`), tout est calculé — sens du
 *     message, gabarit d'objet, règles d'exclusion, compteurs — et RIEN n'est écrit : ni en base, ni sur le stockage
 *     objet, pas même la ligne du journal des passes (qui serait déjà une écriture). C'est le mode qui permet de
 *     regarder ce qu'une relève ferait AVANT de la laisser faire.
 *
 *   • --appliquer = VRAIE PASSE. Capture les messages non encore connus, applique les règles d'exclusion actives,
 *     dépose les pièces, et journalise la passe dans `gestion_releve_run`. Le plafond par passe vient de la
 *     configuration : au-delà, la passe s'arrête et la suivante REPREND où elle en était.
 *
 * Aucune boîte configurée → message clair et sortie 0 (ce n'est PAS une erreur — même convention que `demandes:relever`).
 * Une passe déjà en cours → message clair et sortie 0 (le verrou a fait son travail).
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import type { IssueReleve } from '../lib/gestion/releve';

/** Mode demandé. PUR. */
export function lireAppliquer(argv: readonly string[]): boolean {
  return argv.includes('--appliquer');
}

/**
 * LOT 3-ter — EN-TÊTE, imprimé AVANT LA MOINDRE CONNEXION. Auparavant la CLI n'affichait rien tant que la passe n'était
 * pas finie : devant un terminal muet, « ça travaille » et « c'est bloqué » se ressemblaient exactement — d'où 25 minutes
 * d'attente avant un plantage. Le mode, lui, doit se lire AVANT que quoi que ce soit ne puisse écrire. PUR.
 */
export function enTeteMode(appliquer: boolean): string[] {
  return [
    '',
    `[gestion:relever] ${appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)'}`,
    appliquer ? '  démarrage…' : '  démarrage… (ajouter --appliquer pour exécuter réellement)',
  ];
}

/**
 * Compte rendu d'une passe, ligne à ligne. PUR (aucun `console.log` ici) → testable. Le mode est dit EN TÊTE et en
 * toutes lettres : lire « SIMULATION » ou « APPLIQUÉ » ne doit jamais demander un effort.
 */
export function imprimerIssue(issue: IssueReleve, appliquer: boolean): string[] {
  const l: string[] = [];
  const mode = appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)';
  l.push('');
  l.push(`[gestion:relever] ${mode}`);

  // LOT 3-ter — un ÉCHEC est annoncé comme tel, MAIS ses compteurs sont imprimés quand la passe avait déjà travaillé :
  //   ce qui a été capturé est acquis, et la passe suivante reprendra où celle-ci s'est arrêtée.
  if (issue.resultat === 'erreur') l.push(`  ⚠ ÉCHEC : ${issue.raison}`);

  if (issue.rapport === null) {
    if (issue.resultat !== 'erreur') l.push(`  rien à faire : ${issue.raison}`);
    l.push('');
    return l;
  }

  const r = issue.rapport;
  l.push(`  dossier                     : ${r.dossier}`);
  l.push(`  fenêtre (depuis)            : ${r.depuis}`);
  l.push(`  UID renvoyés par le serveur : ${r.uidsServeur}${r.plafondAtteint ? `  ⚠ PLAFOND ATTEINT → ${r.uidsServeur - r.vus} message(s) pour la passe suivante` : ''}`);
  l.push(`  messages lus                : ${r.vus}`);
  l.push(`  déjà connus (ignorés)       : ${r.dejaConnus}`);
  l.push(`  illisibles (ignorés)        : ${r.echecsLecture}`);
  l.push(`  CAPTURÉS                    : ${r.captures}   (${r.recus} reçu(s), ${r.envoyes} envoyé(s))`);
  l.push(`  tenus hors de la file       : ${r.exclus}   (enregistrés, jamais supprimés)`);
  for (const [motif, n] of Object.entries(r.parRegle).sort((a, b) => b[1] - a[1])) {
    l.push(`      ${String(n).padStart(5, ' ')}  ${motif}`);
  }
  l.push(`  fils créés / fusionnés      : ${r.filsCrees} / ${r.filsFusionnes}`);
  l.push(`  pièces déposées / refusées  : ${r.piecesDeposees} / ${r.piecesNonDeposees}`);
  if (!appliquer) {
    l.push('');
    l.push('  ⓘ SIMULATION : rien n’a été écrit. Les fils et les pièces ne sont comptés qu’en mode appliqué.');
    l.push('    Pour exécuter réellement : relancer avec --appliquer');
  }
  l.push('');
  return l;
}

/** Cœur du CLI, testable par injection. Renvoie le code de sortie. */
export async function executerCli(opts: {
  argv: readonly string[];
  relever: (appliquer: boolean, journal: (ligne: string) => void) => Promise<IssueReleve>;
  log: (s: string) => void;
}): Promise<number> {
  const appliquer = lireAppliquer(opts.argv);
  for (const ligne of enTeteMode(appliquer)) opts.log(ligne);      // AVANT la moindre connexion
  const issue = await opts.relever(appliquer, (l) => opts.log(`  ${l}`)); // progression, au fil de la passe
  for (const ligne of imprimerIssue(issue, appliquer)) opts.log(ligne);
  return issue.resultat === 'erreur' ? 1 : 0; // 'inactif' et 'occupe' ne sont PAS des erreurs
}

/** Câblage RÉEL (import dynamique : garde imapflow/pg hors du graphe importé par les tests). */
async function main(): Promise<void> {
  const { relever } = await import('../lib/gestion/releveReelle');
  process.exitCode = await executerCli({ argv: process.argv, relever, log: (s) => console.log(s) });
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT, jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[gestion:relever] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
