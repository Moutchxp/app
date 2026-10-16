/**
 * Démarrage du serveur Next (convention Next 16 : `register()` appelée UNE fois par instance de serveur).
 *
 * Contrôle des URL publiques (lot PORTABILITE-ENV) : en production, un avertissement par variable absente ou locale.
 * Jamais d'arrêt, jamais d'exception — un serveur qui démarre avec un avertissement vaut mieux qu'un serveur à terre.
 * Limité au runtime Node.js (le module est pur, mais le journal utile est celui du serveur Node).
 *
 * MODE RECETTE (lot RECETTE-MAC, 16/10/2026) : `SVAV_RECETTE=1` (posé par `npm run recette`) → contrôle au démarrage.
 * Permis (Mac, serveur de développement) → verrou réseau posé (aucune écriture Gmail / Agenda / Drive ne part) et le
 * journal le dit. Refusé (production, adresse de la production, machine de production) → AUCUN verrou, la production
 * fonctionne normalement, et le refus est écrit en rouge dans le journal.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { verifierUrlsPubliques } = await import('./app/lib/config/verifierUrlsPubliques');
    for (const message of verifierUrlsPubliques(process.env)) console.warn(message);
  } catch {
    // Un contrôle de configuration ne doit jamais empêcher le serveur de démarrer.
  }
  try {
    const { etatRecette } = await import('./app/lib/recette/mode');
    const { hostname } = await import('node:os');
    const etat = etatRecette(process.env, hostname());
    if (etat.actif) {
      const { installerVerrouRecette } = await import('./app/lib/recette/installer');
      installerVerrouRecette();
      console.warn('\x1b[43m\x1b[30m RECETTE — aucun envoi réel \x1b[0m mails, agenda et Drive interceptés ; boîte de test : /admin/recette');
    } else if (etat.demande) {
      console.error(`\x1b[41m\x1b[37m MODE RECETTE REFUSÉ \x1b[0m (${etat.refus}) — le serveur fonctionne en mode normal.`);
    }
  } catch (e) {
    // Recette DEMANDÉE mais verrou impossible à poser : on n'ouvre pas un site local qui écrirait pour de vrai.
    console.error('[RECETTE] contrôle de démarrage indisponible', (e as Error)?.message);
    if (process.env.SVAV_RECETTE === '1' && process.env.NODE_ENV !== 'production') process.exit(1);
  }
}
