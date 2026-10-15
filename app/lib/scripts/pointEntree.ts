/**
 * pointEntree.ts — ce fichier est-il le script LANCÉ, ou seulement importé (par un test, par un autre module) ?
 *
 * La garde historique `import.meta.url === pathToFileURL(process.argv[1]).href` compare deux chemins qui ne sont pas
 * écrits pareil dès qu'un LIEN SYMBOLIQUE est sur le chemin : Node donne à `import.meta.url` le chemin RÉEL du module,
 * alors que `process.argv[1]` garde le chemin tel qu'il a été tapé. Lancé par `…/current/app/scripts/x.ts` (current →
 * app), le script se croyait importé et sortait aussitôt, en silence, avec le code 0 : la relève Gestion a ainsi fait
 * échouer l'adoption du lien `current` le 15/10/2026 (deux démarrages « réussis » sans rien relever, puis redémarrage).
 * Ici, les deux côtés sont ramenés à leur chemin réel avant comparaison.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function reel(chemin: string): string | null {
  try {
    return realpathSync(chemin);
  } catch {
    return null;
  }
}

export function estPointEntree(urlModule: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  const lance = reel(argv1);
  const module = reel(fileURLToPath(urlModule));
  return lance !== null && lance === module;
}
