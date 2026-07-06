import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // `server-only` lève une erreur hors bundle react-server (cas des tests node) :
      // on le neutralise en test (fichier vide fourni par le paquet). Chemin absolu pour
      // contourner le champ `exports`. Le marqueur reste effectif en build Next.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
});
