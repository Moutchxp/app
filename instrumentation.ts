/**
 * Démarrage du serveur Next (convention Next 16 : `register()` appelée UNE fois par instance de serveur).
 *
 * Contrôle des URL publiques (lot PORTABILITE-ENV) : en production, un avertissement par variable absente ou locale.
 * Jamais d'arrêt, jamais d'exception — un serveur qui démarre avec un avertissement vaut mieux qu'un serveur à terre.
 *
 * MODE RECETTE (lot RECETTE-MAC, 16/10/2026) : `SVAV_RECETTE=1` (posé par `npm run recette`) → contrôle au démarrage.
 * Permis (Mac, serveur de développement) → verrou réseau posé (aucune écriture Gmail / Agenda / Drive ne part) et le
 * journal le dit. Refusé (production, adresse de la production, machine de production) → AUCUN verrou, la production
 * fonctionne normalement, et le refus est écrit en rouge dans le journal.
 *
 * RUNTIME NODE SEULEMENT (lot INSTRUMENTATION-RUNTIME-NODE, 18/10/2026) : tout le code Node (process.exit, node:os,
 * verrou) est dans `app/lib/recette/demarrageNode.ts`, importé DANS la branche `NEXT_RUNTIME === 'nodejs'`. Le
 * compilateur Edge élimine cette branche et ne suit pas l'import. Ne rien importer ni appeler de Node ici en dehors de
 * cette branche (verrouillé par `app/lib/recette/instrumentation.test.ts`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { demarrerServeurNode } = await import('./app/lib/recette/demarrageNode');
      await demarrerServeurNode();
    } catch (e) {
      // Module de démarrage introuvable : recette demandée → on n'ouvre pas un site local qui écrirait pour de vrai.
      console.error('[RECETTE] contrôle de démarrage indisponible', (e as Error)?.message);
      if (process.env.SVAV_RECETTE === '1' && process.env.NODE_ENV !== 'production') process.exit(1);
    }
  }
}
