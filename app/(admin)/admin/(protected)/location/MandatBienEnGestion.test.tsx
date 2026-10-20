// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';

/**
 * 🔴 Arno (21/10/2026, 397) — « Nouveau bien », bloc « Bien en gestion ? » : Oui ouvre « Mandat de gestion », Non ouvre « Mandat
 * de transaction locative » (n°, date de signature) ; bascule sans perte ; seul le mandat du choix final part ; pré-rempli depuis
 * la fiche du propriétaire ; facultatif. Les VRAIS composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[]; let mandatsConnus: unknown[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; mandatsConnus = [{ id: 1, nom: 'DUPONT Paul', gestion: { numero: null, signeLe: null }, transaction: { numero: null, signeLe: null } }];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c); return ok({ logementId: 9 }); }
    const u = String(url);
    if (u.includes('mandatsProprietaires=')) return ok(mandatsConnus);
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const bloc = () => container.querySelector('[data-question-gestion="bien"]') as HTMLElement;
const bouton = (mot: 'Oui' | 'Non') => [...bloc().querySelectorAll('.loc-oui-non button')].find((b) => b.textContent?.replace('✓ ', '') === mot) as HTMLButtonElement;
const ligne = (s: 'gestion' | 'transaction') => bloc().querySelector(`[data-mandat-ligne="${s}"]`) as HTMLElement;
const ouvertes = () => (['gestion', 'transaction'] as const).filter((s) => ligne(s).getAttribute('data-ouverte') === 'oui');
const champ = (s: 'gestion' | 'transaction', k: 'numero' | 'date') => bloc().querySelector(`[data-mandat-${k}="${s}"]`) as HTMLInputElement;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer(); await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
const rendre = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
  await calmer(); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await calmer();
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
};

describe('🔴 « Bien en gestion ? » → la ligne du mandat', () => {
  it('fermées tant qu’on n’a pas répondu ; Oui ouvre « Mandat de gestion », Non « Mandat de transaction locative », juste sous les boutons', async () => {
    await rendre();
    expect(ouvertes()).toEqual([]);
    await clic(bouton('Oui'));
    expect(ouvertes()).toEqual(['gestion']);
    expect(ligne('gestion').querySelector('legend')?.textContent).toBe('Mandat de gestion (facultatif)');
    expect(ligne('gestion').compareDocumentPosition(bouton('Oui')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect([...ligne('gestion').querySelectorAll('label')].map((l) => l.firstChild?.textContent)).toEqual(['N° de mandat', 'Date de signature']);
    await clic(bouton('Non'));
    expect(ouvertes()).toEqual(['transaction']);
    expect(ligne('transaction').querySelector('legend')?.textContent).toBe('Mandat de transaction locative (facultatif)');
    // L'animation de dépliement des encarts (et aucune si l'on a demandé moins d'animations).
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('');
    expect(css).toContain('.lmd{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease,opacity .28s ease}');
    expect(css).toContain('@media (prefers-reduced-motion: reduce){ .lmd{transition:none} }');
    expect(ligne('gestion').hasAttribute('inert')).toBe(true);
  });

  it('BASCULE : la saisie de la ligne refermée est gardée ; seul le mandat du CHOIX FINAL est envoyé', async () => {
    await rendre();
    await clic(bouton('Oui'));
    await saisir(champ('gestion', 'numero'), 'MG-41');
    await saisir(champ('gestion', 'date'), '2026-10-15');
    await clic(bouton('Non'));
    await saisir(champ('transaction', 'numero'), 'MT-7');
    await clic(bouton('Oui'));
    expect([champ('gestion', 'numero').value, champ('gestion', 'date').value, champ('transaction', 'numero').value]).toEqual(['MG-41', '2026-10-15', 'MT-7']);
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', enGestion: true, mandat: { sorte: 'gestion', numero: 'MG-41', signeLe: '2026-10-15' } });
    await clic(bouton('Non'));
    await soumettre();
    expect(posts[1]).toMatchObject({ action: 'creer-bien', enGestion: false, mandat: { sorte: 'transaction', numero: 'MT-7', signeLe: '' } });
  });

  it('FACULTATIF : jamais dans « Reste à renseigner », l’enregistrement part sans mandat (aucune clé « mandat »)', async () => {
    await rendre();
    await clic(bouton('Oui'));
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    expect(barre()).not.toMatch(/mandat/i);
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty('mandat');
  });

  it('PRÉ-REMPLI depuis le mandat existant du propriétaire (modifiable), pour chaque sorte', async () => {
    mandatsConnus = [{ id: 1, nom: 'DUPONT Paul', gestion: { numero: 'MG-2019-3', signeLe: '2019-03-01' }, transaction: { numero: null, signeLe: null } }];
    await rendre();
    await clic(bouton('Oui'));
    expect([champ('gestion', 'numero').value, champ('gestion', 'date').value]).toEqual(['MG-2019-3', '2019-03-01']);
    expect(bloc().querySelector('[data-mandat-note="gestion"]')?.textContent).toBe('Pré-rempli avec le mandat de gestion existant de DUPONT Paul — modifiable.');
    expect(champ('transaction', 'numero').value).toBe('');
    await saisir(champ('gestion', 'numero'), 'MG-2019-3 bis');
    await soumettre();
    expect(posts[0]).toMatchObject({ mandat: { sorte: 'gestion', numero: 'MG-2019-3 bis', signeLe: '2019-03-01' } });
  });
});
