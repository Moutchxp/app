// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { ScriptInitTheme } from './ScriptInitTheme';
import { CLE_STOCKAGE_THEME, SCRIPT_INIT_THEME } from './lib/admin/theme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 🔴 21/10/2026 — le script anti-flash du thème admin, sorti du layout admin (« Encountered a script tag while rendering React
 * component ») vers le `<head>` du layout racine :
 *   · il pose le thème choisi sur toute racine admin, qu'elle soit là, analysée APRÈS lui, ou créée côté client plus tard ;
 *   · rendu serveur = script exécutable ; recréé côté client = bloc de données, sans aucun signalement de React.
 */
const executer = () => new Function(SCRIPT_INIT_THEME)();
const attendre = () => new Promise((r) => setTimeout(r, 0));
const racine = () => { const d = document.createElement('div'); d.className = 'svv-adm-root'; d.setAttribute('data-theme', 'system'); return d; };

afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.restoreAllMocks(); });

describe('🔴 le script anti-flash', () => {
  it('Clair / Sombre / Système : la racine reçoit la préférence ; inconnue ou absente → Système', async () => {
    for (const [stocke, attendu] of [['dark', 'dark'], ['light', 'light'], ['system', 'system'], ['n’importe quoi', 'system'], [null, 'system']] as const) {
      localStorage.clear();
      if (stocke !== null) localStorage.setItem(CLE_STOCKAGE_THEME, stocke);
      document.body.innerHTML = '';
      const r = racine(); r.setAttribute('data-theme', 'x');
      document.body.appendChild(r);
      executer();
      expect(r.getAttribute('data-theme')).toBe(attendu);
    }
  });

  it('une racine ajoutée APRÈS le script (analyse du HTML, navigation côté client) reçoit aussi le thème — même imbriquée', async () => {
    localStorage.setItem(CLE_STOCKAGE_THEME, 'dark');
    executer();
    const directe = racine(); document.body.appendChild(directe);
    const enveloppe = document.createElement('section'); const imbriquee = racine(); enveloppe.appendChild(imbriquee); document.body.appendChild(enveloppe);
    await attendre();
    expect(directe.getAttribute('data-theme')).toBe('dark');
    expect(imbriquee.getAttribute('data-theme')).toBe('dark');
    // le public n'est jamais touché
    const publique = document.createElement('div'); document.body.appendChild(publique); await attendre();
    expect(publique.hasAttribute('data-theme')).toBe(false);
  });

  it('stockage indisponible : aucune exception, Système', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    const r = racine(); r.setAttribute('data-theme', 'x'); document.body.appendChild(r);
    expect(() => executer()).not.toThrow();
    expect(r.getAttribute('data-theme')).toBe('system');
  });
});

describe('🔴 la balise : exécutable au serveur, jamais signalée côté client', () => {
  it('rendu serveur : un <script> sans type, qui porte le script', () => {
    vi.stubGlobal('window', undefined); // le serveur n'a pas de `window`
    const html = (() => { try { return renderToString(createElement(ScriptInitTheme)); } finally { vi.unstubAllGlobals(); } })();
    expect(html.startsWith('<script>')).toBe(true);
    expect(html).toContain(CLE_STOCKAGE_THEME);
  });

  it('recréée côté client : bloc de données, et React ne signale rien', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hote = document.createElement('div'); document.body.appendChild(hote);
    const root = createRoot(hote);
    await act(async () => { root.render(createElement(ScriptInitTheme)); });
    expect(hote.querySelector('script')?.getAttribute('type')).toBe('text/plain');
    expect(erreurs.mock.calls.flat().join(' ')).not.toMatch(/script tag/);
    await act(async () => { root.unmount(); });
  });

  it('le layout racine la porte dans le <head> ; le layout admin n’a plus de <script>', () => {
    const racineLayout = readFileSync('app/layout.tsx', 'utf8');
    expect(racineLayout).toMatch(/<head>[\s\S]*<ScriptInitTheme \/>[\s\S]*<\/head>/);
    const admin = readFileSync('app/(admin)/layout.tsx', 'utf8');
    expect(admin).not.toMatch(/<script/);
    expect(admin).toContain('suppressHydrationWarning');
  });
});
