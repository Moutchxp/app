// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocRepliable } from './BlocRepliable';

/**
 * BAT — OUVERTURE COMMANDÉE de BlocRepliable (prop `ouvrirSignal`, un nonce). Trois garanties de COMPORTEMENT :
 *  1) absente → comportement non contrôlé STRICTEMENT inchangé (replié par défaut, enfant non monté) ;
 *  2) une NOUVELLE valeur (changement de nonce) ouvre le bloc et MONTE son enfant ;
 *  3) un re-rendu à valeur INCHANGÉE NE réouvre PAS un bloc que l'internaute vient de replier (pas de boucle d'ouverture).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

const enfant = () => createElement('p', null, 'CONTENU-BLOC');
// `children` de BlocRepliable est un RENDER-PROP (fonction appelée à l'ouverture) : createElement positionnel ne type pas cette forme →
//   on le passe en prop. Un seul point de disable pour toute la suite (la règle vise le pattern JSX, faux positif pour un render-prop typé).
// eslint-disable-next-line react/no-children-prop
const elt = (ouvrirSignal?: number) => createElement(BlocRepliable, { titre: 'X', ouvrirSignal, children: enfant });
const ariaExpanded = (c: HTMLElement) => c.querySelector('button')?.getAttribute('aria-expanded');

describe('BlocRepliable — ouverture commandée (ouvrirSignal), rétro-compatible', () => {
  it('sans ouvrirSignal : replié par défaut, enfant NON monté (comportement inchangé)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(elt()); });
    expect(container.textContent).not.toContain('CONTENU-BLOC');
    expect(ariaExpanded(container)).toBe('false');
  });

  it('la valeur au montage n’ouvre pas ; un NOUVEAU nonce ouvre le bloc et monte l’enfant', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(elt(0)); });
    expect(container.textContent).not.toContain('CONTENU-BLOC'); // 0 = valeur au montage → n'ouvre pas
    act(() => { root!.render(elt(1)); });
    expect(container.textContent).toContain('CONTENU-BLOC'); // le nonce a changé → ouvert + enfant monté
    expect(ariaExpanded(container)).toBe('true');
  });

  it('un re-rendu à nonce INCHANGÉ ne réouvre pas un bloc replié à la main', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    // Montage à 0 (n'ouvre pas), PUIS passage à 1 (changement de nonce → ouvre) : seul chemin d'ouverture commandée.
    act(() => { root!.render(elt(0)); });
    act(() => { root!.render(elt(1)); });
    expect(ariaExpanded(container)).toBe('true');
    // l'internaute replie (clic sur le bouton de titre)
    act(() => { (container.querySelector('button') as HTMLButtonElement).click(); });
    expect(ariaExpanded(container)).toBe('false');
    // re-rendu du parent à MÊME nonce → NE réouvre PAS (sinon l'XL rouvrirait en boucle)
    act(() => { root!.render(elt(1)); });
    expect(ariaExpanded(container)).toBe('false');
  });
});
