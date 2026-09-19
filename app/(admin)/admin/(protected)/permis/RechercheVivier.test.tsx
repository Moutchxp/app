// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RechercheVivier } from './RechercheVivier';

/**
 * MOTEUR COMPLET (rail téléservice) — COMPORTEMENT du panneau d'options additif (jsdom + act, sans testing-library). `fetch` mocké,
 * URLs capturées. On vérifie : ABSENT sur le rail e-mail (rendu historique) ; FERMÉ au montage en téléservice ; à l'ouverture, une
 * case par catégorie CONNUE (référentiel des demandes) + le tri + la mention « rien coché = tout » ; rien coché / aucun tri → URL
 * SANS `types` ni `tri` (comportement de base) ; sélection → propagation exacte de `types` et `tri`. Aucune assertion de couleur/pixel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let urls: string[]; // toutes les URLs passées à fetch

const CATS = [
  { cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 },
  { cle: 'surelevation', libelle: 'Surélévation', rang: 2 },
];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return { ok: true, json: async () => ({ resultats: [], total: 0, autreProcess: 0, tronque: false, bloquees: {} }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const monter = async (process: 'email' | 'formulaire'): Promise<void> => {
  await act(async () => { root.render(createElement(RechercheVivier, { process, categories: CATS, onBasculer: vi.fn() })); });
  await flush();
};

const ouvrirMoteur = async (): Promise<void> => {
  await act(async () => { boutonPar(/Moteur de recherche complet/)!.click(); });
  await flush();
};

/** Saisit une requête dans le champ libre (jamais une case à cocher) et soumet le formulaire → déclenche la recherche. */
const rechercher = async (texte: string): Promise<void> => {
  const input = container.querySelector('input[aria-label^="Rechercher un permis"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, texte); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const form = container.querySelector('form') as HTMLFormElement;
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};

const dernierVivierUrl = (): URL => new URL(urls.filter((u) => u.includes('/vivier-recherche')).at(-1)!, 'http://test');
const choisirSelect = async (el: HTMLSelectElement, valeur: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(el, valeur); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
};

describe('MOTEUR COMPLET — RechercheVivier', () => {
  it('rail E-MAIL : AUCUN bouton « Moteur de recherche complet » (rendu historique), champ + « Chercher » présents', async () => {
    await monter('email');
    expect(boutonPar(/Moteur de recherche complet/)).toBeUndefined();
    expect(container.querySelector('input[aria-label^="Rechercher un permis"]')).not.toBeNull();
    expect(boutonPar(/Chercher/)).toBeDefined();
  });

  it('rail TÉLÉSERVICE : bouton présent, panneau FERMÉ au montage (aucune case, aucune mention)', async () => {
    await monter('formulaire');
    expect(boutonPar(/Moteur de recherche complet/)).toBeDefined();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Aucun coché = tous/);
  });

  it('à l’ouverture : une case par catégorie CONNUE + tri + mention « rien coché = tout »', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(CATS.length);
    expect(container.textContent).toMatch(/Immeuble neuf/);
    expect(container.textContent).toMatch(/Surélévation/);
    expect(container.textContent).toMatch(/Aucun coché = tous les types/);
    expect(container.textContent).toMatch(/Trier par/);
  });

  it('rien coché, aucun tri → l’URL ne porte NI `types` NI `tri` (comportement de base)', async () => {
    await monter('formulaire');
    await rechercher('paris');
    const u = dernierVivierUrl();
    expect(u.searchParams.get('q')).toBe('paris');
    expect(u.searchParams.get('process')).toBe('formulaire');
    expect(u.searchParams.has('types')).toBe(false);
    expect(u.searchParams.has('tri')).toBe(false);
  });

  it('cocher un type + choisir un tri → l’URL propage EXACTEMENT `types` et `tri`', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await act(async () => { cases[1].click(); }); // « Surélévation »
    await flush();
    const selCol = container.querySelectorAll('select')[0] as HTMLSelectElement;
    await choisirSelect(selCol, 'date');
    const selSens = container.querySelectorAll('select')[1] as HTMLSelectElement; // « Sens » apparaît après le choix de colonne
    await choisirSelect(selSens, 'desc');
    await rechercher('paris');
    const u = dernierVivierUrl();
    expect(u.searchParams.get('types')).toBe('surelevation');
    expect(u.searchParams.get('tri')).toBe('date:desc');
  });
});

describe('§1 — champ libre FACULTATIF quand un filtre est actif', () => {
  it('champ VIDE + un type coché → recherche exécutée (URL avec types, q vide)', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await act(async () => { cases[0].click(); }); // « Immeuble neuf »
    await flush();
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const u = dernierVivierUrl();
    expect(u.searchParams.get('q')).toBe('');                    // terme vide
    expect(u.searchParams.get('types')).toBe('immeuble_neuf');   // filtre porté
  });

  it('champ VIDE + aucun filtre → aucune recherche déclenchée ; « Chercher » inactif + indice non-mensonger', async () => {
    await monter('formulaire');
    expect(boutonPar(/Chercher/)!.disabled).toBe(true);
    expect(container.textContent).toMatch(/coche un type de permis/); // indice visible (pas hover-only)
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(urls.some((u) => u.includes('/vivier-recherche'))).toBe(false); // rien cherché
  });

  it('cocher puis DÉcocher le type → « Chercher » redevient inactif (pas de faux critère)', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await act(async () => { cases[0].click(); });
    await flush();
    expect(boutonPar(/Chercher/)!.disabled).toBe(false);
    await act(async () => { cases[0].click(); }); // décoche
    await flush();
    expect(boutonPar(/Chercher/)!.disabled).toBe(true);
  });

  it('rail e-mail : « Chercher » reste actif même champ vide (inchangé), aucun indice', async () => {
    await monter('email');
    expect(boutonPar(/Chercher/)!.disabled).toBe(false);
    expect(container.textContent).not.toMatch(/coche un type de permis/);
  });
});

