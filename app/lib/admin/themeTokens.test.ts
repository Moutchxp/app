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

/**
 * 🔴 LOT COULEUR-ROUGE (28/09/2026) — LE BLEU DU NAVIGATEUR EST REPRIS PAR LA CHARTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Cases à cocher, boutons radio et curseurs ne sont peints par AUCUNE de nos règles : le navigateur les dessine avec
 * SA couleur. Ils ont donc traversé toute la charte sans jamais apparaître dans une relecture de nos fichiers — c'est
 * exactement ce que ce garde empêche de recommencer.
 *
 * Ce qui est tenu ici :
 *   ① `accent-color` suit le TOKEN, pas une teinte écrite à la main : les trois thèmes sont servis par la même ligne ;
 *   ② la règle est SCOPÉE à `.svv-adm-root` — le tunnel public et le PDF du certificat restent hors d'atteinte ;
 *   ③ `color-scheme` est posé sur les DEUX chemins sombres ('dark' ET 'system'), sinon le navigateur dessine des
 *      commandes claires sur notre fond sombre ;
 *   ④ 🔴 la surbrillance de sélection prend le texte de la SURFACE, jamais `#fff` : en sombre le rouge est clair, et
 *      du blanc dessus serait illisible.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT COULEUR-ROUGE — les commandes natives prennent le rouge de la charte', () => {
  it('① `accent-color` lit le TOKEN rouge, et n’écrit aucune teinte en dur', () => {
    expect(compact).toContain('.svv-adm-root { accent-color: var(--color-svv-red); }');
    // Une teinte écrite à la main ne suivrait pas le thème sombre, où le rouge vaut #ff6b6b.
    expect(compact).not.toMatch(/accent-color:\s*#/);
  });

  it('② la règle est SCOPÉE à l’admin — jamais `:root`, sinon le tunnel public la prendrait aussi', () => {
    expect(compact).not.toMatch(/:root\s*\{[^}]*accent-color/);
  });

  it('③ `color-scheme: dark` couvre les DEUX chemins sombres : le choix explicite ET le suivi du système', () => {
    const dark = compact.slice(compact.indexOf(".svv-adm-root[data-theme='dark'] {"));
    expect(dark.slice(0, dark.indexOf('}'))).toContain('color-scheme: dark;');
    const systeme = compact.slice(compact.indexOf(".svv-adm-root[data-theme='system'] {"));
    expect(systeme.slice(0, systeme.indexOf('}'))).toContain('color-scheme: dark;');
  });

  it('🔴 ④ la sélection de texte est lisible dans les DEUX thèmes : texte = surface, jamais #fff', () => {
    expect(compact).toContain(
      '.svv-adm-root ::selection { background: var(--color-svv-red); color: var(--color-svv-surface); }');
  });

  it('l’anneau de focus des commandes natives est au rouge de la charte', () => {
    expect(compact).toMatch(/input\[type='checkbox'\][^}]*:focus-visible \{ outline: 2px solid var\(--color-svv-red\)/);
  });

  it('🔴 les liens du CORPS D’UN MAIL REÇU ne sont PAS repeints — c’est le contenu de l’expéditeur', () => {
    // `accent-color` ne colore aucun texte : c'est ce qui rend la règle sûre ici. Le jour où l'on serait tenté
    // d'ajouter une règle `a { color: … }` à la racine de l'admin, elle atteindrait `.cnv-html a`. Ce garde le dit.
    expect(compact).not.toMatch(/\.svv-adm-root a\s*\{[^}]*color:/);
  });
});
