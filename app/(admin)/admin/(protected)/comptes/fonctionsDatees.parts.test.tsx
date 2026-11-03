// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocFonctionsCompte } from './FonctionsCompte';

/**
 * 🔴 D35 (Arno, 03/11/2026, option C) — LE BLOC « FONCTIONS » DATÉ : les cases d'avant (rien de retiré), l'« Activité principale (salaire) » parmi les
 * fonctions cochées, « À compter du », l'historique lisible ; l'envoi porte fonctions + principale + date. `fetch` simulé : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ETAT = { valeur: ['location'], disponible: true, deduites: [], datees: true, principale: 'location', principaleDeduite: true,
  periodes: [{ fonction: 'location', depuis: null, jusqua: null }], principales: [{ activite: 'location', depuis: null }],
  initial: { fonctions: ['location'], principale: 'location' },
  historique: [{ le: '2026-11-03', par: 'Arnaud Jorel', depuis: null, avant: { fonctions: ['location', 'vente'], principale: 'location' }, apres: { fonctions: ['location'], principale: 'location' } }] };
let posts: Record<string, unknown>[];
let etat: Record<string, unknown>;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  posts = []; etat = ETAT;
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, change: true }), { status: 200 }); }
    return new Response(JSON.stringify(etat), { status: 200 });
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const monter = async () => { await act(async () => { root.render(createElement(BlocFonctionsCompte, { compteId: 5 })); }); await act(async () => { await Promise.resolve(); }); };
const $ = (s: string) => container.querySelector<HTMLElement>(s);
const cliquer = async (s: string) => { await act(async () => { $(s)!.click(); }); };

describe('BlocFonctionsCompte — D35', () => {
  it('les cases d’avant sont là ; l’activité principale parmi les cochées (déduite), « À compter du », l’historique « Depuis toujours »', async () => {
    await monter();
    expect(['vente', 'location', 'gestion'].every((f) => $(`[data-fonction="${f}"]`) !== null)).toBe(true);
    expect($('[data-enregistrer-fonctions]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-principale]')].map((x) => x.getAttribute('data-principale'))).toEqual(['location']);
    expect($('[data-principale="location"]')!.getAttribute('aria-checked')).toBe('true');
    expect($('[data-principale-deduite]')).not.toBeNull();
    expect($('[data-fonctions-depuis]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-fonctions-historique] li')].map((x) => x.textContent)).toEqual([
      'Fonctions : Location, Vente → Location le 03/11/2026 — par Arnaud Jorel', 'Depuis toujours : Location — activité principale Location']);
  });
  it('Location → Gestion à compter du 16/11/2027 : l’envoi porte les fonctions, la principale et la date', async () => {
    await monter();
    await cliquer('[data-fonction="gestion"]');
    await cliquer('[data-principale="gestion"]');
    await cliquer('[data-fonction="location"]');
    const d = $('[data-fonctions-depuis]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2027-11-16'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await cliquer('[data-enregistrer-fonctions]');
    expect(posts).toEqual([{ fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' }]);
  });
  it('deux fonctions cochées sans principale choisie : l’enregistrement attend le choix', async () => {
    etat = { ...ETAT, principale: null, principaleDeduite: false, principales: [] };
    await monter();
    await cliquer('[data-fonction="vente"]');
    expect($('[data-principale-a-choisir]')).not.toBeNull();
    expect(($('[data-enregistrer-fonctions]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer('[data-principale="vente"]');
    expect(($('[data-enregistrer-fonctions]') as HTMLButtonElement).disabled).toBe(false);
  });
  it('avant la 453 (sans « datees ») : le bloc d’avant, sans activité principale ni date', async () => {
    etat = { valeur: ['vente'], disponible: true, deduites: ['vente'] };
    await monter();
    expect($('[data-choix-principale]')).toBeNull();
    expect($('[data-fonctions-depuis]')).toBeNull();
    await cliquer('[data-enregistrer-fonctions]');
    expect(posts).toEqual([{ fonctions: ['vente'] }]);
  });
});
