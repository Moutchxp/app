// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { CartouchesAjustables } from './TraceEmpriseRendu';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';

/** Fixture minimale : seul `id` est lu par le composant (le nom vient du `nomEmprise` fourni). */
const emp = (id: number): EmpriseReconstruite => ({ id }) as unknown as EmpriseReconstruite;
const nom = (e: EmpriseReconstruite) => `bâtiment en projet ${e.id}`;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

describe('CartouchesAjustables (BAT défaut 3) — un cartouche par emprise, sélection lisible et accessible', () => {
  it('un cartouche par emprise, nommé via nomEmprise (source unique, même nom que la barre)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).toContain('bâtiment en projet 1');
    expect(html).toContain('bâtiment en projet 2');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it('le SÉLECTIONNÉ : rouge + marque ÉCRITE « sélectionné » + aria-current (jamais la couleur seule)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 2, onSelectionner: () => {} }));
    // marque écrite + drapeau lecteur d'écran
    expect(html).toContain('sélectionné');
    expect(html).toContain('aria-current="true"');
    // exactement UN cartouche sélectionné + un liseré rouge présent
    expect((html.match(/data-selectionne="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('var(--color-svv-red)');
  });

  it('aucune sélection → aucun aria-current, aucune marque « sélectionné »', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1)], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).not.toContain('aria-current');
    expect(html).not.toContain('sélectionné');
  });

  it('une SEULE emprise → la rangée reste affichée (dit sur quoi on travaille)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(9)], nomEmprise: nom, selectionId: 9, onSelectionner: () => {} }));
    expect(html).toContain('bâtiment en projet 9');
    expect((html.match(/<button/g) ?? []).length).toBe(1);
  });

  it('aucune emprise → aucune rangée (rien à ajuster)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).toBe('');
  });

  it('cliquer un cartouche SÉLECTIONNE ce polygone (onSelectionner reçoit son id)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onSelectionner = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 1, onSelectionner })); });
    const btn2 = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('bâtiment en projet 2'))!;
    act(() => { btn2.click(); });
    expect(onSelectionner).toHaveBeenCalledWith(2);
  });

  it('occupe → cartouches désactivés (pas de sélection pendant une requête)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1)], nomEmprise: nom, selectionId: null, onSelectionner: () => {}, occupe: true }));
    expect(html).toContain('disabled');
  });
});

/**
 * Garde de source (BlocTraceEmprise non montable) — le CÂBLAGE de la sélection : la rangée est branchée dans le plein écran, la sélection
 * passe par un handler qui PROTÈGE un ajustement non enregistré (confirmation), et le sélectionné suit l'emprise en cours (single).
 */
// Chemin RELATIF AU CWD (racine du projet) — robuste en environnement jsdom, où `import.meta.url` n'est pas de schéma file:// (pattern déjà en place ailleurs).
const SRC = readFileSync('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx', 'utf8').replace(/\s+/g, ' ');
describe('BlocTraceEmprise — câblage de la rangée de sélection (garde source)', () => {
  it('la rangée CartouchesAjustables est rendue, sélection = emprise single en cours', () => {
    expect(SRC).toContain('<CartouchesAjustables');
    expect(SRC).toContain('selectionId={ajustement && !ajustement.bloc ? ajustement.id : null}');
    expect(SRC).toContain('onSelectionner={selectionnerAjustable}');
  });
  it('selectionnerAjustable protège un ajustement modifié (confirmation, jamais d’abandon silencieux)', () => {
    const bloc = SRC.match(new RegExp('const selectionnerAjustable = useCallback\\(\\(id: number\\) => \\{.*?\\}, \\['))?.[0] ?? '';
    expect(bloc).toContain('estAjustementModifie');       // détecte le travail non enregistré
    expect(bloc).toContain('setConfirmChangeAjust(id)');  // → confirmation au lieu de perdre
    expect(bloc).toContain('demarrerAjustement(id)');     // sans travail en cours → bascule directe
  });
});
