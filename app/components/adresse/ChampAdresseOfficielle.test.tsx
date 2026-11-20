// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampAdresseOfficielle } from './ChampAdresseOfficielle';
import { AdresseAutocomplete, type SuggestionAdresse } from '../AdresseAutocomplete';
import type { AdresseOfficielle } from './adresseOfficielle';

/** 🔴🔴 Arno (20/11/2026, lot 7a) — le composant unique : liste, champ après le choix, format unique ; et le site public, son emballage. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const BAN = { features: [
  { properties: { id: '92026_5162_00001', label: '1 Villa Des Lilas 92400 Courbevoie', name: '1 Villa Des Lilas', housenumber: '1', postcode: '92400', citycode: '92026', city: 'COURBEVOIE' }, geometry: { coordinates: [2.26, 48.89] } },
  { properties: { id: '93010_0001_00001', label: '1 Villa des Lilas 93150 Le Blanc-Mesnil', name: '1 Villa des Lilas', housenumber: '1', postcode: '93150', citycode: '93010', city: 'Le Blanc-Mesnil' } },
] };
let c: HTMLDivElement; let root: Root; let choix: AdresseOfficielle[]; let appels: string[];
beforeEach(() => {
  vi.useFakeTimers();
  c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); choix = []; appels = [];
  vi.stubGlobal('fetch', async (u: string) => { appels.push(String(u)); return { ok: true, json: async () => BAN } as unknown as Response; });
});
afterEach(() => { act(() => { root.unmount(); }); c.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const champ = () => c.querySelector('input') as HTMLInputElement;
const taper = async (v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ(), v); champ().dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { vi.advanceTimersByTime(400); }); await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
const propositions = () => [...c.querySelectorAll('[role="option"] button')].map((b) => b.textContent);
function Hote() {
  const [v, setV] = useState('');
  return createElement(ChampAdresseOfficielle, { valeur: v, onChange: setV, onChoisir: (a: AdresseOfficielle) => { choix.push(a); setV(a.voie); } });
}

describe('le composant unique', () => {
  it('la liste passe par la fonction d’affichage unique ; le choix rend le FORMAT UNIQUE ; le champ montre l’adresse mise en forme, la valeur reste celle de la BAN', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await taper('1 villa des');
    expect(propositions()).toEqual(['1 villa des Lilas, 92400 Courbevoie', '1 villa des Lilas, 93150 Le Blanc-Mesnil']);
    await act(async () => { c.querySelector('[role="option"] button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(choix).toEqual([expect.objectContaining({ banId: '92026_5162_00001', voie: '1 Villa Des Lilas', numero: '1', indice: null, codePostal: '92400', insee: '92026', commune: 'COURBEVOIE' })]);
    expect(champ().value).toBe('1 villa des Lilas');
    expect(propositions()).toEqual([]);
    // la première frappe rend la main au texte tapé
    await taper('1 villa des Lilas b');
    expect(champ().value).toBe('1 villa des Lilas b');
  });
  it('flèches puis Entrée ; Échap ferme sans rien choisir ; moins de 3 caractères : aucune requête', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await taper('1 ');
    expect(appels).toEqual([]);
    await taper('1 villa');
    await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(choix.map((a) => a.insee)).toEqual(['93010']);
    await taper('1 villa d');
    await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(propositions()).toEqual([]);
    expect(choix).toHaveLength(1);
  });
  it('a11y : combobox et liste reliés', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await taper('1 villa');
    expect(champ().getAttribute('role')).toBe('combobox');
    expect(champ().getAttribute('aria-controls')).toBe(c.querySelector('[role="listbox"]')!.id);
  });
});

describe('le site public (AdresseAutocomplete) : un emballage, la même suggestion qu’avant', () => {
  it('5 résultats, la suggestion rendue telle qu’avant (libellé de la BAN, coordonnées, INSEE) ; une proposition sans coordonnées est écartée ; le champ montre l’adresse mise en forme', async () => {
    const choisies: SuggestionAdresse[] = [];
    function Public() {
      const [v, setV] = useState('');
      return createElement(AdresseAutocomplete, { value: v, onChange: setV, onSelect: (s: SuggestionAdresse) => { choisies.push(s); setV(s.label); }, placeholder: 'Votre adresse' });
    }
    await act(async () => { root.render(createElement(Public)); });
    expect(champ().placeholder).toBe('Votre adresse');
    await taper('1 villa des');
    expect(appels[0]).toContain('limit=5');
    expect(propositions()).toEqual(['1 villa des Lilas, 92400 Courbevoie']);
    await act(async () => { (c.querySelector('[role="option"] button') as HTMLButtonElement).click(); });
    expect(choisies).toEqual([{ label: '1 Villa Des Lilas 92400 Courbevoie', lat: 48.89, lon: 2.26, citycode: '92026' }]);
    expect(champ().value).toBe('1 villa des Lilas, 92400 Courbevoie');
  });
});
