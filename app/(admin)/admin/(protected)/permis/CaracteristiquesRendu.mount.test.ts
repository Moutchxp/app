// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampMesureEditeur } from './CaracteristiquesRendu';
import { MESURES } from './caracteristiquesForm';

/**
 * DEMANDE 1 — le bouton « utiliser la valeur IA » ADOPTE la valeur en UN CLIC (appelle onValeur avec la valeur lue), sans saisie.
 * On MONTE le composant (jsdom) et on clique — aucune écriture réseau, aucun service payant : pur composant présentationnel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sommet = MESURES.find((m) => m.estSommet)!;

let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

function boutonTexte(container: HTMLElement, inclut: string): HTMLButtonElement | null {
  return (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(inclut)) as HTMLButtonElement | undefined) ?? null;
}

describe('DEMANDE 1 — adoption de la valeur IA en un clic (montage jsdom)', () => {
  it('un clic sur « utiliser la valeur IA (122.65) » appelle onValeur("122.65") — aucune saisie manuelle', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onValeur = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(ChampMesureEditeur, { mesure: sommet, bornes: { min: -50, max: 500 }, valeur: '107.04', origine: 'extraite', valeurBase: 107.04, valeurIA: 122.65, onValeur, onValider: () => {} })); });
    const btn = boutonTexte(container, 'utiliser la valeur IA');
    expect(btn).not.toBeNull();
    act(() => { btn!.click(); });
    expect(onValeur).toHaveBeenCalledWith('122.65');
    container.remove();
  });
});
