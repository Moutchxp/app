/**
 * Démarrage du serveur Next (convention Next 16 : `register()` appelée UNE fois par instance de serveur).
 *
 * Contrôle des URL publiques (lot PORTABILITE-ENV) : en production, un avertissement par variable absente ou locale.
 * Jamais d'arrêt, jamais d'exception — un serveur qui démarre avec un avertissement vaut mieux qu'un serveur à terre.
 * Limité au runtime Node.js (le module est pur, mais le journal utile est celui du serveur Node).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { verifierUrlsPubliques } = await import('./app/lib/config/verifierUrlsPubliques');
    for (const message of verifierUrlsPubliques(process.env)) console.warn(message);
  } catch {
    // Un contrôle de configuration ne doit jamais empêcher le serveur de démarrer.
  }
}
