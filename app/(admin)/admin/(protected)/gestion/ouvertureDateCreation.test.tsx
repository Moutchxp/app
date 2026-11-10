// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';

/**
 * 🔴 LOT GES-16/21 (Arno, 10/11/2026) — LA CARTE « OUVERTURE » DIT QUAND L'ÉVÉNEMENT A ÉTÉ CRÉÉ.
 *
 * Cas réel : GES-2026-000016 (créé le 30/10/2026 à 10:30:49) et GES-2026-000021 (04/11/2026 à 12:59:17) n'ont aucune étape
 * « ouverture » enregistrée ; leur carte dérivée affichait « date de création inconnue », alors que la ligne `ouverture` du
 * journal porte l'instant. La route la lit (`ouvertureCreeeLe`) ; sans elle, la carte avoue toujours « inconnue ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let reponse: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string) =>
    json(String(url).includes('/frise') ? reponse : { etat: 'ok' })) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const rendre = async () => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 42 })); });
  await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); });
};
const ligneSousOuverture = () => document.querySelector('[data-ouverture-lecture]')?.closest('li')?.querySelector('.fav-cree') ?? null;

describe('🔴 GES-16/21 — la date de création de la carte Ouverture dérivée', () => {
  it('le journal porte l’instant : « créée le 30/10/2026 », en vert (connue)', async () => {
    reponse = { etat: 'ok', ouvert: true, ouvertLe: '2026-10-30 10:30:49.246213+01', ouvertureCreeeLe: '2026-10-30 10:30:49', etapes: [] };
    await rendre();
    const ligne = ligneSousOuverture()!;
    expect(ligne.textContent).toBe('créée le 30/10/2026');
    expect(ligne.classList.contains('fav-cree--inconnue')).toBe(false);
  });
  it('aucune ligne au journal (ou route d’avant ce lot) : « date de création inconnue », en gris — rien n’est inventé', async () => {
    for (const ouvertureCreeeLe of [null, undefined]) {
      reponse = { etat: 'ok', ouvert: true, ouvertLe: '2026-10-30 10:30:49.246213+01', ouvertureCreeeLe, etapes: [] };
      await rendre();
      const ligne = ligneSousOuverture()!;
      expect(ligne.textContent).toBe('date de création inconnue');
      expect(ligne.classList.contains('fav-cree--inconnue')).toBe(true);
      act(() => root.unmount());
      root = createRoot(container);
    }
  });
});
