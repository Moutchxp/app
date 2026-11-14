import { defineConfig, devices } from '@playwright/test';

/**
 * 🔴 Arno (14/11/2026) — ÉPREUVES NAVIGATEUR (WebKit, profil iPhone 15), lancées À LA DEMANDE contre la RECETTE (jamais la production) :
 *   E2E_JETON_FICHIER=<jeton de session de recette> E2E_OCCUPATION=<occupation d'un préavis à pré-visite commencée> npx playwright test
 * Elles ne sont pas dans `npm test` (fichiers `*.webkit.ts`, hors du `include` de vitest). Rien n'est envoyé : la recette intercepte.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.webkit.ts',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE ?? 'http://localhost:3000' },
  projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 15'], browserName: 'webkit' } }],
});