describe('§2 — déclencheur discret sur la ligne du titre, panneau inchangé de place', () => {
  it('le déclencheur est HORS du formulaire, sur la ligne du titre', async () => {
    await monter('formulaire');
    const trigger = boutonPar(/Moteur de recherche complet/)!;
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.contains(trigger)).toBe(false);
    const titre = [...container.querySelectorAll('strong')].find((s) => /Rechercher un permis/.test(s.textContent ?? ''))!;
    expect(titre.parentElement!.contains(trigger)).toBe(true); // même conteneur que le titre
  });

  it('le panneau reste DANS le formulaire, entre le champ et « Chercher »', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    const form = container.querySelector('form') as HTMLFormElement;
    const panneau = container.querySelector('#moteur-recherche-complet') as HTMLElement;
    expect(form.contains(panneau)).toBe(true);
    const input = form.querySelector('input[aria-label^="Rechercher un permis"]') as HTMLElement;
    const submit = [...form.querySelectorAll('button')].find((b) => /Chercher/.test(b.textContent ?? '')) as HTMLElement;
    expect(input.compareDocumentPosition(panneau) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // input avant panneau
    expect(panneau.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // panneau avant submit
  });
});

describe('§ — le TRI SEUL est un critère + compteur honnête', () => {
  it('tri SEUL (champ vide, aucun type, une colonne choisie) → recherche exécutée (URL avec tri, sans types) ; bouton actif', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    const selCol = container.querySelectorAll('select')[0] as HTMLSelectElement;
    await choisirSelect(selCol, 'commune');
    expect(boutonPar(/Chercher/)!.disabled).toBe(false); // le tri seul est un critère → bouton actif
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const u = dernierVivierUrl();
    expect(u.searchParams.get('q')).toBe('');
    expect(u.searchParams.get('tri')).toBe('commune:asc'); // sens par défaut asc
    expect(u.searchParams.has('types')).toBe(false);
  });

  it('« Ordre par défaut » seul (aucun autre critère) → PAS de critère : bouton inactif + indice', async () => {
    await monter('formulaire');
    await ouvrirMoteur();
    expect(boutonPar(/Chercher/)!.disabled).toBe(true); // colonne restée sur « Ordre par défaut » (valeur '')
    expect(container.textContent).toMatch(/coche un type de permis/);
  });

  it('COMPTEUR — « X affichés sur N » quand le total dépasse le cap', async () => {
    const resultats = Array.from({ length: 50 }, (_, i) => ({ dossierId: i + 1, numDau: `PC${i}`, type: 'PC', codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-01-01', adresse: null }));
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ resultats, total: 213, autreProcess: 0, tronque: true, bloquees: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await monter('formulaire');
    await rechercher('paris');
    expect(container.textContent).toMatch(/50\s*affichés\s*sur\s*213/); // « 50 affichés sur 213 » (le cap ne ment pas sur le tout)
  });
});

describe('§ — bouton « Voir les N résultats dans le canal … » (renvoi vers l’autre rail affiché)', () => {
  const rechercherAvec = async (process: 'email' | 'formulaire', reponse: unknown, onBasculer = vi.fn()): Promise<ReturnType<typeof vi.fn>> => {
    global.fetch = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return { ok: true, json: async () => reponse } as unknown as Response; }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(RechercheVivier, { process, categories: CATS, onBasculer })); });
    await flush();
    await rechercher('paris');
    return onBasculer;
  };
  const rep = (autreProcess: number) => ({ resultats: [], total: 0, autreProcess, tronque: false, bloquees: {} });

  it('N > 1 depuis Téléservice → « Voir les 3 résultats dans le canal E-mail »', async () => {
    await rechercherAvec('formulaire', rep(3));
    expect(boutonPar(/Voir les 3 autres résultats dans le canal E-mail/)).toBeDefined();
  });

  it('N = 1 → singulier « Voir 1 résultat dans le canal E-mail » (jamais « les », jamais le pluriel)', async () => {
    await rechercherAvec('formulaire', rep(1));
    const btn = boutonPar(/Voir l’autre résultat dans le canal E-mail/);
    expect(btn).toBeDefined();
    expect(btn!.textContent).not.toMatch(/résultats/); // singulier
    expect(btn!.textContent).not.toMatch(/Voir les/);  // pas de « les »
  });

  it('depuis E-mail → pointe vers le canal Téléservice', async () => {
    await rechercherAvec('email', rep(2));
    expect(boutonPar(/Voir les 2 autres résultats dans le canal Téléservice/)).toBeDefined();
  });

  it('le clic appelle onBasculer avec le process OPPOSÉ et ne déclenche AUCUN appel réseau', async () => {
    const onBasculer = await rechercherAvec('formulaire', rep(2));
    const nAvant = urls.length;
    await act(async () => { boutonPar(/Voir les 2 autres résultats/)!.click(); });
    await flush();
    expect(onBasculer).toHaveBeenCalledWith('email'); // opposé de 'formulaire'
    expect(onBasculer).toHaveBeenCalledTimes(1);
    expect(urls.length).toBe(nAvant); // aucun fetch supplémentaire déclenché par le clic
  });

  it('N = 0 → aucun bouton (condition d’affichage inchangée)', async () => {
    await rechercherAvec('formulaire', { resultats: [{ dossierId: 1, numDau: 'PC1', type: 'PC', codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: null, adresse: null }], total: 1, autreProcess: 0, tronque: false, bloquees: {} });
    expect(boutonPar(/Voir .* dans le canal/)).toBeUndefined();
  });
});
