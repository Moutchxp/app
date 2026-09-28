import 'server-only';

/**
 * ⚠️ LE CODE VIT DANS `piecesEnvoiCablage.ts`, SANS `import 'server-only'`.
 *
 * Le travailleur de fond de la file d’envoi assemble les pièces d’un message, et il tourne aussi sous `tsx`.
 *
 * Ce fichier-ci garde la garde `server-only` pour tous ses appelants d'origine (routes, composants serveur) : elle
 * protège là où elle doit protéger. La CLI, elle, importe l'autre — c'est le motif F1 du dépôt.
 */
export * from './piecesEnvoiCablage';
