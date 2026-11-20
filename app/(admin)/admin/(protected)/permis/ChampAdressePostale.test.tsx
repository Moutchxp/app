// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ChampAdressePostale } from './ChampAdressePostale';

/** 🔴🔴 Arno (20/11/2026, lot 7b) — l'adresse postale d'un service de mairie : le composant unique, la saisie libre CONSERVÉE derrière le lien. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let c: HTMLDivElement; let root: Root; let valeurs: string[];
beforeEach(() => { c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); valeurs = [];
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ features: [] }) }) as unknown as Response); });
afterEach(() => { act(() => root.unmount()); c.remove(); vi.unstubAllGlobals(); });
function Hote({ depart }: { depart: string }) {
  const [v, setV] = useState(depart);
  return createElement(ChampAdressePostale, { valeur: v, onChange: (x: string) => { valeurs.push(x); setV(x); }, style: {}, ariaLabel: 'Adresse postale' });
}
const clic = async (sel: string) => { await act(async () => { (c.querySelector(sel) as HTMLElement).click(); }); };

describe('l’adresse postale d’un service de mairie', () => {
  it('par défaut le composant unique, la valeur enregistrée affichée telle quelle (jamais réécrite) ; « Adresse absente de la liste ? » ouvre la saisie libre (BP, CS, CEDEX), « Revenir aux suggestions » la referme', async () => {
    await act(async () => { root.render(createElement(Hote, { depart: 'Service urbanisme, BP 12, 92001 Nanterre CEDEX' })); });
    const liste = c.querySelector('input[aria-label="Adresse postale"]') as HTMLInputElement;
    expect(liste.getAttribute('role')).toBe('combobox');
    expect(liste.value).toBe('Service urbanisme, BP 12, 92001 Nanterre CEDEX');
    expect(valeurs).toEqual([]);
    await clic('[data-adresse-texte-hors-liste]');
    const libre = c.querySelector('[data-adresse-texte-libre]') as HTMLInputElement;
    expect(libre.getAttribute('role')).toBeNull();
    expect(libre.value).toBe('Service urbanisme, BP 12, 92001 Nanterre CEDEX');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(libre, 'Service urbanisme, CS 30001, 92001 Nanterre CEDEX'); libre.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(valeurs).toEqual(['Service urbanisme, CS 30001, 92001 Nanterre CEDEX']);
    await clic('[data-adresse-texte-retour]');
    expect(c.querySelector('input[aria-label="Adresse postale"]')!.getAttribute('role')).toBe('combobox');
  });
  it('les deux écrans du contact mairie l’emploient ; la carte d’événement et le bâtiment d’un permis passent par le composant unique', () => {
    for (const f of ['EditeurContactCommune.tsx', 'PermisVue.tsx']) expect(readFileSync(`app/(admin)/admin/(protected)/permis/${f}`, 'utf8')).toContain('<ChampAdressePostale');
    expect(readFileSync('app/(admin)/admin/(protected)/permis/CaracteristiquesBloc.tsx', 'utf8')).toContain("<ChampAdresseOfficielle valeur={ed.adresse}");
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8')).toContain('<ChampAdresseOfficielle valeur={adresse}');
  });
});
