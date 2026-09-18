// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModeDemandeTeleservice, type ModePreparation } from './ModeDemandeTeleservice';

/**
 * MODE (téléservice) — COMPORTEMENT de la bascule (jsdom + act, sans testing-library). Le `mode` est CONTRÔLÉ par le parent ; on
 * l'éprouve via un petit wrapper à état (comme ADemanderVue). On vérifie l'ÉTAT (aria-pressed) et la PRÉSENCE du panneau manuel,
 * jamais l'apparence. Le mode automatique n'a plus de bloc « Communes libres » : les cartes vivent dans le carrousel (BlocDepot).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch; // aucun fetch au montage
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const champManuel = (): HTMLInputElement | null => container.querySelector('input[aria-label*="vivier téléservice"]');

// Wrapper à état : reproduit le parent (ADemanderVue possède `mode`, ModeDemandeTeleservice le reçoit + remonte via onMode).
function Wrapper({ initial = 'auto' as ModePreparation, process = 'formulaire' as 'formulaire' | 'email' }): React.ReactElement {
  const [mode, setMode] = useState<ModePreparation>(initial);
  return createElement(ModeDemandeTeleservice, { categories: [], mode, onMode: setMode, onChangement: vi.fn(), process });
}
const monter = async (proc: 'formulaire' | 'email' = 'formulaire'): Promise<void> => {
  await act(async () => { root.render(createElement(Wrapper, { process: proc })); });
  await act(async () => { await Promise.resolve(); });
};

describe('MODE téléservice — bascule auto / manuel (mode contrôlé)', () => {
  it('mode automatique ACTIF par défaut (aucun panneau manuel monté)', async () => {
    await monter();
    expect(boutonPar(/Sélection automatique/)?.getAttribute('aria-pressed')).toBe('true');
    expect(boutonPar(/Sélection manuelle/)?.getAttribute('aria-pressed')).toBe('false');
    expect(champManuel()).toBeNull(); // le panneau manuel n'apparaît qu'en mode manuel
  });

  it('la bascule dit en toutes lettres ce que fait chaque mode (auto = carrousel ; manuel = vivier)', async () => {
    await monter();
    expect(container.textContent).toMatch(/carrousel/i); // description du mode automatique (cartes dans le carrousel)
    expect(container.textContent).toMatch(/vivier/i);    // description du mode manuel
    expect(boutons().some((b) => /Préparer/i.test(b.textContent ?? ''))).toBe(false); // aucun bouton « Préparer … » (bloc intermédiaire retiré)
  });

  it('bascule en mode manuel → le panneau de recherche du vivier apparaît, mode manuel actif', async () => {
    await monter();
    await act(async () => { boutonPar(/Sélection manuelle/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(boutonPar(/Sélection manuelle/)?.getAttribute('aria-pressed')).toBe('true');
    expect(champManuel()).not.toBeNull();
  });

  it('retour en mode automatique → le panneau manuel disparaît (bascule réversible)', async () => {
    await monter();
    await act(async () => { boutonPar(/Sélection manuelle/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(champManuel()).not.toBeNull();
    await act(async () => { boutonPar(/Sélection automatique/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(champManuel()).toBeNull();
  });
});

describe('MODE e-mail — MÊME bloc, vocabulaire « envoi », vivier e-mail (commun aux deux rails)', () => {
  it('libellés « Envoi automatique / manuel » (jamais « Sélection ») ; auto actif par défaut', async () => {
    await monter('email');
    expect(boutonPar(/Envoi automatique/)?.getAttribute('aria-pressed')).toBe('true');
    expect(boutonPar(/Envoi manuel/)?.getAttribute('aria-pressed')).toBe('false');
    expect(boutonPar(/Sélection/)).toBeUndefined();                                       // vocabulaire téléservice absent en e-mail
    expect(container.querySelector('input[aria-label*="vivier téléservice"]')).toBeNull();
  });

  it('bascule en manuel → recherche du vivier E-MAIL (et pas téléservice)', async () => {
    await monter('email');
    await act(async () => { boutonPar(/Envoi manuel/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('input[aria-label*="vivier e-mail"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label*="vivier téléservice"]')).toBeNull();
  });
});

describe('224 — slot BADGE d’état (rendu dans l’en-tête, absent par défaut)', () => {
  it('sans prop badge → aucune pastille ; avec badge → il est rendu (état visible en permanence)', async () => {
    await monter('email'); // Wrapper sans badge
    expect(container.textContent).not.toMatch(/Envoi auto désactivé/);
    await act(async () => {
      root.render(createElement(ModeDemandeTeleservice, {
        categories: [], mode: 'manuel' as ModePreparation, onMode: vi.fn(), onChangement: vi.fn(), process: 'email',
        badge: createElement('span', null, 'Envoi auto désactivé'),
      }));
    });
    expect(container.textContent).toMatch(/Envoi auto désactivé/);
  });
});

describe('TRAME ROUGE de l’option active (mêmes tokens que le rail actif du sélecteur)', () => {
  it('l’option sélectionnée porte la bordure + le fond ROUGE (var(--color-svv-red) / red-soft), l’autre non', async () => {
    await monter('formulaire');
    const actif = boutonPar(/Sélection automatique/)!;
    const styleActif = actif.getAttribute('style') ?? '';
    expect(styleActif).toContain('var(--color-svv-red)');        // bordure rouge (token existant)
    expect(styleActif).toContain('var(--color-svv-red-soft');    // fond rouge pâle (token existant)
    expect(actif.getAttribute('style')).not.toContain('var(--color-svv-ink)'); // plus le bleu/ink d'avant
    expect(boutonPar(/Sélection manuelle/)!.getAttribute('style') ?? '').not.toContain('var(--color-svv-red)'); // l'option NON active reste neutre
  });
});
