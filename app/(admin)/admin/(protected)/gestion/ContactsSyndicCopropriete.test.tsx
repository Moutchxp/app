// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContactsSyndicCopropriete } from './ContactsSyndicCopropriete';

/**
 * 🔴🔴 Arno (20/11/2026) — les contacts du syndic de cette copropriété : rattacher depuis l'annuaire COMPLET du syndic, détacher (jamais supprimer).
 * Routes simulées : rien ne part. 🔒 Aucune donnée réelle.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (d: unknown) => ({ json: async () => d }) as unknown as Response;
const CLAIRE = { id: 5, civilite: 'Mme', prenom: 'Claire', nom: 'Test', titre: 'Gestionnaire', coordonnees: [{ sorte: 'email' as const, libelle: null, valeur: 'claire@cabinet.test' }] };
const PAUL = { id: 6, civilite: null, prenom: 'Paul', nom: 'Essai', titre: 'Comptable', coordonnees: [{ sorte: 'telephone' as const, libelle: null, valeur: '06 99 99 00 01' }] };

let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let gets: string[];
const onChange = vi.fn();
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = []; gets = []; onChange.mockClear();
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok({ etat: 'ok', gestionnaires: corps.action === 'detacher-contact-syndic' ? [] : [CLAIRE, PAUL] });
    }
    gets.push(String(u));
    return ok({ etat: 'ok', syndic: { id: 9, nom: '_TEST SYNDIC CONTACTS' }, contacts: [{ ...CLAIRE, rattache: true }, { ...PAUL, rattache: false }], total: 2 });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });
const $ = (s: string) => container.querySelector(s) as HTMLElement;
const attendre = async () => { await act(async () => { vi.advanceTimersByTime(250); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
const cliquer = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const rendre = (g = [CLAIRE]) => act(() => root.render(createElement(ContactsSyndicCopropriete, { immeuble: '12 rue _test', syndicNom: '_TEST SYNDIC CONTACTS', gestionnaires: g, onChange })));

describe('les contacts du syndic de cette copropriété', () => {
  it('la liste : nom, fonction, coordonnées, un « − » par contact ; « + Rattacher un contact du syndic » à la place de « (lecture seule) »', () => {
    rendre();
    expect($('[data-csc-rattache="5"]').textContent).toContain('Mme Claire TEST · Gestionnaire · claire@cabinet.test');
    expect($('[data-csc-detacher="5"]').getAttribute('aria-label')).toBe('Détacher Mme Claire TEST de cette copropriété');
    expect(container.textContent).not.toContain('lecture seule');
    expect($('[data-csc-ouvrir]').textContent).toBe('+ Rattacher un contact du syndic');
  });

  it('RECHERCHE dans l’annuaire complet du syndic : la frappe part au serveur ; un contact déjà rattaché est coché et grisé', async () => {
    vi.useFakeTimers();
    rendre();
    await cliquer($('[data-csc-ouvrir]'));
    await attendre();
    const champ = $('[data-csc-q]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'compta'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await attendre();
    expect(gets.at(-1)).toContain('contactsSyndic=12%20rue%20_test&q=compta');
    expect($('[data-csc-total]').textContent).toBe('2 contacts dans l’annuaire de _TEST SYNDIC CONTACTS.');
    expect(($('[data-csc-resultat="5"] input') as HTMLInputElement).disabled).toBe(true);
    expect($('[data-csc-resultat="5"]').textContent).toContain('déjà rattaché');
  });

  it('RATTACHER un ou plusieurs contacts : le geste part avec leurs identifiants ; la liste se met à jour', async () => {
    vi.useFakeTimers();
    rendre();
    await cliquer($('[data-csc-ouvrir]'));
    await attendre();
    expect(($('[data-csc-rattacher]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer($('[data-csc-resultat="6"] input'));
    expect($('[data-csc-rattacher]').textContent).toBe('Rattacher à cette copropriété (1)');
    await cliquer($('[data-csc-rattacher]'));
    expect(posts).toEqual([{ action: 'rattacher-contacts-syndic', contactIds: [6], immeuble: '12 rue _test' }]);
    expect(onChange).toHaveBeenCalledWith([CLAIRE, PAUL]);
  });

  it('DÉTACHER : confirmation d’abord (« il reste dans l’annuaire »), puis le geste ; Annuler ne fait rien', async () => {
    rendre();
    await cliquer($('[data-csc-detacher="5"]'));
    expect($('[data-csc-confirmer-detacher="5"]').textContent).toContain('Il reste dans l’annuaire de _TEST SYNDIC CONTACTS.');
    await cliquer($('[data-csc-annuler]'));
    expect(posts).toEqual([]);
    await cliquer($('[data-csc-detacher="5"]'));
    await cliquer($('[data-csc-confirmer]'));
    expect(posts).toEqual([{ action: 'detacher-contact-syndic', contactId: 5, immeuble: '12 rue _test' }]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('aucun contact : « Aucun gestionnaire affecté. »', () => {
    rendre([]);
    expect($('[data-csc-aucun]').textContent).toBe('Aucun gestionnaire affecté.');
  });
});
