// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useZoneVisible } from './PrevisiteAccueil';

/**
 * 🔴 Arno (14/11/2026, iPhone) — la zone visible de l'écran (clavier) : la fenêtre suit `visualViewport`, mais une rafale d'évènements ne
 * provoque qu'UNE lecture par image et AUCUN rendu tant que la zone n'a pas bougé — jamais de boucle « la fenêtre bouge → l'écran défile ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FauxVv extends EventTarget { offsetTop = 0; height = 700; }
let racine: Root | null = null;
afterEach(() => { act(() => racine?.unmount()); racine = null; });

describe('useZoneVisible', () => {
  it('une rafale d’évènements sans changement : au plus un rendu (jamais un par évènement) ; un vrai changement : lu à l’image suivante, lu à l’image suivante', async () => {
    const vv = new FauxVv();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    let rendus = 0; let derniere: { top: number; height: number } | null = null;
    function Sonde() { const z = useZoneVisible(); rendus += 1; derniere = z; return null; }
    const hote = document.createElement('div'); document.body.appendChild(hote);
    racine = createRoot(hote);
    act(() => racine!.render(createElement(Sonde)));
    const apres = rendus;
    expect(derniere).toEqual({ top: 0, height: 700 });
    await act(async () => { for (let k = 0; k < 200; k++) vv.dispatchEvent(new Event('scroll')); await new Promise((r) => setTimeout(r, 40)); });
    // React peut rendre une fois avant de constater l'égalité ; jamais 200 fois
    expect(rendus - apres).toBeLessThanOrEqual(1);
    const avantChangement = rendus;
    vv.height = 400; vv.offsetTop = 120;
    await act(async () => { for (let k = 0; k < 200; k++) vv.dispatchEvent(new Event('resize')); await new Promise((r) => setTimeout(r, 40)); });
    expect(derniere).toEqual({ top: 120, height: 400 });
    expect(rendus - avantChangement).toBeLessThanOrEqual(2);
  });
});
