import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Collecte TOUT fichier ressemblant à un test sous app/ — toutes extensions TS/JS (.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs) et les
    //   deux conventions (.test. et .spec.). Historique : le pattern se limitait à `app/**/*.test.ts`, si bien qu'un test écrit en
    //   `.test.tsx` n'était JAMAIS collecté et passait pour vert sans tourner (incident du 2026-09-15, cf. docs/FLAKES_CONNUS.md). Le
    //   méta-test `app/lib/collecteTests.test.ts` verrouille désormais l'invariant : tout fichier de test SUIVI par git DOIT matcher ce include.
    //   Portée volontairement bornée à `app/**` : le bac à sable `sandbox/` (gitignoré, avec sa PROPRE vitest.config) ne doit pas être happé.
    include: ['app/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
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
