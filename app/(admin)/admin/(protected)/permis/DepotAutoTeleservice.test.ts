// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DepotAutoTeleservice } from './DepotAutoTeleservice';

/**
 * LOT 8 — COMPORTEMENT de l'affichage automatique (jsdom + act, sans testing-library). `fetch` mocké, routé par URL/méthode.
 * On PROUVE : commune libre → carte affichée SANS CLIC (chargement au montage) ; « Préparer cette demande » → POST …/demandes
 * avec le lot { cle, communeNom } puis `onChangement()` ; un nouveau signal recharge (la commune libérée réapparaît) ; session
 * expirée → message de reconnexion. Aucune assertion de couleur/classe/pixel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLButtonElement): Promise<void> => {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const propDemo = { codeInsee: '75056', communeNom: 'Paris', cle: '11-12', permis: [{ numDau: 'PC075056', type: 'PC' }], nbDossiers: 1 };

describe('LOT 8 — DepotAutoTeleservice (affichage automatique)', () => {
  it('commune libre → la carte de dépôt apparaît SANS CLIC (chargement au montage)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ propositions: [propDemo] }) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 0, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Paris');
    expect(boutonPar(/Préparer cette demande/i)).toBeTruthy();
  });

  it('aucune commune libre → message « aucune commune libre à proposer », pas de bouton de préparation', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ propositions: [] }) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 0, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/aucune commune libre/i);
    expect(boutonPar(/Préparer cette demande/i)).toBeFalsy();
  });

  it('« Préparer cette demande » → POST …/demandes avec le lot { cle, communeNom } puis onChangement()', async () => {
    const appels: { url: string; method: string; body: unknown }[] = [];
    const onChangement = vi.fn();
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const u = String(url); const i = (init ?? {}) as { method?: string; body?: string };
      appels.push({ url: u, method: i.method ?? 'GET', body: i.body ? JSON.parse(i.body) : undefined });
      if (i.method === 'POST') return { ok: true, status: 200, json: async () => ({ demandesCreees: 1 }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ propositions: [propDemo] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 0, onChangement })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await cliquer(boutonPar(/Préparer cette demande/i)!);

    const post = appels.find((a) => a.method === 'POST');
    expect(post).toBeTruthy();
    expect(post!.url).toContain('/api/admin/permis/demandes');
    expect(post!.body).toEqual({ lots: [{ cle: '11-12', communeNom: 'Paris' }] }); // chemin EXISTANT, un seul lot
    expect(onChangement).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Demande préparée pour Paris/i);
  });

  it('un nouveau signal recharge : la commune libérée (verrou levé) réapparaît d’elle-même', async () => {
    let libre = false; // au départ : aucune commune libre (toutes en attente d'accusé)
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ propositions: libre ? [propDemo] : [] }) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 0, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/aucune commune libre/i);

    libre = true; // référence captée → verrou levé
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 1, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Paris');
    expect(boutonPar(/Préparer cette demande/i)).toBeTruthy();
  });

  it('session expirée (401) → message de reconnexion, aucune carte', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(DepotAutoTeleservice, { signalRafraichir: 0, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/session expirée/i);
    expect(boutonPar(/Préparer cette demande/i)).toBeFalsy();
  });
});
