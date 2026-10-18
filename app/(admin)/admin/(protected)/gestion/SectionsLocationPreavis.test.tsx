// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SectionLocationLocataire } from './SectionsLocationFiche';

/**
 * LE PRÉAVIS SUR LA FICHE COMMUNE (Arno, 18/10/2026) — la fiche locataire (Gestion ET Location) montre le statut « en
 * préavis » avec ses dates et les gestes « Corriger le préavis » / « Annuler le préavis » ; le résumé replié le dit aussi.
 * Le VRAI composant, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const FICHE = (dateMax: string) => ({
  fiche: { modifiable: true }, sortie: null,
  locations: [{ occupationId: 11, lotId: 7, adresse: '4 rue Fictive', commune: 'PUTEAUX', entree: '2022-09-01', sortie: null, location: null }],
  preavis: [{ occupationId: 11, preavis: { id: 50, occupationId: 11, recuLe: '2026-10-01', dateMax, mode: 'mois', dureeMois: 1, motif: 'mutation',
    creePar: 'arno@exemple.fr', creeLe: '2026-10-01', dureeProposee: 1 } }],
});

describe('fiche locataire — section « Location » : le préavis', () => {
  it('statut « en préavis » avec ses dates, gestes Corriger / Annuler, et mention dans le résumé replié', async () => {
    global.fetch = vi.fn(async () => ok(FICHE('2099-11-01'))) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await act(async () => { await Promise.resolve(); });
    const bloc = container.querySelector('[data-preavis-fiche]')!;
    expect(bloc.querySelector('[data-preavis]')?.textContent).toBe('en préavis — sortie au plus tard le 01/11/2099');
    expect(bloc.textContent).toContain('Reçu le 01/10/2026 — mutation');
    expect(bloc.querySelector('button[data-corriger-preavis]')).not.toBeNull();
    expect(bloc.querySelector('button[data-annuler-preavis]')).not.toBeNull();
    expect(container.querySelector('summary')?.textContent).toContain('locataire en préavis');
  });

  it('préavis échu : l’alerte « Préavis échu — sortie à saisir », aussi dans le résumé', async () => {
    global.fetch = vi.fn(async () => ok(FICHE('2020-01-01'))) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[data-preavis-fiche] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir (au plus tard le 01/01/2020)');
    expect(container.querySelector('summary')?.textContent).toContain('préavis échu — sortie à saisir');
  });

  it('« Annuler le préavis » : le geste part par la route de la fiche commune', async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => (init?.method === 'POST' ? ({ ok: true, json: async () => ({ etat: 'ok', data: {} }) }) as unknown as Response : ok(FICHE('2099-11-01'))));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await act(async () => { await Promise.resolve(); });
    act(() => (container.querySelector('button[data-annuler-preavis]') as HTMLButtonElement).click());
    await act(async () => { (container.querySelector('button[data-confirmer-annulation-preavis]') as HTMLButtonElement).click(); });
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(String(post[0])).toBe('/api/admin/gestion/annuaire/location');
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ action: 'annuler-preavis', preavisId: 50 });
  });
});
