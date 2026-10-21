// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';

/**
 * 🔴 Arno (21/10/2026) — GARDE-FOUS DE « NOUVEAU BIEN » (cas CHALAH, production) :
 *   ① propriétaire cherché et coché, « Rattacher la sélection » oublié : « Enregistrer le bien » ne passe pas en silence —
 *     modale « Vous avez sélectionné un propriétaire sans cliquer sur Rattacher la sélection », « Rattacher et enregistrer » ;
 *     le bouton « Rattacher la sélection » est mis en évidence tant que la sélection attend ;
 *   ② anti-doublon : le serveur répond « doublon » → « Ce bien semble déjà exister », « Voir le bien existant » / « Créer
 *     quand même » (renvoyé avec la confirmation).
 * Les vrais composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const CHALAH = { id: 49, nom: 'CHALAH Ramdane', telephone: '+33611111111', email: null, biens: ['27 rue Royer Bendélé, GENNEVILLIERS'] };
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let reponseCreation: (corps: Record<string, unknown>) => Response;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  reponseCreation = () => ok({ logementId: 436, annexes: [437] });
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c); return reponseCreation(c); }
    if (u.includes('proprietairesRecherche=')) return ok([{ id: 49, titre: 'CHALAH Ramdane', detail: '27 rue Royer Bendélé, GENNEVILLIERS' }]);
    if (u.includes('personnesLiees=49')) return ok({ choisie: 49, proprietaires: [CHALAH], contacts: [] });
    if (u.includes('cartesProprietaires=')) return ok([CHALAH]);
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const modale = () => document.querySelector('[data-modale-issue]') as HTMLElement | null;
const soumettre = async () => { await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); }); await calmer(); };
const parkingComplet = async () => {
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '25 Rue Henri Barbusse');
  await clic([...container.querySelectorAll('[data-question-gestion="bien"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'Oui')!);
};
const chercherChalah = async () => {
  await saisir(container.querySelector('.loc-recherche input') as HTMLInputElement, 'chalah');
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  await calmer();
  await clic(container.querySelector('[data-resultats-proprietaires] button')!);
};

describe('① sélection cochée, « Rattacher la sélection » oublié', () => {
  it('le bouton est MIS EN ÉVIDENCE tant que la sélection attend ; la modale le dit ; « Rattacher et enregistrer » rattache PUIS enregistre', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
    await chercherChalah();
    const rattacher = container.querySelector('[data-rattacher-selection]') as HTMLButtonElement;
    expect(rattacher.className).toContain('loc-qui-attente');
    expect(container.querySelector('[data-selection-en-attente]')?.textContent).toContain('cliquez sur « Rattacher la sélection »');
    await parkingComplet();
    await soumettre();
    expect(posts).toEqual([]);
    expect(modale()?.querySelector('h2')?.textContent).toBe('✕ Sélection non rattachée');
    expect(modale()?.querySelector('[data-echec-pourquoi]')?.textContent).toBe('Vous avez sélectionné un propriétaire sans cliquer sur « Rattacher la sélection ».');
    await clic(modale()!.querySelector('[data-rattacher-et-enregistrer]')!);
    await calmer();
    expect(container.querySelector('[data-carte-proprietaire="49"]')).not.toBeNull();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'creer-bien', proprietaireIds: [49] });
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
  });

  it('« Fermer » : rien n’est rattaché ni envoyé ; une fois rattaché, plus de mise en évidence ni de modale', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
    await chercherChalah();
    await parkingComplet();
    await soumettre();
    await clic(modale()!.querySelector('[data-fermer-issue]')!);
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-carte-proprietaire="49"]')).toBeNull();
    await clic(container.querySelector('[data-rattacher-selection]')!);
    expect(container.querySelector('[data-rattacher-selection]')).toBeNull();
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
  });
});

describe('② anti-doublon', () => {
  it('« Ce bien semble déjà exister » : rien n’est créé ; « Voir le bien existant » ; « Créer quand même » renvoie avec la confirmation', async () => {
    reponseCreation = (c) => (c.confirmeDoublon === true ? ok({ logementId: 500, annexes: [] })
      : ({ ok: true, status: 200, json: async () => ({ etat: 'doublon', motif: 'Un bien de ce propriétaire existe déjà au 25 Rue Henri Barbusse, GENNEVILLIERS (étage 4, porte C43).',
        data: { lotId: 436, adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', etage: '4', porte: 'C43' } }) }) as unknown as Response);
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [49] })); });
    await calmer();
    await parkingComplet();
    await soumettre();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('attention');
    expect(modale()?.querySelector('h2')?.textContent).toBe('⚠ Ce bien semble déjà exister');
    expect(modale()?.textContent).toContain('(étage 4, porte C43)');
    expect(modale()?.querySelector('[data-voir-bien-existant]')?.getAttribute('href')).toBe('/admin/location/bien/436');
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty('confirmeDoublon');
    await clic(modale()!.querySelector('[data-creer-quand-meme]')!);
    await calmer();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({ action: 'creer-bien', confirmeDoublon: true });
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
  });
});
