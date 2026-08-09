/**
 * F2 — OUTILLAGE DE GARDE (infrastructure de TEST, JAMAIS importée par du code de production). Logique PURE de détection sur
 * un graphe d'imports DÉJÀ construit — aucune I/O, aucun esbuild ici :
 *   (A) aucun script CLI (`app/scripts/*.ts`) ne doit atteindre un module portant un VRAI `import 'server-only'` ;
 *   (B) liste blanche des importeurs d'un module volontairement « dé-gardé » (ex. `jetonCada.ts`, cf. F1).
 * La construction RÉELLE du graphe (esbuild `--metafile`, sans exécuter le code) vit dans le fichier `.test.ts`. Cette
 * séparation permet de tester la détection avec des données FABRIQUÉES, dont la chaîne exacte du commit 0d57224.
 */

/** Graphe d'imports : fichier (chemin repo-relatif) → fichiers qu'il importe (repo-relatifs ; arêtes internes au dépôt). */
export type GrapheImports = Record<string, string[]>;

/** Une violation (A) : un script atteint un module `server-only`, avec le chemin d'import complet qui les relie. */
export interface ViolationServerOnly {
  script: string;        // point d'entrée CLI concerné
  moduleFautif: string;  // module `server-only` atteint (le plus proche)
  chemin: string[];      // chemin d'import complet : script → … → moduleFautif
}

/** Est-ce un fichier de test (toujours toléré par la liste blanche B) ? */
export function estFichierTest(f: string): boolean {
  return /\.test\.tsx?$/.test(f);
}

/**
 * Plus court chemin d'import de `entry` vers un module de `vraisImporteurs` (BFS), ou `null` si aucun n'est atteignable.
 * Si `entry` lui-même figure dans `vraisImporteurs`, renvoie `[entry]`. PURE.
 */
export function cheminVersServerOnly(graphe: GrapheImports, entry: string, vraisImporteurs: ReadonlySet<string>): string[] | null {
  const prev: Record<string, string | null> = { [entry]: null };
  const file: string[] = [entry];
  while (file.length > 0) {
    const c = file.shift() as string;
    if (vraisImporteurs.has(c)) {
      const chemin: string[] = [];
      let x: string | null | undefined = c;
      while (x != null) { chemin.unshift(x); x = prev[x]; }
      return chemin;
    }
    for (const n of graphe[c] ?? []) {
      if (!(n in prev)) { prev[n] = c; file.push(n); }
    }
  }
  return null;
}

/** (A) Toutes les violations : pour chaque script, le premier module `server-only` atteignable (avec son chemin). PURE. */
export function violationsServerOnly(graphe: GrapheImports, scripts: readonly string[], vraisImporteurs: ReadonlySet<string>): ViolationServerOnly[] {
  const out: ViolationServerOnly[] = [];
  for (const script of scripts) {
    const chemin = cheminVersServerOnly(graphe, script, vraisImporteurs);
    if (chemin !== null) out.push({ script, moduleFautif: chemin[chemin.length - 1], chemin });
  }
  return out;
}

/** (B) Importeurs d'un module « dé-gardé » qui ne sont PAS dans la liste blanche (les fichiers de test sont tolérés). PURE. */
export function importeursNonAutorises(importeursConstates: readonly string[], autorises: readonly string[]): string[] {
  const permis = new Set(autorises);
  return importeursConstates.filter((f) => !estFichierTest(f) && !permis.has(f)).sort();
}

/** Message d'échec (A) exploitable par un non-développeur : script, module fautif, CHEMIN COMPLET, et QUOI FAIRE. */
export function messageViolationsServerOnly(violations: readonly ViolationServerOnly[]): string {
  const details = violations.map((v) =>
    `  ✗ ${v.script}\n     atteint un module « server-only » : ${v.moduleFautif}\n     chemin : ${v.chemin.join(' → ')}`,
  );
  return [
    `${violations.length} script(s) CLI atteignent un module portant \`import 'server-only'\` :`,
    ...details,
    '',
    'POURQUOI C’EST BLOQUANT : `server-only` lève hors bundle react-server (tsx / node), donc `npm run <script>` mourrait',
    'au chargement — invisible aux tests unitaires (vitest aliase `server-only` vers empty.js). C’est le bug 0d57224.',
    'QUOI FAIRE : extraire du module fautif la partie utile au script dans un NOUVEAU module SANS `import \'server-only\'`',
    '(motif F1 : cf. app/lib/internaute/jetonCada.ts), puis faire pointer le script vers ce module.',
    'NE JAMAIS : retirer `import \'server-only\'` d’un fichier, ni changer les conditions de résolution (react-server / NODE_OPTIONS).',
  ].join('\n');
}

/** Message d'échec (B) : importeurs inattendus d'un module dé-gardé, avec la liste attendue et quoi faire. */
export function messageImporteursNonAutorises(moduleCible: string, intrus: readonly string[], autorises: readonly string[]): string {
  return [
    `${intrus.length} importeur(s) NON AUTORISÉ(S) de ${moduleCible} :`,
    ...intrus.map((f) => `  ✗ ${f}`),
    '',
    `${moduleCible} n’a volontairement PAS \`import 'server-only'\` (un script serveur doit pouvoir l’importer).`,
    'On perd donc l’échec au build si un COMPOSANT CLIENT l’importait : cette liste blanche remplace cette protection.',
    `Importeurs autorisés (hors tests) : ${autorises.join(', ')}.`,
    'QUOI FAIRE : si l’import est légitime et strictement SERVEUR, ajoute le fichier à la liste blanche de ce test.',
    'S’il vient d’un composant CLIENT, ne l’importe pas : passe par une route serveur (le secret ne doit jamais partir au client).',
  ].join('\n');
}
