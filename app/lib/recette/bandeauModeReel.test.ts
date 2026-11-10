import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandeauModeReel, TEXTE_MODE_REEL } from './mode';

/** 🔴🔴 Arno (11/11/2026) — le bandeau ROUGE « mode réel » : hors recette sur le Mac, toujours ; en production et en recette, jamais. */
describe('🔴 le bandeau rouge du mode réel', () => {
  it('le Mac en « npm run dev » (hors recette) : le bandeau', () => {
    expect(bandeauModeReel({ NODE_ENV: 'development' }, 'MacBook-Pro-M4', 'darwin')).toBe(true);
  });
  it('le Mac en « next start » (NODE_ENV=production) mais hors recette : le bandeau aussi', () => {
    expect(bandeauModeReel({ NODE_ENV: 'production' }, 'MacBook-Pro-M4', 'darwin')).toBe(true);
  });
  it('le Mac en « npm run recette » : pas de bandeau rouge (le bandeau de recette le remplace)', () => {
    expect(bandeauModeReel({ NODE_ENV: 'development', SVAV_RECETTE: '1' }, 'MacBook-Pro-M4', 'darwin')).toBe(false);
  });
  it('la production : jamais (machine svav-prod, adresse publique, ou Linux en production)', () => {
    expect(bandeauModeReel({ NODE_ENV: 'production' }, 'svav-prod', 'linux')).toBe(false);
    expect(bandeauModeReel({ NODE_ENV: 'production', SITE_URL: 'https://authentification.sansvisavis.com' }, 'autre', 'darwin')).toBe(false);
    expect(bandeauModeReel({ NODE_ENV: 'production' }, 'serveur', 'linux')).toBe(false);
  });
  it('le texte exact, et posé en tête de TOUTES les pages de l’admin (le layout du groupe)', () => {
    expect(TEXTE_MODE_REEL).toBe('ATTENTION : mode réel — les mails partent vraiment');
    const layout = readFileSync('app/(admin)/layout.tsx', 'utf8');
    expect(layout).toMatch(/\{modeReelLocal\(\) && \(/);
    expect(layout.indexOf('modeReelLocal() &&')).toBeLessThan(layout.indexOf('{children}'));
  });
});

describe('🔴 le layout de l’admin, rendu', () => {
  it('hors recette (ici) : le bandeau rouge, avant la page ; en recette : le bandeau de recette, pas le rouge', async () => {
    const { vi } = await import('vitest');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { default: Layout } = await import('../../(admin)/layout');
    vi.stubEnv('SVAV_RECETTE', '');
    const reel = renderToStaticMarkup(createElement(Layout, null, createElement('main', null, 'page')));
    expect(reel).toContain('data-bandeau-mode-reel');
    expect(reel).toContain('ATTENTION : mode réel — les mails partent vraiment');
    expect(reel.indexOf('data-bandeau-mode-reel')).toBeLessThan(reel.indexOf('<main>'));
    vi.stubEnv('SVAV_RECETTE', '1');
    const recette = renderToStaticMarkup(createElement(Layout, null, createElement('main', null, 'page')));
    expect(recette).not.toContain('data-bandeau-mode-reel');
    expect(recette).toContain('RECETTE — aucun envoi réel');
    vi.unstubAllEnvs();
  });
});
