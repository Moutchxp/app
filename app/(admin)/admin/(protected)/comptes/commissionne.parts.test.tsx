// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ComptesPage from './page';
import { BlocCommissionneCompte } from './CommissionneCompte';

/**
 * 🔴 LOT S (Arno, 28/10/2026) — PAGE COMPTES : « Commissionné / Non commissionné », pour un ADMINISTRATEUR seulement (création et Détails),
 * même style que Société et Statut, obligatoire, journalisé avec sa date ; un collaborateur ne voit pas ce choix.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let posts: { url: string; corps: Record<string, unknown> }[];
beforeEach(() => {
  posts = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push({ url: String(url), corps: JSON.parse(String(init.body)) }); return { ok: true, status: 200, json: async () => ({ ok: true, change: true }) }; }
    return { ok: true, status: 200, json: async () => ({ comptes: [
      { id: 2, identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel', role: 'administrateur', actif: true, commissionne: false },
      { id: 8, identifiant: 'p.thevenin@sansvisavis.com', prenom: 'Pierre', nom: 'Thevenin', role: 'collaborateur', actif: true, commissionne: true }],
    societeDisponible: false, statutDisponible: false, commissionneDisponible: true }) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

describe('🔴 LOT S — la création d’un compte', () => {
  it('collaborateur : aucun choix « Commissionné » ; administrateur : le choix, obligatoire (« Créer » désactivé sans lui), envoyé avec la création', async () => {
    await act(async () => { root.render(createElement(ComptesPage)); }); await calmer();
    expect(container.querySelector('[data-choix-commissionne]')).toBeNull();
    const role = container.querySelector('select.cpt-champ') as HTMLSelectElement;
    await act(async () => { role.value = 'administrateur'; role.dispatchEvent(new Event('change', { bubbles: true })); });
    expect([...container.querySelectorAll('[data-commissionne]')].map((b) => b.textContent)).toEqual(['○Commissionné', '○Non commissionné']);
    expect(container.querySelector('[data-commissionne-creation-manque]')).not.toBeNull();
    const creer = [...container.querySelectorAll('button[type="submit"]')].find((b) => b.textContent?.includes('Créer')) as HTMLButtonElement;
    expect(creer.disabled).toBe(true);
    await act(async () => { (container.querySelector('[data-commissionne="non"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-commissionne="non"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-commissionne-creation-manque]')).toBeNull();
  });
  it('la liste dit « Commissions : Non commissionné » pour un administrateur, rien pour un collaborateur', async () => {
    await act(async () => { root.render(createElement(ComptesPage)); }); await calmer();
    expect([...container.querySelectorAll('[data-commissionne-carte]')].map((x) => x.textContent)).toEqual(['Commissions : Non commissionné']);
  });
});

describe('🔴 LOT S — le bloc « Commissions » des Détails', () => {
  const historique = [{ le: '2026-10-28 17:00:00+01', avant: null, apres: false, par: null, origine: 'migration 441' }];
  it('un collaborateur : rien (toujours commissionné)', () => {
    act(() => { root.render(createElement(BlocCommissionneCompte, { compteId: 8, etat: { valeur: null, applicable: false, disponible: true, historique: [] }, onFait: () => {} })); });
    expect(container.innerHTML).toBe('');
  });
  it('un administrateur : le choix, l’historique daté (« migration 441 »), « Enregistrer le choix » → la route du compte', async () => {
    const onFait = vi.fn();
    act(() => { root.render(createElement(BlocCommissionneCompte, { compteId: 2, etat: { valeur: false, applicable: true, disponible: true, historique }, onFait })); });
    expect(container.querySelector('[data-commissionne="non"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-commissionne-historique]')!.textContent).toMatch(/^Non commissionné le 28\/10\/2026.*\(avant : non renseigné\) — migration 441$/);
    const enregistrer = container.querySelector('[data-enregistrer-commissionne]') as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(true);
    await act(async () => { (container.querySelector('[data-commissionne="oui"]') as HTMLButtonElement).click(); });
    await act(async () => { enregistrer.click(); }); await calmer();
    expect(posts).toEqual([{ url: '/api/admin/comptes/2/commissionne', corps: { commissionne: true } }]);
    expect(onFait).toHaveBeenCalled();
  });
});
