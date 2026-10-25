// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';

/**
 * 🔴 Arno (25/10/2026) — CHOIX EN CASCADE REMIS À ZÉRO (« Nouveau bien ») : Local → Local commercial → Logement → Local : rien n'est
 * plus coché ; les champs propres au chemin quitté sont vidés (pièces, surfaces…), les champs communs (adresse) restent ; le message le
 * dit ; à l'enregistrement, seuls les champs du chemin choisi partent. Vrais composants, routes simulées : rien n'est écrit. (En
 * modification d'un bien existant : `gestion/ModifierFicheBien.test.tsx`.)
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c); return ok({ logementId: 9 }); }
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
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
const famille = (f: string) => clic(container.querySelector(`[data-famille="${f}"]`)!);
const typesLocal = () => [...container.querySelectorAll('[aria-label="Type de local"] button')].map((b) => b.getAttribute('aria-pressed'));
const message = () => container.querySelector('[data-chemin-efface]')?.textContent ?? null;
const champ = (mot: string) => [...container.querySelectorAll('label.loc-champ')].find((l) => l.textContent?.startsWith(mot))?.querySelector('input') as HTMLInputElement;
const monter = async () => { await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); }); await calmer(); };

describe('🔴 Nouveau bien — le choix principal remet ses sous-choix à zéro', () => {
  it('Local → Local commercial → Logement → Local : « Local commercial » n’est plus coché ; le message le dit', async () => {
    await monter();
    await famille('local');
    await clic(container.querySelector('[aria-label="Type de local"] button')!);
    expect(typesLocal()).toEqual(['true', 'false']);
    expect(message()).toBeNull();
    await famille('logement');
    expect(message()).toBe('Les informations propres à « Local » ont été effacées.');
    await famille('local');
    expect(typesLocal()).toEqual(['false', 'false']);
    expect(message()).toBe('Les informations propres à « Local » ont été effacées.');
  });
  it('pièces et surfaces du chemin quitté vidées ; l’adresse (commune) reste ; rien de rempli : aucun message', async () => {
    await monter();
    await famille('logement');
    expect(message()).toBeNull();
    await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
    await saisir(champ('Surface habitable'), '41,8');
    await clic(container.querySelector('[aria-label="Type de logement"] button')!);
    await famille('parking');
    expect(message()).toBe('Les informations propres à « Logement » ont été effacées.');
    await famille('logement');
    expect(champ('Surface habitable').value).toBe('');
    expect([...container.querySelectorAll('[aria-label="Type de logement"] button')].some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(false);
    expect((container.querySelector('.cab-enveloppe input') as HTMLInputElement).value).toBe('3 rue du Port');
  });
  it('🔴 le serveur ne reçoit que les champs du chemin CHOISI', async () => {
    await monter();
    await famille('logement');
    await saisir(champ('Surface habitable'), '41,8');
    await famille('parking');
    await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
    await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
    await clic([...container.querySelectorAll('[data-question-gestion="bien"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'Location seule')!);
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    await calmer();
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    const creer = posts.find((p) => p.action === 'creer-bien');
    expect(creer).toBeDefined();
    const logement = creer!.logement as Record<string, unknown>;
    expect(logement).toMatchObject({ famille: 'parking', adresse: '3 rue du Port' });
    for (const k of ['typeLogement', 'typeLocal', 'meuble', 'nombrePieces', 'surfaceHabitableM2', 'surfaceCarrezM2', 'surfaceExterieureM2']) expect(logement, k).not.toHaveProperty(k);
    expect(logement).toHaveProperty('parkingType');
  });
});

describe('🔴 la fiche du bien, « Caractéristiques » : quitter « Autre » vide le nom de l’annexe', () => {
  it('Autre (« Cellier ») → Cave : le nom est vidé, le message le dit ; l’envoi ne le porte plus ; les champs communs restent', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      if (String(url).includes('lot=11')) {
        return ok({
          fiche: { id: 11, numero: '11', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
          bien: { id: 11, numero: '11', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null, categorie: 'autre', nomAnnexe: 'Cellier', etage: '-1',
            porte: '4', numLotCopro: '52', surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: 10, proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: true },
          parent: { id: 10, numero: '10', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', categorie: 'logement', parentId: null },
          rattachables: [], locations: [], location372: true, annexes: [],
        });
      }
      return ok(null);
    }) as unknown as typeof fetch;
    const { SectionLocationBien } = await import('../gestion/SectionsLocationFiche');
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 11, ouvrir: () => {} })); });
    await calmer();
    const bloc = [...container.querySelectorAll('section.loc-bloc')].find((s) => s.querySelector('h3')?.textContent === 'Caractéristiques') as HTMLElement;
    await act(async () => { ([...bloc.querySelectorAll('button')].find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click(); });
    const select = bloc.querySelector('[data-categorie-fiche]') as HTMLSelectElement;
    expect(select.value).toBe('autre');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'cave'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(bloc.querySelector('[data-chemin-efface]')?.textContent).toBe('Les informations propres à « Autre » ont été effacées.');
    await act(async () => { ([...bloc.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'modifier-bien', id: 11, champs: { categorie: 'cave', nomAnnexe: '', etage: '-1', porte: '4', numLotCopro: '52' } });
  });
});
