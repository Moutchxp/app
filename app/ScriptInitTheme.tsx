'use client';

import { SCRIPT_INIT_THEME } from './lib/admin/theme';

/**
 * Le script anti-flash du thème admin, rendu dans le `<head>` du layout racine (cf. `SCRIPT_INIT_THEME`).
 *
 * Au rendu SERVEUR, c'est un script ordinaire : le navigateur l'exécute pendant l'analyse du HTML, avant le premier paint.
 * Côté NAVIGATEUR, React n'exécute jamais un script inline ; s'il recrée l'arbre (reprise après une erreur, p. ex. un morceau
 * de code qui n'a pas pu être chargé), il signalait « Encountered a script tag while rendering React component ». La balise y
 * est donc marquée bloc de données (`text/plain`) : rien ne change à l'exécution, et React ne la signale plus. À l'hydratation,
 * React garde l'attribut du serveur (`suppressHydrationWarning`) : le script déjà exécuté n'est pas touché.
 */
export function ScriptInitTheme() {
  const navigateur = typeof window !== 'undefined';
  return <script suppressHydrationWarning type={navigateur ? 'text/plain' : undefined} dangerouslySetInnerHTML={{ __html: SCRIPT_INIT_THEME }} />;
}
