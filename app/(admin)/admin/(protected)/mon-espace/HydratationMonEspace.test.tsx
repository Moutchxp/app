// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

/**
 * 🔴🔴 Arno (13/11/2026) — « Hydration failed » sur /admin/mon-espace?espace=…, ?saisie=…&partie=… : le serveur rendait la page SANS lire l'adresse
 * (pas de window côté serveur : « Mon espace », « Chargement de vos affaires… ») et le navigateur AVEC (« Chargement de MACJ… »). L'adresse est
 * désormais lue par Next (`useSearchParams`) : la même des deux côtés. L'épreuve rejoue exactement la situation : le rendu « serveur » ne voit PAS
 * l'adresse du document (comme un vrai serveur), seulement les paramètres que Next lui donne ; puis le navigateur hydrate sur la vraie adresse.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const h = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', async (orig) => ({ ...(await orig<typeof import('next/navigation')>()), useSearchParams: () => h.params,
  usePathname: () => '/admin/mon-espace', useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }) }));
import { MesCompteurs } from './MesCompteurs';

let container: HTMLDivElement; let root: Root | null;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = null;
  globalThis.fetch = vi.fn(async () => new Promise(() => {})) as unknown as typeof fetch; // la lecture reste en cours : seul le premier rendu compte
});
afterEach(() => { if (root !== null) act(() => { root!.unmount(); }); container.remove(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('🔴 aucune erreur d’hydratation sur les adresses de « Mon espace »', () => {
  it.each(['?espace=macj', '?espace=criterimmo&onglet=couts', '?saisie=2026-01&partie=couts', '?espace=criterimmo&onglet=couts&saisie=2026-03&partie=ca', '?vue=annee'])(
    '%s : le HTML du serveur = le premier rendu du navigateur', async (q) => {
      h.params = new URLSearchParams(q.slice(1));
      // « serveur » : l'adresse du document n'est PAS celle de la page (il n'en a pas) — seuls les paramètres de Next comptent
      window.history.replaceState(null, '', '/');
      const html = renderToString(createElement(MesCompteurs));
      container.innerHTML = html;
      // navigateur : la vraie adresse
      window.history.replaceState(null, '', `/admin/mon-espace${q}`);
      const erreurs: unknown[] = [];
      const espion = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreurs.push(a); });
      await act(async () => { root = hydrateRoot(container, createElement(MesCompteurs), { onRecoverableError: (e) => { erreurs.push(e); } }); });
      espion.mockRestore();
      expect(erreurs.map((e) => String(e))).toEqual([]);
      expect(container.innerHTML).toBe(html);
    });
  it('le texte du premier rendu suit l’adresse (MACJ), côté serveur comme côté navigateur', () => {
    h.params = new URLSearchParams('espace=macj');
    window.history.replaceState(null, '', '/');
    expect(renderToString(createElement(MesCompteurs))).toContain('Chargement de MACJ…');
  });
});
