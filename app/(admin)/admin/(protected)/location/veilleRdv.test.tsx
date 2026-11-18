// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { INTERVALLE_VEILLE_RDV_MS, useVeilleRdv } from './preavisSynchro';

/**
 * 🔴🔴 Arno (18/11/2026, 2e lot) — « Dès qu'un collègue ou un locataire répond, les cartouches changent sur les écrans ouverts en quelques secondes
 * au plus, sans recharger la page. » Le vrai crochet est monté ; l'empreinte du serveur est simulée : tant qu'elle ne change pas, rien n'est relu ;
 * dès qu'elle change (une réponse ailleurs), les lignes sont relues au tour suivant — en quelques secondes — sans recharger la page.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let version: string;
let appels: string[];
const relire = vi.fn();
function Sonde() { useVeilleRdv('/api/admin/location', relire); return null; }

let racine: Root;
beforeEach(() => {
  vi.useFakeTimers();
  version = 'r1.d1.a1'; appels = []; relire.mockClear();
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    appels.push(url);
    return Promise.resolve(new Response(JSON.stringify({ etat: 'ok', data: { version } }), { headers: { 'Content-Type': 'application/json' } }));
  }));
  racine = createRoot(document.createElement('div'));
});
afterEach(() => { act(() => racine.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

const tour = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALLE_VEILLE_RDV_MS); }); };

describe('🔴 la mise à jour sans rechargement', () => {
  it('quelques secondes au plus : l’intervalle est de 4 s', () => {
    expect(INTERVALLE_VEILLE_RDV_MS).toBeLessThanOrEqual(5_000);
  });
  it('empreinte inchangée : rien n’est relu ; une réponse ailleurs (empreinte changée) : les lignes sont relues au tour suivant, une fois', async () => {
    await act(async () => { racine.render(createElement(Sonde)); await vi.advanceTimersByTimeAsync(0); });
    expect(appels[0]).toBe('/api/admin/location?rdvVersion=1');
    await tour(); await tour();
    expect(relire).not.toHaveBeenCalled();
    version = 'r2.d1.a1'; // un locataire vient de répondre, dans une autre session
    await tour();
    expect(relire).toHaveBeenCalledOnce();
    await tour();
    expect(relire).toHaveBeenCalledOnce();
    version = 'r2.d2.a1'; // un collègue accepte
    await tour();
    expect(relire).toHaveBeenCalledTimes(2);
  });
  it('onglet caché : aucune lecture (rien ne tourne pour rien)', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => { racine.render(createElement(Sonde)); await vi.advanceTimersByTimeAsync(0); });
    await tour(); await tour();
    expect(appels).toEqual([]);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
});
