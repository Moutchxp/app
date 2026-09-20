// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BandeauModificationValidation, PopUpConfirmerModification } from './ModifierValidation';

/**
 * RATT-EDIT (lot B2) — composants PURS du verrou d'édition (montés réellement en jsdom ; aucun réseau) :
 *   · le bouton « Modifier » n'existe QU'AVEC la capacité ; sinon la bannière DIT lecture seule sans jargon ;
 *   · déverrouillé, la bannière signale « modification en cours — non revalidée » + « Verrouiller » (B2 ne revalide pas) ;
 *   · pop-up 1 : « Modifier » → onConfirmer, « Annuler »/Échap → onAnnuler ; date/auteur affichés SI fournis, jamais « null/undefined ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hote: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; hote?.remove(); hote = null; });

function monter(node: React.ReactElement): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root!.render(node));
  return hote;
}
const boutons = (c: HTMLElement) => [...c.querySelectorAll('button')];
const boutonTexte = (c: HTMLElement, re: RegExp) => boutons(c).find((b) => re.test(b.textContent ?? '')) ?? null;
const cliquer = (b: HTMLButtonElement) => act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('BandeauModificationValidation — verrou par défaut, bouton gaté par la capacité', () => {
  it('SANS la capacité : aucun bouton « Modifier », message « lecture seule »', () => {
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: false, peutModifier: false, onDemander: () => {}, onVerrouiller: () => {} }));
    expect(boutonTexte(c, /Modifier/)).toBeNull();
    expect(c.textContent).toMatch(/lecture seule/i);
    expect(c.textContent).toMatch(/pas le droit/i);
  });

  it('AVEC la capacité : bouton « Modifier » présent → onDemander au clic (ouvre la pop-up 1)', () => {
    const onDemander = vi.fn();
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: false, peutModifier: true, onDemander, onVerrouiller: () => {} }));
    const b = boutonTexte(c, /^Modifier$/);
    expect(b).not.toBeNull();
    cliquer(b as HTMLButtonElement);
    expect(onDemander).toHaveBeenCalledTimes(1);
  });

  it('DÉVERROUILLÉ : bannière « modification en cours — non revalidée » + « Verrouiller » (onVerrouiller), aucun « Modifier »', () => {
    const onVerrouiller = vi.fn();
    const c = monter(createElement(BandeauModificationValidation, { modifOuverte: true, peutModifier: true, onDemander: () => {}, onVerrouiller }));
    expect(c.textContent).toMatch(/modification en cours/i);
    expect(c.textContent).toMatch(/non revalid/i);
    expect(boutonTexte(c, /^Modifier$/)).toBeNull();
    const v = boutonTexte(c, /Verrouiller/);
    expect(v).not.toBeNull();
    cliquer(v as HTMLButtonElement);
    expect(onVerrouiller).toHaveBeenCalledTimes(1);
  });
});

describe('PopUpConfirmerModification — pop-up 1', () => {
  it('confirmer → onConfirmer ; annuler → onAnnuler', () => {
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    const c = monter(createElement(PopUpConfirmerModification, { onConfirmer, onAnnuler }));
    expect(c.querySelector('[role="dialog"]')).not.toBeNull();
    cliquer(boutonTexte(c, /^Modifier$/) as HTMLButtonElement);
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    cliquer(boutonTexte(c, /^Annuler$/) as HTMLButtonElement);
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('Échap → onAnnuler (issue non destructive)', () => {
    const onAnnuler = vi.fn();
    monter(createElement(PopUpConfirmerModification, { onConfirmer: () => {}, onAnnuler }));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('date + auteur AFFICHÉS si fournis', () => {
    const c = monter(createElement(PopUpConfirmerModification, { validationDate: '2026-03-15T10:00:00Z', validationAuteur: 'A. Jorel', onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(c.textContent).toMatch(/mars 2026/);
    expect(c.textContent).toMatch(/A\. Jorel/);
  });

  it('date/auteur ABSENTS → message générique, jamais « null » ni « undefined »', () => {
    const c = monter(createElement(PopUpConfirmerModification, { onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(c.textContent).toMatch(/déjà été/i);
    expect(c.textContent).not.toMatch(/null|undefined|NaN|Invalid/);
  });
});
