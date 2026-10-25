// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { ChampNombre } from './ChampNombre';
import { CaseEuros } from './ConditionsEntree';

/**
 * 🔴 Arno (25/10/2026) — LE CHAMP NUMÉRIQUE PARTAGÉ : frappe filtrée (le parent reçoit la valeur filtrée), point → virgule, collage
 * filtré, collage sans chiffre refusé (bulle courte, rien de modifié) ; et la GARDE : plus aucun champ décimal de Location hors du composant.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let root: Root;
let recu: string[];
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); recu = []; });
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); });

function Banc({ decimales, euros = false }: { decimales?: number; euros?: boolean }) {
  const [v, setV] = useState('');
  const onChange = (e: { target: { value: string } }) => { recu.push(e.target.value); setV(e.target.value); };
  return euros ? createElement(CaseEuros, { value: v, onChange }) : createElement(ChampNombre, { value: v, onChange, decimales });
}
const monter = async (p: { decimales?: number; euros?: boolean } = {}) => { await act(async () => { root.render(createElement(Banc, p)); }); return hote.querySelector('input') as HTMLInputElement; };
const taper = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const coller = async (el: HTMLInputElement, texte: string) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } };
  Object.defineProperty(ev, 'clipboardData', { value: { getData: () => texte } });
  await act(async () => { el.dispatchEvent(ev); });
  return ev;
};

describe('🔴 ChampNombre — la frappe', () => {
  it('caractères refusés ignorés : le parent ne reçoit que la valeur filtrée', async () => {
    const el = await monter();
    await taper(el, '12a');
    expect(el.value).toBe('12');
    expect(recu.at(-1)).toBe('12');
    expect(el.getAttribute('inputmode')).toBe('decimal');
  });
  it('le point devient une virgule ; un seul séparateur ; 2 décimales', async () => {
    const el = await monter();
    await taper(el, '1 234.567');
    expect(el.value).toBe('1 234,56');
  });
  it('indice : 3 décimales ; entier : aucune, clavier numérique', async () => {
    expect((await taper(await monter({ decimales: 3 }), '146.6809'), hote.querySelector('input')!.value)).toBe('146,680');
    act(() => { root.unmount(); }); root = createRoot(hote);
    const e = await monter({ decimales: 0 });
    await taper(e, '3,5');
    expect([e.value, e.getAttribute('inputmode')]).toEqual(['35', 'numeric']);
  });
  it('CaseEuros (tous les montants de Location) passe par le même composant', async () => {
    const el = await monter({ euros: true });
    await taper(el, '9,999 €');
    expect(el.value).toBe('9,99');
    expect(el.hasAttribute('data-champ-nombre')).toBe(true);
  });
});

describe('🔴 ChampNombre — le collage', () => {
  it('filtré : « 1.234,56 € » → « 1234,56 »', async () => {
    const el = await monter();
    const ev = await coller(el, '1.234,56 €');
    expect(ev.defaultPrevented).toBe(true);
    expect(el.value).toBe('1234,56');
    expect(recu.at(-1)).toBe('1234,56');
  });
  it('sans aucun chiffre : refusé, avec un message court ; rien n’est modifié', async () => {
    const el = await monter();
    await taper(el, '12');
    await coller(el, 'bonjour');
    expect(el.value).toBe('12');
    expect(el.validationMessage).toBe('Collage refusé : aucun nombre à coller.');
    expect(el.dataset.collageRefuse).toBe('Collage refusé : aucun nombre à coller.');
    // La frappe suivante efface le message.
    await taper(el, '123');
    expect(el.validationMessage).toBe('');
  });
});

describe('🔴 la garde : plus aucun champ décimal de Location hors du composant partagé', () => {
  const lister = (d: string): string[] => readdirSync(d).flatMap((n) => {
    const p = path.join(d, n);
    return statSync(p).isDirectory() ? lister(p) : /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
  });
  it('aucun `<input … inputMode="decimal"` dans location/ et gestion/ (sauf le composant lui-même)', () => {
    const fautifs = [...lister('app/(admin)/admin/(protected)/location'), ...lister('app/(admin)/admin/(protected)/gestion')]
      .filter((f) => !f.endsWith('ChampNombre.tsx'))
      .filter((f) => /<input\b[^>]*inputMode="decimal"/.test(readFileSync(f, 'utf8')));
    expect(fautifs).toEqual([]);
  });
});
