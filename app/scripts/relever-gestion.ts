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
 * Compte rendu d'une passe, ligne à ligne. PUR (aucun `console.log` ici) → testable. Le mode est dit EN TÊTE et en
 * toutes lettres : lire « SIMULATION » ou « APPLIQUÉ » ne doit jamais demander un effort.
 */
export function imprimerIssue(issue: IssueReleve, appliquer: boolean): string[] {
  const l: string[] = [];
  const mode = appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)';
  l.push('');
  l.push(`[gestion:relever] ${mode}`);

  if (issue.resultat !== 'ok' || issue.rapport === null) {
    l.push(`  ${issue.resultat === 'erreur' ? '⚠ échec' : 'rien à faire'} : ${issue.raison}`);
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
    l.push('    Pour exécuter réellement : ajouter --appliquer');
  }
  l.push('');
  return l;
}

/** Cœur du CLI, testable par injection. Renvoie le code de sortie. */
export async function executerCli(opts: {
  argv: readonly string[];
  relever: (appliquer: boolean) => Promise<IssueReleve>;
  log: (s: string) => void;
}): Promise<number> {
  const appliquer = lireAppliquer(opts.argv);
  const issue = await opts.relever(appliquer);
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
