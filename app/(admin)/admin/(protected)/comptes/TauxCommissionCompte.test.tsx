// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocTauxCommissionCompte, lireTauxSaisi } from './TauxCommissionCompte';

/** 🔴 Mon espace (Arno, 07/11/2026, 462) — le taux de commission dans « Détails du compte » : 0 à 100 %, vide = 50 % par défaut ; route simulée. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let corps: unknown[];
beforeEach(() => {
  corps = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (_u: string, init?: RequestInit) => { corps.push(JSON.parse(String(init?.body))); return { ok: true, json: async () => ({ ok: true, change: true }) }; }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const saisir = async (valeur: string) => {
  const el = container.querySelector('[data-champ-taux-commission]') as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('« Taux de commission » du profil', () => {
  it('120 : message et bouton désactivé ; 62,5 : enregistré (taux 62,5) ; non commissionné : la mention', async () => {
    await act(async () => { root.render(createElement(BlocTauxCommissionCompte, { compteId: 5, etat: { valeur: null, disponible: true, historique: [] }, nonCommissionne: true, onFait: () => {} })); });
    expect(container.querySelector('[data-taux-non-commissionne]')).not.toBeNull();
    await saisir('120');
    expect(container.querySelector('[data-taux-commission-bornes]')!.textContent).toBe('Le taux de commission doit être compris entre 0 et 100 %.');
    expect((container.querySelector('[data-enregistrer-taux-commission]') as HTMLButtonElement).disabled).toBe(true);
    await saisir('62,5');
    await act(async () => { (container.querySelector('[data-enregistrer-taux-commission]') as HTMLButtonElement).click(); });
    expect(corps).toEqual([{ taux: 62.5 }]);
  });
  it('sans la 462 : grisé, la phrase le dit ; lecture de la saisie', async () => {
    await act(async () => { root.render(createElement(BlocTauxCommissionCompte, { compteId: 5, etat: { valeur: null, disponible: false, historique: [] }, onFait: () => {} })); });
    expect((container.querySelector('[data-champ-taux-commission]') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('[data-taux-commission-indisponible]')).not.toBeNull();
    expect([lireTauxSaisi(''), lireTauxSaisi('0'), lireTauxSaisi('100 %'), lireTauxSaisi('-3'), lireTauxSaisi('x')]).toEqual([null, 0, 100, undefined, undefined]);
  });
});
