// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AdminLoginPage from '../login/page';
import MotDePasseOubliePage from '../mot-de-passe-oublie/page';
import ReinitialiserPage from './page';

/**
 * 🔴 Arno (24/10/2026, 416) — les écrans du « mot de passe oublié » de l'administration : le lien sous « Se connecter », la demande
 * (message identique), le nouveau mot de passe (deux champs, un œil chacun, 12 caractères), le lien invalide (et le bouton pour en
 * redemander un). Routes simulées : rien n'est écrit, aucun mail.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root | null = null;
let hote: HTMLElement | null = null;
let posts: { url: string; corps: Record<string, unknown> }[];
let reponseLien: unknown;
let reponsePost: { status: number; corps: unknown };
const assign = vi.fn();
beforeEach(() => {
  posts = []; reponseLien = { ok: true, identifiant: 'lea@criterimmo.fr' }; reponsePost = { status: 200, corps: { ok: true, connecte: true } }; assign.mockReset();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), corps: JSON.parse(String(init.body)) as Record<string, unknown> });
      const d = String(url).includes('demander') ? { status: 200, corps: { message: 'x' } } : reponsePost;
      return { ok: d.status < 400, status: d.status, json: async () => d.corps } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => reponseLien } as unknown as Response;
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { search: '?j=JETON', assign }, writable: true, configurable: true });
});
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const rendre = async (c: () => React.ReactElement | null) => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  await act(async () => { racine!.render(createElement(c)); }); await calmer();
  return hote;
};
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const soumettre = async (f: HTMLFormElement) => { await act(async () => { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await calmer(); };

describe('🔴 /admin/login', () => {
  it('« Mot de passe oublié ? » sous « Se connecter », vers la page de demande ; rien d’autre ne change', async () => {
    const p = await rendre(AdminLoginPage);
    const lien = p.querySelector('[data-mot-de-passe-oublie]') as HTMLAnchorElement;
    expect(lien.textContent?.trim()).toBe('Mot de passe oublié ?');
    expect(lien.getAttribute('href')).toBe('/admin/mot-de-passe-oublie');
    expect(lien.previousElementSibling?.textContent).toBe('Se connecter');
    expect(p.querySelectorAll('input')).toHaveLength(2);
  });
});

describe('🔴 la demande', () => {
  it('l’adresse part ; le message est TOUJOURS le même ; retour à la connexion', async () => {
    const p = await rendre(MotDePasseOubliePage);
    await saisir(p.querySelector('#mdpo-email') as HTMLInputElement, 'lea@criterimmo.fr');
    await soumettre(p.querySelector('form')!);
    expect(posts).toEqual([{ url: '/api/admin/reinitialiser/demander', corps: { email: 'lea@criterimmo.fr' } }]);
    expect(p.querySelector('[data-message-demande]')?.textContent).toBe(
      'Si un compte est associé à cette adresse, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.');
    expect((p.querySelector('a[href="/admin/login"]') as HTMLAnchorElement).textContent).toBe('Retour à la connexion');
  });
});

describe('🔴 le nouveau mot de passe', () => {
  it('deux champs, chacun avec SON œil (indépendants) ; 12 caractères ; enregistré → session ouverte (vers l’administration)', async () => {
    const p = await rendre(ReinitialiserPage);
    expect(p.textContent).toContain('lea@criterimmo.fr');
    const [a, b] = [p.querySelector('#reinit-mdp') as HTMLInputElement, p.querySelector('#reinit-mdp2') as HTMLInputElement];
    expect([a.type, b.type]).toEqual(['password', 'password']);
    await act(async () => { (p.querySelector('[data-oeil="reinit-mdp"]') as HTMLButtonElement).click(); });
    expect([(p.querySelector('#reinit-mdp') as HTMLInputElement).type, (p.querySelector('#reinit-mdp2') as HTMLInputElement).type]).toEqual(['text', 'password']);
    await saisir(a, 'court'); await saisir(b, 'court');
    await soumettre(p.querySelector('form')!);
    expect(p.querySelector('[role="alert"]')?.textContent).toBe('Le mot de passe doit contenir au moins 12 caractères.');
    expect(posts).toHaveLength(0);
    await saisir(p.querySelector('#reinit-mdp') as HTMLInputElement, 'un-nouveau-mot-de-passe');
    await saisir(p.querySelector('#reinit-mdp2') as HTMLInputElement, 'un-nouveau-mot-de-passe');
    await soumettre(p.querySelector('form')!);
    expect(posts).toEqual([{ url: '/api/admin/reinitialiser', corps: { jeton: 'JETON', motDePasse: 'un-nouveau-mot-de-passe', confirmation: 'un-nouveau-mot-de-passe' } }]);
    expect(assign).toHaveBeenCalledWith('/admin');
  });
  it('lien expiré / utilisé / remplacé : « Ce lien n’est plus valide » et « Demander un nouveau lien »', async () => {
    reponseLien = { ok: false, message: 'Ce lien n’est plus valide.' };
    const p = await rendre(ReinitialiserPage);
    expect(p.querySelector('[data-lien-invalide]')?.textContent).toBe('Ce lien n’est plus valide.');
    expect(p.querySelector('[data-redemander]')?.getAttribute('href')).toBe('/admin/mot-de-passe-oublie');
    expect(p.querySelector('form')).toBeNull();
  });
  it('le lien devient invalide entre l’ouverture et l’envoi : même écran', async () => {
    reponsePost = { status: 409, corps: { erreur: 'Ce lien n’est plus valide.' } };
    const p = await rendre(ReinitialiserPage);
    await saisir(p.querySelector('#reinit-mdp') as HTMLInputElement, 'un-nouveau-mot-de-passe');
    await saisir(p.querySelector('#reinit-mdp2') as HTMLInputElement, 'un-nouveau-mot-de-passe');
    await soumettre(p.querySelector('form')!);
    expect(p.querySelector('[data-lien-invalide]')).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
