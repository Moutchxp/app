// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonDeconnexion } from './BoutonDeconnexion';

/**
 * LOT ERGO-BOITE — « DÉCONNEXION » A CHANGÉ DE PLACE, PAS DE FONCTION.
 *
 * 🔴 CE QUE CE FICHIER GARANTIT, ET POURQUOI IL EXISTE. Le bouton vivait au bas de la colonne de gauche, et
 * `ColonneMode.test.ts` éprouvait qu'il survivait au passage en plein écran. Arno l'a déplacé en haut à droite : la
 * garantie doit donc suivre, sans quoi on aurait déplacé un bouton ET perdu son test le même jour.
 *
 * Plusieurs collaborateurs partagent ce poste : sans ce bouton, changer de personne obligerait à vider les cookies.
 *
 * 🔒 Aucun appel réel : `fetch` est un espion.
 */

let container: HTMLDivElement;
let root: Root;
const appels: { url: string; methode: string | undefined }[] = [];

beforeEach(() => {
  appels.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    appels.push({ url: String(u), methode: init?.method });
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  // `window.location.assign` n'existe pas en environnement de test : on l'espionne pour vérifier la sortie.
  Object.defineProperty(window, 'location', {
    configurable: true, value: { assign: vi.fn(), href: '/admin/gestion' },
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const monter = async () => {
  await act(async () => { root.render(createElement(BoutonDeconnexion)); });
};

describe('🔴 « Déconnexion », en haut à droite', () => {
  it('le bouton existe, et il porte le mot en toutes lettres', async () => {
    await monter();
    const b = container.querySelector('button');
    expect(b).not.toBeNull();
    // Un mot, pas une icône : c'est le geste le plus coûteux de la barre, il ne doit pas se cliquer par erreur ni
    //   se chercher. (Le seul geste à icône de ce lot est « Relever et actualiser », qui, lui, est sans conséquence.)
    expect(b?.textContent?.trim()).toBe('Déconnexion');
  });

  it('🔴 il DÉCONNECTE vraiment : DELETE sur la session, puis retour à la page de connexion', async () => {
    await monter();
    await act(async () => { container.querySelector('button')?.click(); });
    expect(appels.some((a) => a.url.includes('/api/admin/session') && a.methode === 'DELETE')).toBe(true);
    expect(window.location.assign).toHaveBeenCalledWith('/admin/login');
  });

  it('🔴 un appel qui ÉCHOUE ne laisse personne devant un écran qu’il croit avoir quitté', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau coupé'); }));
    await monter();
    await act(async () => { container.querySelector('button')?.click(); });
    // La sortie est dans un `finally` : elle a lieu même quand la requête n'aboutit pas.
    expect(window.location.assign).toHaveBeenCalledWith('/admin/login');
  });
});
