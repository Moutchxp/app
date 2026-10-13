import 'server-only';

/**
 * ══ 🔴🔴 LOT TACHES-AGENDA — LA SYNCHRONISATION D'UNE TÂCHE VERS L'AGENDA : la porte côté serveur ═══════════════════
 * Le code vit dans `agendaSynchro.ts` (sans garde, pour la CLI de rattrapage — motif F1) ; les écrans, les routes et
 * les dépôts l'importent ICI, sous `server-only`.
 */
export * from './agendaSynchro';
