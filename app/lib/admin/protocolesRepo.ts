import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * FRAÎCHEUR / F5 — lecture du fichier `docs/PROTOCOLES_REINGESTION.md` (LECTURE SEULE d'un fichier versionné, aucune base,
 * aucune exécution). Le chemin est résolu depuis le répertoire de lancement de Next (racine du projet). Fichier absent /
 * illisible → null (erreur journalisée, PAS de catch muet) → l'écran affiche la sentinelle « protocole non documenté ».
 */

/** Lecteur injectable (défaut = fs) — permet de tester la sentinelle d'échec sans toucher au disque. */
export type LecteurFichier = (chemin: string) => Promise<string>;
const lecteurDefaut: LecteurFichier = (chemin) => readFile(chemin, 'utf8');

/** Chemin du fichier de protocoles, relatif à la racine du projet (répertoire de lancement de Next). */
export const CHEMIN_PROTOCOLES = 'docs/PROTOCOLES_REINGESTION.md';

/** Lit le fichier de protocoles, ou null s'il est absent / illisible (erreur complète journalisée). */
export async function lireFichierProtocoles(lire: LecteurFichier = lecteurDefaut): Promise<string | null> {
  try {
    return await lire(join(process.cwd(), CHEMIN_PROTOCOLES));
  } catch (e) {
    console.error('[protocoles] lecture de docs/PROTOCOLES_REINGESTION.md impossible', e);
    return null;
  }
}
