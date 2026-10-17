// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RechercheEvenementsTache } from './RechercheEvenementsTache';

/**
 * ══ 🔴 LOT GESTION-RECHERCHE-EVENEMENTS — LE MOTEUR DE RECHERCHE DES ÉVÉNEMENTS À RATTACHER (vrai composant) ═══════
 * Propositions dès 2 caractères ; locataire → son bien ; propriétaire → tous ses biens, regroupés (adresse en
 * intertitre) ; adresse → le bien ; « Aucun événement ouvert pour … » ; étiquettes retirables ; rattachements existants.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let appels: string[];
let container: HTMLDivElement;
let root: Root;
const GROUPES: Record<string, unknown> = {
  '3': [{ lotId: 3, adresse: '71 Rue de la République, Puteaux', evenements: [{ id: 1, reference: 'GES-2026-990001', objet: 'A' }] }],
  '76,78': [
    { lotId: 76, adresse: '70 ter rue de la République — lot 90', evenements: [{ id: 3, reference: 'GES-2026-990003', objet: 'C' }] },
    { lotId: 78, adresse: '70 ter rue de la République — lot 164', evenements: [{ id: 4, reference: 'GES-2026-990004', objet: 'D' }] },
  ],
  '9': [{ lotId: 9, adresse: '1 rue Calme', evenements: [] }],
};
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = decodeURIComponent(String(u));
    appels.push(url);
    const q = /\?q=(.*)$/.exec(url)?.[1];
    if (q !== undefined) {
      return Response.json({ etat: 'ok', propositions: [
        { sorte: 'locataire', libelle: 'BAYET Léa', detail: 'locataire en place', lots: [3] },
        { sorte: 'proprietaire', libelle: 'LATHAM', detail: 'propriétaire de 2 biens', lots: [76, 78] },
        { sorte: 'bien', libelle: '1 rue Calme', detail: 'lot 9', lots: [9] },
      ] });
    }
    const lots = /\?lots=(.*)$/.exec(url)?.[1] ?? '';
    return Response.json({ etat: 'ok', groupes: GROUPES[lots] ?? [] });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function Banc({ rattaches = [] as { id: number; reference: string; objet: string; ouvert: boolean }[], depart = [] as number[] }) {
  const [choisis, setChoisis] = useState<number[]>(depart);
  return createElement(RechercheEvenementsTache, {
    rattaches, duBien: [], choisis, desactive: false,
    onBasculer: (id: number) => setChoisis((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
  });
}
const calmer = async () => { await act(async () => { vi.advanceTimersByTime(300); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const taper = async (v: string) => {
  const el = container.querySelector('[data-recherche-evenements]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const proposition = (sorte: string) => container.querySelector(`[data-proposition="${sorte}"]`) as HTMLButtonElement;

describe('le moteur de recherche', () => {
  it('rien sous 2 caractères ; dès 2, les propositions (locataire, propriétaire, adresse)', async () => {
    await act(async () => { root.render(createElement(Banc)); });
    await taper('b');
    expect(appels.some((u) => u.includes('?q='))).toBe(false);
    await taper('ba');
    expect(appels.filter((u) => u.includes('?q='))).toEqual(['/api/admin/gestion/taches/evenements?q=ba']);
    expect([...container.querySelectorAll('[data-proposition]')].map((b) => b.textContent)).toEqual([
      'LocataireBAYET Léalocataire en place', 'PropriétaireLATHAMpropriétaire de 2 biens', 'Adresse1 rue Calmelot 9',
    ]);
  });
  it('propriétaire : tous ses biens, un intertitre par bien ; cocher → étiquette ; enchaîner une autre recherche', async () => {
    await act(async () => { root.render(createElement(Banc)); });
    await taper('latham');
    await act(async () => { proposition('proprietaire').click(); });
    await calmer();
    expect(appels).toContain('/api/admin/gestion/taches/evenements?lots=76,78');
    expect([...container.querySelectorAll('.tchf-intertitre')].map((p) => p.textContent)).toEqual([
      '70 ter rue de la République — lot 90', '70 ter rue de la République — lot 164']);
    await act(async () => { (container.querySelector('[data-evenement-choix="4"]') as HTMLInputElement).click(); });
    expect(container.querySelector('[data-etiquette-evenement="4"]')?.textContent).toContain('GES-2026-990004 — D');
    // Une deuxième recherche : l'étiquette reste.
    await taper('bayet');
    await act(async () => { proposition('locataire').click(); });
    await calmer();
    expect(appels).toContain('/api/admin/gestion/taches/evenements?lots=3');
    await act(async () => { (container.querySelector('[data-evenement-choix="1"]') as HTMLInputElement).click(); });
    expect([...container.querySelectorAll('[data-etiquette-evenement]')].map((e) => (e as HTMLElement).dataset.etiquetteEvenement)).toEqual(['4', '1']);
    // × retire.
    await act(async () => { (container.querySelector('[data-etiquette-evenement="4"] .tchf-etiquette-x') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-etiquette-evenement="4"]')).toBeNull();
  });
  it('adresse sans événement ouvert : « Aucun événement ouvert pour … »', async () => {
    await act(async () => { root.render(createElement(Banc)); });
    await taper('calme');
    await act(async () => { proposition('bien').click(); });
    await calmer();
    expect(container.querySelector('[data-aucun-evenement]')?.textContent).toBe('Aucun événement ouvert pour 1 rue Calme.');
  });
  it('« Modifier » : les rattachements existants sont des étiquettes à l’ouverture (un clos depuis le dit)', async () => {
    await act(async () => { root.render(createElement(Banc, {
      rattaches: [{ id: 1, reference: 'GES-2026-990001', objet: 'A', ouvert: true }, { id: 7, reference: 'GES-2026-000007', objet: 'Ancien', ouvert: false }],
      depart: [1, 7] })); });
    expect([...container.querySelectorAll('[data-etiquette-evenement]')].map((e) => e.textContent?.replace('×', ''))).toEqual([
      'GES-2026-990001 — A', 'GES-2026-000007 — Ancien (clos)']);
  });
});
