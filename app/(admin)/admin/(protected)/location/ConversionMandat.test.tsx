// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConversionMandat } from './ConversionMandat';

/**
 * 🔴 Arno (26/10/2026, décision C, 431) — « Convertir en « Mandat de gestion seul » » dans le panneau d'une ligne du Suivi du mois :
 * date du mandat proposée (celle du mandat du propriétaire), confirmation avant d'écrire ; une ligne convertie dit d'où elle vient et
 * propose « Annuler la conversion » (confirmée) ; sans la 431 : « disponible après la mise à jour », rien n'est envoyé. Serveur simulé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
let posts: Record<string, unknown>[]; let disponible: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; disponible = true;
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    const corps = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push(corps);
    if (corps.action === 'proposer-conversion') return new Response(JSON.stringify({ etat: 'ok', data: { disponible, dateProposee: '2026-10-20' } }));
    return new Response(JSON.stringify({ etat: 'ok', data: { phrase: 'fait' } }));
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const clic = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const monter = async (a: Parameters<typeof ConversionMandat>[0]['a'], onFini = vi.fn()) => {
  await act(async () => { root.render(createElement(ConversionMandat, { a, onFini })); });
  return onFini;
};

describe('convertir une ligne « Bail »', () => {
  it('le bouton, puis la date du mandat proposée et l’explication ; « Convertir » envoie la conversion et relit', async () => {
    const relu = await monter({ id: 837, type: 'bail', conversion: null });
    expect(container.querySelector('[data-convertir-mandat="837"]')?.textContent).toBe('Convertir en « Mandat de gestion seul »');
    await clic('[data-convertir-mandat="837"]');
    expect((container.querySelector('[data-date-conversion="837"]') as HTMLInputElement).value).toBe('2026-10-20');
    expect(container.textContent).toContain('sort de « Baux signés » et du CA location');
    expect(posts.filter((p) => p.action === 'convertir-mandat-seul')).toEqual([]);
    await clic('[data-confirmer-conversion="837"]');
    expect(posts.at(-1)).toEqual({ action: 'convertir-mandat-seul', id: 837, dateMandat: '2026-10-20' });
    expect(relu).toHaveBeenCalled();
  });
  it('sans la migration 431 : « disponible après la mise à jour », rien n’est converti', async () => {
    disponible = false;
    await monter({ id: 837, type: 'bail', conversion: null });
    await clic('[data-convertir-mandat="837"]');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Disponible après la mise à jour de la base (migration 431).');
    expect(posts.map((p) => p.action)).toEqual(['proposer-conversion']);
  });
  it('rien sur une ligne qui n’est pas un « Bail » (avenant, mandat seul d’origine) ni sur une ligne reprise sans identifiant', async () => {
    await monter({ id: 12, type: 'avenant', conversion: null });
    expect(container.querySelector('[data-conversion]')).toBeNull();
    await monter({ id: '2026-09#3', type: 'bail', conversion: null });
    expect(container.querySelector('[data-conversion]')).toBeNull();
  });
});

describe('une ligne convertie : d’où elle vient, et « Annuler la conversion »', () => {
  it('la mention d’origine ; l’annulation est confirmée avant d’écrire', async () => {
    const relu = await monter({ id: 837, type: 'gestion_seule', conversion: { le: '2026-10-27T09:00:00Z', par: 'a.jorel@sansvisavis.com', typeOrigine: 'bail', dateOrigine: '2014-12-26' } });
    expect(container.querySelector('[data-conversion-origine]')?.textContent).toBe('Converti en « Mandat de gestion seul » le 27/10/2026 par a.jorel@sansvisavis.com — à l’origine « Bail » du 26/12/2014.');
    await clic('[data-annuler-conversion="837"]');
    expect(posts).toEqual([]);
    expect(container.textContent).toContain('elle comptera de nouveau dans « Baux signés »');
    await clic('[data-confirmer-annulation="837"]');
    expect(posts).toEqual([{ action: 'annuler-conversion', id: 837 }]);
    expect(relu).toHaveBeenCalled();
  });
});
