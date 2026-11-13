// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AdminLoginPage from './page';

/**
 * AUDIT POINT A (décision d'Arno du 15/10/2026) — la voie de secours est RETIRÉE de la page de connexion : la mention
 * « Laisser vide pour l'accès de secours » disparaît et l'adresse e-mail devient obligatoire. Le reste de la page est
 * inchangé (titre, deux champs, bouton).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLElement | null = null;
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); });

function rendre(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine!.render(createElement(AdminLoginPage)));
  return hote;
}

describe('page de connexion admin', () => {
  it('plus aucune mention de l’accès de secours', () => {
    const page = rendre();
    expect(page.textContent).not.toMatch(/secours|Laisser vide/i);
  });

  it('l’adresse e-mail est obligatoire (identifiant vide impossible depuis la page)', () => {
    const champ = rendre().querySelector<HTMLInputElement>('#admin-identifiant')!;
    expect(champ.required).toBe(true);
    expect(champ.type).toBe('email');
  });

  it('le reste est inchangé : titre, adresse, mot de passe obligatoire, bouton', () => {
    const page = rendre();
    expect(page.textContent).toContain('Administration');
    expect(page.textContent).toContain('Adresse e-mail');
    expect(page.textContent).toContain('Mot de passe');
    expect(page.querySelector<HTMLInputElement>('#admin-password')!.required).toBe(true);
    expect(page.querySelector('button[type="submit"]')!.textContent).toBe('Se connecter');
  });
});

/**
 * 🔴 Arno (13/11/2026, iPhone) — un lien ouvert depuis l'app Mail arrive SANS le cookie de session (SameSite=Strict, inchangé) : le garde renvoie
 * à la connexion avec `?retour=` ; la page y ramène — tout de suite si la session est en fait valide, sinon après la connexion. Jamais ailleurs.
 */
describe('🔴 le retour à la page demandée', () => {
  const nav = vi.hoisted(() => ({ allerA: vi.fn() }));
  vi.mock('../../../lib/admin/naviguer', () => nav);
  const RETOUR = '/admin/location?previsite=11&geste=compte-rendu';
  let ping = 401; let appels: string[] = [];
  beforeEach(() => {
    nav.allerA.mockReset(); appels = []; ping = 401;
    window.history.replaceState(null, '', `/admin/login?retour=${encodeURIComponent(RETOUR)}`);
    globalThis.fetch = vi.fn(async (u: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${u}`);
      if (u === '/api/admin/ping') return { ok: ping === 200, status: ping } as Response;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;
  });
  const attendre = async () => { await act(async () => { for (let k = 0; k < 6; k++) await Promise.resolve(); }); };
  it('session en fait valide (la sonde reçoit le cookie) : retour IMMÉDIAT au formulaire, sans se reconnecter', async () => {
    ping = 200;
    rendre(); await attendre();
    expect(appels).toEqual(['GET /api/admin/ping']);
    expect(nav.allerA).toHaveBeenCalledWith(RETOUR, { remplacer: true });
  });
  it('pas de session : le formulaire ; après la connexion, retour EXACT à la page demandée', async () => {
    const page = rendre(); await attendre();
    expect(nav.allerA).not.toHaveBeenCalled();
    const champ = (id: string, v: string) => { const e = page.querySelector<HTMLInputElement>(id)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); };
    act(() => { champ('#admin-identifiant', 'a@b.fr'); champ('#admin-password', 'x'); });
    await act(async () => { page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await attendre();
    expect(appels).toContain('POST /api/admin/session');
    expect(nav.allerA).toHaveBeenCalledWith(RETOUR);
  });
  it('un retour hors de l’admin (autre site, //, schéma) est ignoré : l’accueil de l’admin, aucune sonde', async () => {
    for (const mauvais of ['https://pirate.test/admin', '//pirate.test/admin', '/admin//x', '/autre', 'javascript:alert(1)']) {
      window.history.replaceState(null, '', `/admin/login?retour=${encodeURIComponent(mauvais)}`);
      nav.allerA.mockReset(); appels = [];
      const page = rendre(); await attendre();
      expect(appels).toEqual([]);
      await act(async () => { page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await attendre();
      expect(nav.allerA).toHaveBeenCalledWith('/admin');
      act(() => racine?.unmount()); hote?.remove();
    }
  });
});
