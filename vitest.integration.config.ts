import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Config dédiée aux tests d'intégration (vraie connexion PostGIS) : motif *.itest.ts.
// Séparée de vitest.config.ts (include *.test.ts) pour que `npm test` ne les ramasse pas.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.itest.ts'],
    // L'analyse complète (61 faisceaux + LiDAR du couloir principal) lit beaucoup
    // de raster ; ~5-6 s par test. Au-delà du défaut vitest (5 s).
    testTimeout: 60000,
    // Les itests frappent TOUS la MÊME base PostgreSQL de dev. En parallèle, plusieurs fichiers se
    // disputent le pool `db/client` partagé et peuvent interférer (contention, fixtures concurrentes) →
    // flakiness. On exécute donc les FICHIERS d'intégration SÉQUENTIELLEMENT (le golden domine de toute
    // façon le temps mural ; coût négligeable) pour une base isolée par fichier et des résultats stables.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Neutralise `server-only` en test node (idem vitest.config.ts) : sans effet à l'exécution, le
      // marqueur reste effectif en build Next. Requis par les itests qui importent des modules marqués
      // server-only (ex. app/lib/analytics/{writer,session,pool,commune}.ts).
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
});
