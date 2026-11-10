// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BandeTiersDuBien } from './TiersDuBien';

/** 🔴 Règle 5 (Arno, 10/11/2026) — la bande « Tiers indépendants ajoutés par une tâche (N) » de l'Historique du bien. Route simulée. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let tiers: unknown[];
let urls: string[];
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  urls = [];
  tiers = [{ id: 1, nom: 'Plombier Test', role: 'Plombier', telephone: '06 11 22 33 44', email: 'plombier@exemple.test', tacheId: 7, creeLe: '2026-11-10T09:00:00Z', par: 'Arno Jorel' }];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => { urls.push(String(u)); return Response.json({ etat: 'ok', tiers }); }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const monter = async () => {
  await act(async () => { root.render(createElement(BandeTiersDuBien, { lotId: 10 })); });
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
};

describe('la bande des tiers indépendants du bien', () => {
  it('repliée avec le nombre ; dépliée : nom, rôle, téléphone, e-mail, date, auteur, tâche', async () => {
    await monter();
    expect(urls).toEqual(['/api/admin/gestion/taches/contacts?bien=10&tiers=1']);
    const s = container.querySelector('[data-tiers-du-bien]') as HTMLElement;
    expect(s.textContent).toContain('Tiers indépendants ajoutés par une tâche1');
    await act(async () => { (s.querySelector('button') as HTMLButtonElement).click(); });
    const li = container.querySelector('[data-tiers="1"]') as HTMLElement;
    for (const t of ['Plombier Test', 'Plombier', '06 11 22 33 44', 'plombier@exemple.test', 'ajouté le 10/11/2026 par Arno Jorel (tâche n° 7)']) expect(li.textContent).toContain(t);
    expect(li.querySelector('a')?.getAttribute('href')).toBe('tel:0611223344');
  });
  it('aucun tiers : rien n’est affiché', async () => {
    tiers = [];
    await monter();
    expect(container.innerHTML).toBe('');
  });
});
