// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModaleIssue } from './ModaleIssue';

/**
 * 🔴🔴 Arno (23/11/2026) — « quand je la ferme ça me fait sortir du process de sortie locataire » : Échap fermait la modale générale ET la fenêtre de
 * travail en dessous (qui écoute aussi Échap). Désormais la modale garde Échap pour elle seule.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('🔴 Échap ne ferme que la modale du dessus', () => {
  it('la fenêtre de travail (qui écoute Échap) n’est PAS fermée par la modale « Modification enregistrée » ; la modale, si', () => {
    const fenetreDeTravail = vi.fn();
    const ecouteur = (e: KeyboardEvent): void => { if (e.key === 'Escape') fenetreDeTravail(); };
    window.addEventListener('keydown', ecouteur);
    const fermer = vi.fn();
    act(() => root.render(createElement(ModaleIssue, { sorte: 'succes', titre: 'Modification enregistrée', onFermer: fermer, actions: [{ libelle: 'Fermer', onClick: fermer }] })));
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(fermer).toHaveBeenCalledTimes(1);
    expect(fenetreDeTravail).not.toHaveBeenCalled();
    // la modale partie : Échap revient à la fenêtre de travail, comme avant
    act(() => root.render(createElement('div')));
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(fenetreDeTravail).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', ecouteur);
  });
});
