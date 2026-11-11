// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LienRetour, naviguerRetour, noterDepart, retourVersOrigine, SuiviNavigationRetour, useEtatRetour } from './NavigationRetour';

/**
 * 🔴🔴 Arno (11/11/2026) — LE « ← RETOUR » VERS LA PAGE D'ORIGINE, de bout en bout dans le navigateur simulé : un lien suivi note le départ
 * (défilement, ligne dépliée, filtre) ; la page d'arrivée affiche « ← Retour » et y ramène ; la page d'origine se rend TELLE QU'ELLE ÉTAIT.
 * Sans origine : le lien parent d'avant, inchangé. Les liens « nouvel onglet » ne notent rien.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const vers: string[] = [];
let defilementVoulu: number[] = [];
beforeEach(() => {
  window.sessionStorage.clear();
  vers.length = 0; defilementVoulu = [];
  naviguerRetour.vers = (u) => { vers.push(u); };
  window.scrollTo = ((x: number, y: number) => { defilementVoulu.push(y); Object.defineProperty(window, 'scrollY', { configurable: true, value: y }); }) as typeof window.scrollTo;
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

/** Une page d'origine : une liste où une ligne se déplie et un filtre se choisit (comme les préavis). */
function PageListe() {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [filtre, setFiltre] = useState('tous');
  useEtatRetour('liste:essai', { ouverte, filtre }, (v: { ouverte: string | null; filtre: string }) => { setOuverte(v.ouverte); setFiltre(v.filtre); });
  return createElement('div', null,
    createElement('button', { 'data-deplier': '', onClick: () => setOuverte('ESSAIPREAVIS') }, 'Ouvrir'),
    createElement('button', { 'data-filtrer': '', onClick: () => setFiltre('alerte') }, 'Alerte'),
    createElement('p', { 'data-etat': '' }, `${ouverte ?? 'aucune'}|${filtre}`),
    createElement('a', { href: '/admin/location/bien/7', 'data-vers-fiche': '' }, 'Voir la fiche du bien'),
    createElement('a', { href: '/admin/location/locataire/101', target: '_blank', 'data-nouvel-onglet': '' }, 'compléter la fiche'));
}
const aller = (url: string): void => { window.history.replaceState(null, '', url); };
const clic = (sel: string): void => act(() => {
  const el = container.querySelector(sel) as HTMLElement;
  el.addEventListener('click', (e) => { if (el.tagName === 'A') e.preventDefault(); }, { once: true }); // jsdom ne navigue pas
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
});

describe('le retour vers la page d’origine, dans le même état', () => {
  it('départ noté au clic (ligne dépliée, filtre, défilement) ; à l’arrivée « ← Retour » y ramène ; l’origine se rend telle qu’elle était', async () => {
    aller('/admin/location?onglet=preavis');
    await act(async () => { root.render(createElement('div', null, createElement(SuiviNavigationRetour), createElement(PageListe))); });
    act(() => (container.querySelector('[data-deplier]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-filtrer]') as HTMLButtonElement).click());
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    clic('[data-vers-fiche]');
    const pile = JSON.parse(window.sessionStorage.getItem('svav.retour.pile') ?? '[]');
    expect(pile).toMatchObject([{ depuis: '/admin/location?onglet=preavis', vers: '/admin/location/bien/7', defilement: 640, etat: { 'liste:essai': { ouverte: 'ESSAIPREAVIS', filtre: 'alerte' } } }]);
    // L'arrivée : la fiche du bien, et son « ← Retour » (lien parent : la Location).
    act(() => root.unmount()); root = createRoot(container);
    aller('/admin/location/bien/7');
    await act(async () => { root.render(createElement(LienRetour, { href: '/admin/location', mot: 'Location' })); });
    const lien = container.querySelector('a[data-retour-lien]') as HTMLAnchorElement;
    expect([lien.textContent, lien.getAttribute('data-retour-origine')]).toEqual(['← Retour', 'oui']);
    act(() => lien.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    expect(vers).toEqual(['/admin/location?onglet=preavis']);
    // L'origine se recharge : la ligne ESSAIPREAVIS dépliée, le filtre, et le défilement rendus.
    act(() => root.unmount()); root = createRoot(container);
    aller('/admin/location?onglet=preavis');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    vi.useFakeTimers();
    await act(async () => { root.render(createElement('div', null, createElement(SuiviNavigationRetour), createElement(PageListe))); });
    expect(container.querySelector('[data-etat]')?.textContent).toBe('ESSAIPREAVIS|alerte');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(defilementVoulu).toContain(640);
    expect(window.sessionStorage.getItem('svav.retour.restaurer')).toBeNull(); // appliquée une fois, puis retirée
  });

  it('sans origine connue (lien direct, nouvel onglet) : le libellé et le lien parent d’avant, rien n’est empêché', async () => {
    aller('/admin/location/bien/7');
    await act(async () => { root.render(createElement(LienRetour, { href: '/admin/location', mot: 'Location' })); });
    const lien = container.querySelector('a[data-retour-lien]') as HTMLAnchorElement;
    expect([lien.textContent, lien.getAttribute('href')]).toEqual(['← Location', '/admin/location']);
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    lien.addEventListener('click', (x) => { expect(x.defaultPrevented).toBe(false); x.preventDefault(); }, { once: true });
    act(() => { lien.dispatchEvent(e); });
    expect(vers).toEqual([]);
  });

  it('un lien qui s’ouvre dans un NOUVEL onglet ne note aucun départ ; le lien de retour non plus', async () => {
    aller('/admin/location');
    await act(async () => { root.render(createElement('div', null, createElement(SuiviNavigationRetour), createElement(PageListe), createElement(LienRetour, { href: '/admin' }))); });
    clic('[data-nouvel-onglet]');
    clic('a[data-retour-lien]');
    expect(window.sessionStorage.getItem('svav.retour.pile')).toBeNull();
  });

  it('écran d’une même page (Gestion) : retour SANS recharger, par l’écran lui-même, puis état et défilement rendus', async () => {
    aller('/admin/gestion?ecran=partage');
    noterDepart('/admin/gestion?ecran=preavis');
    aller('/admin/gestion?ecran=preavis');
    const naviguer = vi.fn((u: string) => aller(u));
    expect(retourVersOrigine({ memePage: true, naviguer })).toBe(true);
    expect(naviguer).toHaveBeenCalledWith('/admin/gestion?ecran=partage');
    expect(vers).toEqual([]); // pas de rechargement
    // Une origine sur une AUTRE page n'est pas prise par un bouton « ← Retour à la Gestion ».
    aller('/admin/location');
    noterDepart('/admin/gestion?ecran=preavis');
    aller('/admin/gestion?ecran=preavis');
    expect(retourVersOrigine({ memePage: true, naviguer })).toBe(false);
  });
});
