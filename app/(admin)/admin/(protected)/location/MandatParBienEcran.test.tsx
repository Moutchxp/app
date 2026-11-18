// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { BlocStatutModification } from './StatutModification';
import { choisirAdresseBan } from './choisirAdresseEssai';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien ») — « Un même n° peut couvrir plusieurs biens UNIQUEMENT s'ils appartiennent au même propriétaire : dans ce
 * cas, fenêtre « Le mandat n° X est déjà utilisé pour <adresse du bien> de ce propriétaire. L'utiliser aussi pour ce bien ? » (Confirmer / Corriger) ;
 * s'il est déjà utilisé par un AUTRE propriétaire → refus avec message clair » ; « chacun modifiable sur son bien ». Les VRAIS composants, routes
 * simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rep = (d: unknown, status = 200) => ({ ok: status < 400, status, json: async () => d }) as unknown as Response;
const PHRASE = 'Le mandat n° MG 41 est déjà utilisé pour 4 rue _TEST MANDAT, 92600 Asnières-sur-Seine de ce propriétaire. L’utiliser aussi pour ce bien ?';
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[]; let reponse: (c: Record<string, unknown>) => unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  reponse = () => ({ etat: 'ok', data: { logementId: 9 } });
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c); return rep(reponse(c)); }
    const u = String(url);
    if (u.includes('cartesProprietaires=')) return rep({ etat: 'ok', data: [{ id: 1, nom: 'MARTIN Paul', telephone: null, email: null, biens: [] }] });
    if (u.includes('mandatsProprietaires=')) return rep({ etat: 'ok', data: [] });
    return rep({ etat: 'ok', data: null });
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.querySelectorAll('.mis-voile').forEach((m) => m.remove()); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const bouton = (repere: string) => document.body.querySelector(`[data-${repere}]`) as HTMLButtonElement | null;
const rendre = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
  await calmer();
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await choisirAdresseBan(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '6 rue _TEST MANDAT');
  const b = [...container.querySelectorAll('[data-question-gestion="bien"] .loc-oui-non button')].find((x) => x.textContent?.replace('✓ ', '') === 'En gestion')!;
  await clic(b);
  await saisir(container.querySelector('[data-mandat-numero="gestion"]') as HTMLInputElement, 'MG 41');
};
const soumettre = async () => { await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); }); await calmer(); };

describe('🔴 « Nouveau bien » : le n° déjà utilisé', () => {
  it('même propriétaire : la fenêtre, mot pour mot ; rien n’est créé ; « Confirmer » renvoie avec la confirmation', async () => {
    reponse = (c) => (c.confirmeMandat === true ? { etat: 'ok', data: { logementId: 9 } } : { etat: 'mandat_a_confirmer', motif: PHRASE });
    await rendre();
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty('confirmeMandat');
    expect(document.body.querySelector('[data-modale-issue]')?.textContent).toContain(PHRASE);
    expect([bouton('mandat-corriger')?.textContent, bouton('mandat-confirmer')?.textContent]).toEqual(['Corriger', 'Confirmer']);
    await clic(bouton('mandat-confirmer')!); await calmer();
    expect(posts[1]).toMatchObject({ action: 'creer-bien', confirmeMandat: true, mandat: { sorte: 'gestion', numero: 'MG 41' } });
  });
  it('« Corriger » : la fenêtre se ferme, rien n’est renvoyé, le champ du n° reprend la main', async () => {
    reponse = () => ({ etat: 'mandat_a_confirmer', motif: PHRASE });
    await rendre();
    await soumettre();
    await clic(bouton('mandat-corriger')!); await calmer();
    expect(posts).toHaveLength(1);
    expect(document.body.querySelector("[data-mandat-confirmer]")).toBeNull();
    expect(document.activeElement?.getAttribute('data-mandat-numero')).toBe('gestion');
  });
  it('🔴 un AUTRE propriétaire : le refus du serveur est dit, sans « Confirmer »', async () => {
    reponse = () => ({ etat: 'refus', motif: 'Le mandat n° MG 41 est déjà utilisé pour 8 rue _TEST MANDAT d’un autre propriétaire : un même n° ne couvre que les biens d’un même propriétaire (exactement les mêmes propriétaires). Rien n’est enregistré.' });
    await rendre();
    await soumettre();
    expect(document.body.querySelector('[data-modale-issue]')?.textContent).toContain('d’un autre propriétaire');
    expect(bouton('mandat-confirmer')).toBeNull();
  });
});

describe('🔴 « Modifier le bien » : le mandat porté par le bien, modifiable', () => {
  const LU = { statut: 'en_gestion' as const, depuis: '2026-01-01', gestes: [], disponible: true, suitLot: null };
  it('le n° et la date du bien, modifiables ; le signalement d’un n° partagé qui ne couvre plus le même propriétaire', async () => {
    const vus: unknown[] = [];
    await act(async () => { root.render(createElement(BlocStatutModification, { numero: 9, lu: LU as never, mandat: null, valeur: null, onChange: () => {},
      mandatBien: { sorte: 'gestion', valeur: { numero: 'MG 41', signeLe: null }, onChange: (m: unknown) => vus.push(m),
        lu: { gestion: { numero: 'MG 41', signeLe: null }, transaction: { numero: null, signeLe: null }, signalements: ['Mandat de gestion n° MG 41 : il est aussi celui de 4 rue _TEST MANDAT, dont les propriétaires ne sont plus exactement les mêmes — ce n° partagé ne couvre plus le même propriétaire.'] } } })); });
    const f = container.querySelector('[data-mandat-bien="gestion"]')!;
    expect(f.querySelector('legend')?.textContent).toBe('Mandat de gestion du bien (facultatif)');
    expect((f.querySelector('[data-mandat-bien-numero]') as HTMLInputElement).value).toBe('MG 41');
    await saisir(f.querySelector('[data-mandat-bien-numero]') as HTMLInputElement, 'MG 42');
    expect(vus.at(-1)).toEqual({ numero: 'MG 42', signeLe: null });
    expect(container.querySelector('[data-mandat-signalement]')?.textContent).toContain('ce n° partagé ne couvre plus le même propriétaire');
    // sans la 492 : la ligne d'avant (lecture seule, sur la fiche du propriétaire)
    await act(async () => { root.render(createElement(BlocStatutModification, { numero: 9, lu: LU as never, mandat: { sorte: 'gestion', lignes: ['Mandat de gestion n° MG 9'] }, valeur: null, onChange: () => {} })); });
    expect(container.querySelector('[data-mandat-bien]')).toBeNull();
    expect(container.querySelector('[data-mandat-connu]')?.textContent).toContain('sur la fiche du propriétaire');
  });
});
