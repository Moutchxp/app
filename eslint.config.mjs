import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // ── GARDE ANTI-COUPLAGE M2 (LOT 1) ──────────────────────────────────────────────
  // Le moteur de calcul (verdict/score) NE DOIT JAMAIS importer le canal d'écriture analytique :
  // une écriture analytique dans le chemin de calcul pourrait bloquer/ralentir une certification.
  // La garde cible LE WRITER (`app/lib/analytics/**`), PAS `db/client` — car `app/lib/svv/**` utilise
  // légitimement `db/client` (ex. preparateurPaysage.ts). Le golden ne prouve rien sur ce couplage ;
  // cette règle (statique) + le test de graphe transitif (`gardeImports.test.ts`) le prouvent.
  {
    // Liste ALIGNÉE sur CLAUDE.md §14 (moteur pur + accès données). Toute divergence est verrouillée par
    // un test de complétude (gardeImports.test.ts) : ajouter un fichier moteur ici ET dans `MOTEUR`.
    files: [
      "app/lib/svv/**/*.ts",
      "app/lib/db/pipeline.ts",
      "app/lib/db/obstacles.ts",
      "app/lib/db/faisceaux.ts",
      "app/lib/db/profilConfig.ts",
      "app/lib/db/origine.ts",
      "app/lib/db/hauteurLidar.ts",
    ],
    rules: {
      // Import STATIQUE (y compris via alias `@/…analytics/…`, capté par les patterns).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/analytics",
                "**/analytics/**",
                "**/lib/analytics",
                "**/lib/analytics/**",
              ],
              message:
                "COUPLAGE INTERDIT : le moteur de calcul ne doit jamais importer app/lib/analytics/** (le canal d'écriture analytique ne doit jamais entrer dans le chemin du verdict/score). Émettre les événements depuis la couche route, via after().",
            },
          ],
        },
      ],
      // Import DYNAMIQUE `import('…analytics…')` — non couvert par no-restricted-imports.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/analytics/]",
          message:
            "COUPLAGE INTERDIT (import dynamique) : le moteur ne doit jamais charger app/lib/analytics/** même via import().",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
