// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { blocagesOuverts, libererDefilement, useVerrouDefilement, verifierApresChangementDePage, verrouillerDefilement } from './verrouDefilement';

/**
 * 🔴🔴 Arno (11/11/2026) — LE BLOCAGE DU DÉFILEMENT COMPTÉ : +1 à l'ouverture, −1 à la fermeture (une seule fois), le défilement toujours rendu
 * quand la DERNIÈRE fenêtre se ferme — quel que soit l'ordre ; aucun blocage ne survit à un changement de page.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bloque = (): boolean => document.body.style.overflow === 'hidden';
let container: HTMLDivElement; let root: Root;
beforeEach(() => { libererDefilement(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); libererDefilement(); });

describe('le compteur', () => {
  it('+1 / −1 ; la libération ne compte qu’une fois ; la dernière fenêtre fermée rend le défilement', () => {
    const a = verrouillerDefilement();
    const b = verrouillerDefilement();
    expect([blocagesOuverts(), bloque()]).toEqual([2, true]);
    a(); a(); // fermée deux fois (Échap puis clic) : un seul −1
    expect([blocagesOuverts(), bloque()]).toEqual([1, true]);
    b();
    expect([blocagesOuverts(), bloque()]).toEqual([0, false]);
  });
  it('🔴 le cas qui figeait la page : deux fenêtres fermées dans un autre ordre que l’inverse de leur ouverture', async () => {
    function Fenetre() { useVerrouDefilement(); return createElement('div', { role: 'dialog', 'aria-modal': 'true' }); }
    let ouvrir: (x: { a: boolean; b: boolean }) => void = () => {};
    function Page() { const [o, setO] = useState({ a: false, b: false }); ouvrir = setO; return createElement('div', null, o.a && createElement(Fenetre, { key: 'a' }), o.b && createElement(Fenetre, { key: 'b' })); }
    await act(async () => { root.render(createElement(Page)); });
    await act(async () => { ouvrir({ a: true, b: false }); });
    await act(async () => { ouvrir({ a: true, b: true }); });
    expect(bloque()).toBe(true);
    await act(async () => { ouvrir({ a: false, b: true }); }); // la PREMIÈRE ouverte se ferme d'abord
    expect(bloque()).toBe(true);
    await act(async () => { ouvrir({ a: false, b: false }); });
    expect([blocagesOuverts(), bloque()]).toEqual([0, false]); // l'ancien schéma remettait « hidden » ici
  });
  it('changement de page : un blocage resté compté SANS fenêtre ouverte est levé ; avec une fenêtre ouverte, il reste', () => {
    verrouillerDefilement(); // une fenêtre « perdue » (jamais libérée)
    verifierApresChangementDePage();
    expect([blocagesOuverts(), bloque()]).toEqual([0, false]);
    const fenetre = document.createElement('div'); fenetre.setAttribute('aria-modal', 'true'); document.body.appendChild(fenetre);
    const lib = verrouillerDefilement();
    verifierApresChangementDePage();
    expect(bloque()).toBe(true);
    lib(); fenetre.remove();
    expect(bloque()).toBe(false);
  });
});
