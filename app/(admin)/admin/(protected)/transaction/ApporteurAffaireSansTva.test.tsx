// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApporteurAffaire } from './ApporteurAffaire';

/** 🔴 D29 (Arno, 03/11/2026) — l'apporteur d'une affaire (Informations communes, formulaire « Modifier ») : un externe, UN montant « sans TVA » ;
 *  un collaborateur (interne dans l'annuaire) : HT et TTC, comme avant. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const rendre = async (interne: boolean) => {
  await act(async () => {
    root.render(createElement(ApporteurAffaire, { affichage: true, modifiable: false, avecUnite: true, onValider: () => null, onRetirer: () => null,
      annuaire: [{ id: 16, nom: 'Gardien Dacquet', ...(interne ? { interne: true } : {}) }], actuel: { id: 16, nom: 'Gardien Dacquet', montant: { montant: 1000, unite: 'ttc' } } }));
  });
};

describe('🔴 D29 — l’apporteur de l’affaire', () => {
  it('externe : « 1 000 € sans TVA », aucun équivalent HT / TTC', async () => {
    await rendre(false);
    expect(container.querySelector('[data-apporteur-affiche]')?.textContent?.replace(/\s/g, ' ')).toBe('Gardien Dacquet1 000 € sans TVA');
  });
  it('collaborateur (interne) : HT et TTC, comme avant', async () => {
    await rendre(true);
    expect(container.querySelector('[data-apporteur-affiche]')?.textContent).toMatch(/TTC/);
  });
});
