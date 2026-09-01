import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOT 37 — GARDE sur globals.css : la palette sombre existe, est SCOPÉE à `.svv-adm-root` (jamais `:root` → public + PDF restent
 * clairs), les couleurs de SENS prennent bien leur valeur sombre sous `data-theme='dark'`, et les 7 classes de surface ne codent
 * plus `#fff` en dur (bascule d'un seul geste). Une régression de scope ou un `#fff` réintroduit casse ce test.
 */
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const compact = css.replace(/\s+/g, ' ');

describe('thème sombre — palette scopée à l’admin', () => {
  it('un bloc sombre existe, scopé à .svv-adm-root[data-theme=dark] (et non :root)', () => {
    expect(compact).toContain(".svv-adm-root[data-theme='dark'] {");
    // le mécanisme 'system' suit prefers-color-scheme, toujours scopé à la racine admin
    expect(compact).toContain('@media (prefers-color-scheme: dark)');
    expect(compact).toContain(".svv-adm-root[data-theme='system'] {");
  });

  it('les tokens d’ALERTE prennent leur valeur sombre sous data-theme=dark (rouge, ambre, vert, rouge-soft)', () => {
    const bloc = compact.slice(compact.indexOf(".svv-adm-root[data-theme='dark'] {"));
    expect(bloc).toContain('--color-svv-red: #ff6b6b;');       // rouge d'alerte lisible (≥4.5:1)
    expect(bloc).toContain('--color-svv-red-soft: #3a1e21;');  // fond de pastille « vis-à-vis »
    expect(bloc).toContain('--color-svv-amber: #f2b23c;');     // ambre (avertissement)
    expect(bloc).toContain('--color-svv-green: #4ade80;');     // vert (favorable)
    expect(bloc).toContain('--color-svv-green-ink: #7ee2a4;'); // texte sur vert-soft
    // surfaces + texte principal
    expect(bloc).toContain('--color-svv-surface: #1b232f;');
    expect(bloc).toContain('--color-svv-ink: #e8ebef;');
  });

  it('les valeurs sombres ne fuient PAS sur :root (le clair reste la valeur par défaut)', () => {
    const root = compact.slice(compact.indexOf('@theme {'), compact.indexOf('@layer components'));
    expect(root).toContain('--color-svv-red: #a30402;'); // :root garde le rouge CLAIR
    expect(root).not.toContain('#ff6b6b');               // aucun token sombre injecté au niveau racine
  });

  it('les 7 classes de surface sont tokenisées (plus aucun #fff en dur dans leur fond)', () => {
    expect(compact).toContain('.svv-card{background:var(--color-svv-surface)');
    expect(compact).toContain('.svv-btn-outline{background:var(--color-svv-surface)');
    expect(compact).toContain('.svv-doc{display:flex;flex-direction:column;gap:2px;min-height:44px;justify-content:center;background:var(--color-svv-surface)');
    expect(compact).toContain('background:var(--color-svv-surface)'); // .svv-menu-entree
    expect(compact).toContain('.svv-label{font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--color-svv-label)}');
    expect(compact).toContain('.svv-tip{'); // l'infobulle utilise un token dédié (ne suit plus --color-svv-ink qui s'inverse)
    expect(compact).toContain('background:var(--color-svv-tip-bg)');
    // le texte blanc sur bouton rouge est CONSERVÉ (blanc sur rouge, lisible dans les deux thèmes)
    expect(compact).toContain('.svv-btn-primary{background:var(--color-svv-red);color:#fff');
  });
});
