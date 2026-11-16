// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AgCopropriete } from './AgCopropriete';

/** 🔴 Arno (16/11/2026, 475) — le bloc « AG de la copropriété » (fiche du bien, fiche syndic) : dates, statut, qui, quand — LECTURE SEULE. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let urls: string[]; let reponse: unknown;
const ENTREE = (o: Record<string, unknown>) => ({ id: 1, type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false, origine: 'fiche_bien',
  saisieLe: '2026-04-01T10:00:00.000Z', saisiePar: 'Claire Test', sortieId: null, aRattacher: false, ...o });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); urls = [];
  reponse = { etat: 'ok', data: { copropriete: 'Résidence Fictive', immeuble: 'Résidence Fictive', applicable: true, entrees: [
    ENTREE({ id: 3, type: 'prochaine', statut: 'officielle', date: '2027-04-02', origine: 'sortie', sortieId: 12, saisiePar: 'Arnaud JOREL', saisieLe: '2026-11-16T10:00:00.000Z' }),
    ENTREE({ id: 2, type: 'prochaine', statut: 'projetee', date: '2027-03-12', origine: 'sortie', sortieId: 11, saisiePar: 'Arnaud JOREL', saisieLe: '2026-11-15T10:00:00.000Z' }),
    ENTREE({ id: 1 })] } };
  global.fetch = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return json(reponse); }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

describe('AgCopropriete', () => {
  it('fiche du bien : lu par le BIEN (jamais par le syndic) ; chaque date avec son statut, qui et quand ; officielle et projetée distinctes', async () => {
    await act(async () => { root.render(createElement(AgCopropriete, { lotId: 7 })); });
    await calmer();
    expect(urls).toEqual(['/api/admin/gestion/immeubles/ag?lotId=7']);
    expect(container.querySelector('.agc-titre')?.textContent).toBe('AG de la copropriété — Résidence Fictive');
    const lignes = [...container.querySelectorAll('[data-agc-entree]')];
    expect(lignes.map((x) => x.textContent)).toEqual([
      '02/04/2027 — prochaine AG, officielle — saisie par Arnaud JOREL le 16/11/2026 (sortie n° 12)',
      '12/03/2027 — prochaine AG, projetée — saisie par Arnaud JOREL le 15/11/2026 (sortie n° 11)',
      '12/03/2026 — dernière AG tenue — saisie par Claire Test le 01/04/2026 (fiche du bien)']);
    expect(lignes.map((x) => x.className)).toEqual(['agc-entree agc-entree--officielle', 'agc-entree agc-entree--projetee', 'agc-entree agc-entree--tenue']);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toContain('.agc-entree--projetee{border-style:dashed;font-style:italic}');
  });
  it('fiche syndic : lu par l’IMMEUBLE de la copropriété ; un bien sans copropriété : « à rattacher » ; aucun historique : le dit ; sans la 475 : rien', async () => {
    reponse = { etat: 'ok', data: { copropriete: null, immeuble: '3 impasse Neuve', applicable: true, entrees: [] } };
    await act(async () => { root.render(createElement(AgCopropriete, { immeuble: '3 impasse Neuve' })); });
    await calmer();
    expect(urls[0]).toBe('/api/admin/gestion/immeubles/ag?immeuble=3%20impasse%20Neuve');
    expect(container.querySelector('[data-agc-a-rattacher]')?.textContent).toBe(' — à rattacher à une copropriété');
    expect(container.querySelector('[data-agc-vide]')?.textContent).toBe('Aucune AG enregistrée.');
    reponse = { etat: 'sans_schema' };
    await act(async () => { root.render(createElement(AgCopropriete, { lotId: 8 })); });
    await calmer();
    expect(container.querySelector('[data-ag-copropriete-bloc]')).toBeNull();
  });
});
