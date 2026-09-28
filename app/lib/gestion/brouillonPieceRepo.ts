import 'server-only';

/**
 * ⚠️ LE CODE VIT DANS `brouillonPieceRepoBase.ts`, SANS `import 'server-only'`.
 *
 * Le travailleur de fond de la file d’envoi lit les pièces d’un brouillon, et il tourne aussi sous `tsx`.
 *
 * Ce fichier-ci garde la garde `server-only` pour tous ses appelants d'origine (routes, composants serveur) : elle
 * protège là où elle doit protéger. La CLI, elle, importe l'autre — c'est le motif F1 du dépôt.
 */
export * from './brouillonPieceRepoBase';
