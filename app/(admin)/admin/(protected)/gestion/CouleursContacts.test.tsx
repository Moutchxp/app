// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixContacts, type ContactPropose } from './ContactsTache';
import { RechercheEvenementsTache } from './RechercheEvenementsTache';

/**
 * 🔴 Arno (10/11/2026, règle 1) — les listes de recherche des contacts : un code couleur par type (propriétaire, locataire en place, ancien
 * locataire, tiers indépendant) — les tons du bloc PARTIES (`tonDuGroupe`) — et une petite légende. Les vrais composants, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let c: HTMLDivElement; let r: Root;
beforeEach(() => { c = document.createElement('div'); document.body.appendChild(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
const contact = (cle: string, famille: ContactPropose['famille'], nom: string): ContactPropose =>
  ({ cle, famille, nom, qualite: null, organisation: null, adresse: null, coordonnees: [] });

describe('la liste des contacts d’une tâche', () => {
  it('une légende des quatre types, et chaque groupe porte le ton de son type', async () => {
    await act(async () => { r.render(createElement(ChoixContacts, { proposes: [contact('p', 'proprietaire', 'DUPONT Jean'), contact('l', 'locataire', 'MARTIN Alice'),
      contact('a', 'ancien_locataire', 'ROUX Emma'), contact('i', 'independant', 'Plombier Test')], choisis: [], onBasculer: () => {} })); });
    expect([...c.querySelectorAll('[data-legende]')].map((x) => [x.getAttribute('data-legende'), x.textContent, x.querySelector('.tchc-pastille')?.className]))
      .toEqual([['proprietaire', 'Propriétaire', 'tchc-pastille tchc-pastille--rouge'], ['locataire', 'Locataire en place', 'tchc-pastille tchc-pastille--vert'],
        ['ancien_locataire', 'Ancien locataire', 'tchc-pastille tchc-pastille--violet'], ['independant', 'Tiers indépendant', 'tchc-pastille tchc-pastille--bleu']]);
    expect([...c.querySelectorAll('[data-famille]')].map((x) => x.className)).toEqual([
      'tchc-groupe tchc-groupe--rouge', 'tchc-groupe tchc-groupe--vert', 'tchc-groupe tchc-groupe--violet', 'tchc-groupe tchc-groupe--bleu']);
  });
  it('sans contact : pas de légende', async () => {
    await act(async () => { r.render(createElement(ChoixContacts, { proposes: [], choisis: [], onBasculer: () => {} })); });
    expect(c.querySelector('[data-legende-familles]')).toBeNull();
  });
});

describe('« Rattacher à des événements en cours » : la recherche colorée par type, avec la légende', () => {
  it('propriétaire rouge, locataire en place vert, ancien locataire violet ; une adresse sans couleur', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ etat: 'ok', propositions: [
      { sorte: 'proprietaire', famille: 'proprietaire', libelle: 'DUPONT Jean', detail: 'propriétaire', lots: [1] },
      { sorte: 'locataire', famille: 'locataire', libelle: 'MARTIN Alice', detail: 'locataire en place', lots: [1] },
      { sorte: 'locataire', famille: 'ancien_locataire', libelle: 'ROUX Emma', detail: 'ancien locataire', lots: [] },
      { sorte: 'bien', famille: null, libelle: '4 rue Fictive', detail: 'lot 7', lots: [1] }] }) }) as unknown as Response) as unknown as typeof fetch;
    await act(async () => { r.render(createElement(RechercheEvenementsTache, { rattaches: [], duBien: [], choisis: [], desactive: false, onBasculer: () => {} })); });
    const champ = c.querySelector('[data-recherche-evenements]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'dup'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 600)); });
    expect(c.querySelector('[data-legende-familles]')).not.toBeNull();
    expect([...c.querySelectorAll('[data-proposition]')].map((b) => [b.className, b.querySelector('.tchf-prop-sorte')?.textContent])).toEqual([
      ['tchf-proposition tchf-proposition--rouge', 'Propriétaire'], ['tchf-proposition tchf-proposition--vert', 'Locataire en place'],
      ['tchf-proposition tchf-proposition--violet', 'Ancien locataire'], ['tchf-proposition', 'Adresse']]);
  });
});

describe('🔴 la légende explique toute couleur visible dans la liste', () => {
  it('les quatre types toujours, puis « Syndic & immeuble » quand un tel contact est proposé (sans doublon)', async () => {
    const { LegendeFamilles } = await import('./ContactsTache');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement: ce } = await import('react');
    const html = renderToStaticMarkup(ce(LegendeFamilles, { presentes: ['proprietaire', 'syndic_immeuble', 'syndic_immeuble'] }));
    expect([...html.matchAll(/data-legende="([a-z_]+)"/g)].map((m) => m[1])).toEqual(['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'syndic_immeuble']);
  });
});
