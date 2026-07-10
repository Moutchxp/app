/**
 * M2 — LOT 3. Entrée CLI du job de maintenance analytique (compaction + partitions + purge).
 * Exécuté par `tsx`, comme les autres scripts du projet :
 *
 *   npm run analytics:maintenance
 *
 * DÉCLENCHEMENT recommandé : un CRON SYSTÈME appelle cette commande une fois par jour (après minuit
 * Europe/Paris, pour compacter le jour qui vient d'être scellé). AUCUN ordonnanceur n'est fourni ici
 * (aucun n'existe dans le projet, pg_cron indisponible) — c'est une DÉCISION d'exploitation d'Arno
 * (cron système, ou une future route protégée par `perm_statistiques`). Le job N'EST PAS appelé depuis
 * le writer (recouplage interdit — cf. LOT 1).
 *
 * OBSERVABLE : imprime en JSON ce qui s'est passé (sessions compactées, partitions créées/supprimées,
 * compteurs purgés, erreurs). CODES DE SORTIE (pour qu'un cron alerte) : 0 = run propre (ou no-op verrou) ;
 * 2 = run terminé mais AVEC des erreurs de sous-étape (ex. purge en échec — enjeu rétention/RGPD) ;
 * 1 = échec inattendu (base injoignable). Le job ne « casse » jamais le tunnel ; le code ≠ 0 sert au
 * monitoring, pas à interrompre quoi que ce soit.
 *
 * DATABASE_URL est chargé depuis .env par `import 'dotenv/config'` ci-dessous — le CLI de maintenance
 * n'importe PAS `db/client` (isolation voulue), donc, contrairement aux autres scripts tsx, il ne récupère
 * pas .env transitivement : il doit le charger lui-même. Ne touche NI le moteur, NI le pool applicatif,
 * NI le pool d'émission.
 */
import 'dotenv/config';
import { executerMaintenance, fermerPoolMaintenance } from '../lib/analytics/maintenance';

async function main(): Promise<void> {
  const debut = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());
  try {
    const res = await executerMaintenance();
    // Résultat lisible (JSON) — pour un log de cron ou une inspection manuelle.
    console.log(JSON.stringify({ horodatage_paris: debut, ...res }, null, 2));
    if (!res.demarre) {
      console.log('→ un autre run détenait le verrou ; aucune action (no-op).');
    } else if (res.erreurs.length > 0) {
      // Code 2 : échec partiel visible pour un cron qui surveille le code de sortie (une purge qui
      // échoue en silence laisserait des agrégats hors rétention — enjeu RGPD). Le run a bien eu lieu.
      process.exitCode = 2;
      console.warn(`→ run terminé AVEC ${res.erreurs.length} erreur(s) de sous-étape (voir ci-dessus). exit=2`);
    } else {
      console.log('→ run terminé sans erreur.');
    }
  } finally {
    await fermerPoolMaintenance();
  }
}

void main().catch((e) => {
  // Erreur inattendue (ex. base injoignable) : logguée, code de sortie non nul pour alerter le cron.
  console.error('[analytics:maintenance] échec inattendu', e);
  process.exitCode = 1;
});
