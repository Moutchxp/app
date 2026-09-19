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
  it('rail E-MAIL : le déclencheur du moteur complet EST présent (fusion : panneau sur les deux rails)', async () => {
    await monter('email');
    expect(boutonPar(/Moteur de recherche complet/)).toBeDefined();
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

  it('rail e-mail : « Chercher » inactif champ vide + aucun critère (règles unifiées sur les deux rails)', async () => {
    await monter('email');
    expect(boutonPar(/Chercher/)!.disabled).toBe(true);
    expect(container.textContent).toMatch(/coche un type de permis/);
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

describe('§ — adresse affichée dans les lignes de résultat (les deux rails)', () => {
  const avecResultats = async (process: 'email' | 'formulaire', resultats: unknown[]): Promise<void> => {
    global.fetch = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return { ok: true, json: async () => ({ resultats, total: resultats.length, autreProcess: 0, tronque: false, bloquees: {} }) } as unknown as Response; }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(RechercheVivier, { process, categories: CATS, onBasculer: vi.fn() })); });
    await flush();
    await rechercher('paris');
  };
  const permis = (over: Record<string, unknown> = {}) => ({ dossierId: 1, numDau: 'PC0951', type: 'PC', codeInsee: '78646', communeNom: 'Versailles', canal: 'email', categorie: 'immeuble_neuf', dateAutorisation: '2024-01-01', adresse: '34 AVENUE DE PARIS', ...over });
  const ligne = (motif: string) => [...container.querySelectorAll('li')].find((x) => x.textContent?.includes(motif))!;

  it('une ligne dont le permis a une adresse l’affiche (sous la commune, distincte de la localité)', async () => {
    await avecResultats('email', [permis()]);
    const li = ligne('PC0951');
    expect(li.textContent).toContain('Versailles');          // commune (localité) conservée
    expect(li.textContent).toContain('34 AVENUE DE PARIS');   // adresse (voie) affichée
  });

  it('une ligne SANS adresse s’affiche sans séparateur orphelin (aucune voie, aucun « — »)', async () => {
    await avecResultats('email', [permis({ dossierId: 2, numDau: 'PCNOADR', adresse: null })]);
    const li = ligne('PCNOADR');
    expect(li.textContent).toContain('Versailles');
    expect(li.textContent).not.toMatch(/AVENUE|RUE|—/); // rien d'adresse, pas de séparateur en trop
  });

  it('les autres champs de la ligne restent inchangés (n° permis, commune, catégorie, état)', async () => {
    await avecResultats('email', [permis()]);
    const li = ligne('PC0951');
    expect(li.textContent).toContain('PC0951');        // n° permis
    expect(li.textContent).toContain('Versailles');    // commune
    expect(li.textContent).toContain('Immeuble neuf'); // libellé catégorie
    expect(li.textContent).toContain('demandable');    // état (non bloqué)
  });

  it('rail TÉLÉSERVICE : l’adresse s’affiche aussi (le motif vaut pour les deux rails)', async () => {
    await avecResultats('formulaire', [permis({ canal: 'formulaire', communeNom: 'Clichy', adresse: '64 RUE DE PARIS' })]);
    expect(ligne('PC0951').textContent).toContain('64 RUE DE PARIS');
  });
});

describe('§B — moteur fusionné : action par ligne selon le rail', () => {
  const permis = (over: Record<string, unknown> = {}) => ({ dossierId: 1, numDau: 'PC0951', type: 'PC', codeInsee: '78646', communeNom: 'Versailles', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-01-01', adresse: '34 AVENUE DE PARIS', ...over });
  const monterFusion = async (process: 'email' | 'formulaire', mode: 'auto' | 'manuel', resultats: unknown[], opts: { bloquees?: unknown; plafonds?: unknown; repCreation?: unknown } = {}): Promise<{ posts: unknown[]; onPrepared: ReturnType<typeof vi.fn> }> => {
    const posts: unknown[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/vivier-recherche')) { urls.push(u); return { ok: true, json: async () => ({ resultats, total: resultats.length, autreProcess: 0, tronque: false, bloquees: opts.bloquees ?? {}, plafonds: opts.plafonds ?? {} }) } as unknown as Response; }
      if (u.includes('/debloquer')) return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      if (u.includes('/api/admin/permis/demandes')) { posts.push(JSON.parse(String(init?.body ?? '{}'))); return { ok: true, json: async () => (opts.repCreation ?? { demandesCreees: 1, dossiersCrees: 1 }) } as unknown as Response; }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    const onPrepared = vi.fn();
    await act(async () => { root.render(createElement(RechercheVivier, { process, categories: CATS, onBasculer: vi.fn(), mode, onPrepared })); });
    await flush();
    await rechercher('paris');
    return { posts, onPrepared };
  };

  it('TÉLÉSERVICE demandable → « Afficher la carte dans le carrousel » ; clic → POST dossiersManuels + onPrepared', async () => {
    const { posts, onPrepared } = await monterFusion('formulaire', 'auto', [permis()]);
    const btn = boutonPar(/Afficher la carte dans le carrousel/);
    expect(btn).toBeDefined();
    await act(async () => { btn!.click(); });
    await flush();
    expect(posts).toEqual([{ dossiersManuels: [1] }]);          // MÊME chemin d'écriture existant
    expect(onPrepared).toHaveBeenCalled();                       // rafraîchit le carrousel + compteurs
    expect(container.textContent).toMatch(/carte ajoutée en 1re position/i);
  });

  it('E-MAIL mode MANUEL demandable → « Préparer cette demande » ; clic → POST dossiersManuels', async () => {
    const { posts } = await monterFusion('email', 'manuel', [permis({ canal: 'email' })]);
    const btn = boutonPar(/Préparer cette demande/);
    expect(btn).toBeDefined();
    await act(async () => { btn!.click(); });
    await flush();
    expect(posts).toEqual([{ dossiersManuels: [1] }]);
    expect(container.textContent).toMatch(/Demande préparée/i);
  });

  it('E-MAIL mode AUTO → AUCUN bouton d’action sur la ligne (consultation seule)', async () => {
    await monterFusion('email', 'auto', [permis({ canal: 'email' })]);
    expect(boutonPar(/Préparer cette demande/)).toBeUndefined();
    expect(boutonPar(/Afficher la carte/)).toBeUndefined();
    expect(container.textContent).toMatch(/demandable/); // la ligne s'affiche quand même
  });

  it('commune BLOQUÉE → aucun bouton d’action, « Débloquer » présent, raison visible (verrou jamais contourné)', async () => {
    await monterFusion('formulaire', 'auto', [permis()], { bloquees: { '78646': { reference: 'SVAV-DEM-2026-000009', demandeId: 9 } } });
    expect(boutonPar(/Afficher la carte dans le carrousel/)).toBeUndefined();
    expect(container.textContent).toMatch(/bloqué/i);
    expect(boutonPar(/Débloquer/)).toBeDefined();
  });

  it('plafond mensuel dépassé (téléservice) → averti mais bouton d’action ACTIF (ne bloque pas)', async () => {
    await monterFusion('formulaire', 'auto', [permis()], { plafonds: { '78646': { consomme: 5, plafond: 5, depasse: true } } });
    expect(container.textContent).toMatch(/au plafond mensuel/i);
    const btn = boutonPar(/Afficher la carte dans le carrousel/);
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(false);
  });

  it('déjà rattaché (ignoresConflit) → message clair, jamais un faux succès', async () => {
    const { onPrepared } = await monterFusion('formulaire', 'auto', [permis()], { repCreation: { demandesCreees: 0, ignoresConflit: 1 } });
    await act(async () => { boutonPar(/Afficher la carte dans le carrousel/)!.click(); });
    await flush();
    expect(container.textContent).toMatch(/déjà rattaché/i);
    expect(onPrepared).not.toHaveBeenCalled();
  });
});

describe('§1 — état de ligne dérivé + synchro carrousel (réinterrogation) ; §2 — deux lignes', () => {
  const permis = (over: Record<string, unknown> = {}) => ({ dossierId: 1, numDau: 'PC0951', type: 'PC', codeInsee: '78646', communeNom: 'Versailles', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-01-01', adresse: '34 AVENUE DE PARIS', ...over });
  const rep = (resultats: unknown[]) => ({ resultats, total: resultats.length, autreProcess: 0, tronque: false, bloquees: {}, plafonds: {} });
  const ligne = (motif: string) => [...container.querySelectorAll('li')].find((x) => x.textContent?.includes(motif))!;
  // monte avec un signalRafraichir contrôlé ; `boite.rep` sert la réponse vivier-recherche courante ; capture les POST.
  const monterSignal = async (signal: number, boite: { rep: unknown; posts: unknown[] }): Promise<void> => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/vivier-recherche')) { urls.push(u); return { ok: true, json: async () => boite.rep } as unknown as Response; }
      if (u.includes('/api/admin/permis/demandes')) { boite.posts.push(JSON.parse(String(init?.body ?? '{}'))); return { ok: true, json: async () => ({ demandesCreees: 1 }) } as unknown as Response; }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(RechercheVivier, { process: 'formulaire', categories: CATS, onBasculer: vi.fn(), mode: 'auto', onPrepared: vi.fn(), signalRafraichir: signal })); });
    await flush();
  };

  it('§1 — un changement de signalRafraichir RÉINTERROGE la recherche courante (MÊME URL), sans écriture', async () => {
    const boite = { rep: rep([permis()]), posts: [] as unknown[] };
    await monterSignal(0, boite);
    await rechercher('paris');
    const url1 = urls.filter((u) => u.includes('/vivier-recherche')).at(-1)!;
    const nAvant = urls.filter((u) => u.includes('/vivier-recherche')).length;
    // simule une annulation de carte dans le carrousel : le parent incrémente le signal → re-render
    await act(async () => { root.render(createElement(RechercheVivier, { process: 'formulaire', categories: CATS, onBasculer: vi.fn(), mode: 'auto', onPrepared: vi.fn(), signalRafraichir: 1 })); });
    await flush();
    const apres = urls.filter((u) => u.includes('/vivier-recherche'));
    expect(apres.length).toBeGreaterThan(nAvant);       // réinterrogé
    expect(apres.at(-1)).toBe(url1);                     // MÊME URL → terme/types/tri conservés
    expect(boite.posts.length).toBe(0);                 // aucune écriture (GET seul)
  });

  it('§1 — après annulation (signal), un permis réapparu redevient « demandable » avec son bouton', async () => {
    const boite = { rep: rep([]), posts: [] as unknown[] };
    await monterSignal(0, boite);
    await rechercher('paris');
    expect(boutonPar(/Afficher la carte dans le carrousel/)).toBeUndefined(); // aucun résultat → pas de bouton
    boite.rep = rep([permis()]); // la carte est annulée → le permis redevient demandable
    await act(async () => { root.render(createElement(RechercheVivier, { process: 'formulaire', categories: CATS, onBasculer: vi.fn(), mode: 'auto', onPrepared: vi.fn(), signalRafraichir: 1 })); });
    await flush();
    expect(boutonPar(/Afficher la carte dans le carrousel/)).toBeDefined(); // réapparu demandable + bouton
  });

  it('§1 — après préparation (Option A), la réinterrogation retire le permis des demandables ; la confirmation survit', async () => {
    const boite = { rep: rep([permis()]), posts: [] as unknown[] };
    await monterSignal(0, boite);
    await rechercher('paris');
    await act(async () => { boutonPar(/Afficher la carte dans le carrousel/)!.click(); });
    await flush();
    expect(boite.posts).toEqual([{ dossiersManuels: [1] }]);
    expect(container.textContent).toMatch(/carte ajoutée en 1re position/i);
    // le parent (onPrepared → signalSuivi++) déclenche la réinterrogation ; le permis préparé est désormais exclu du vivier
    boite.rep = rep([]);
    await act(async () => { root.render(createElement(RechercheVivier, { process: 'formulaire', categories: CATS, onBasculer: vi.fn(), mode: 'auto', onPrepared: vi.fn(), signalRafraichir: 1 })); });
    await flush();
    expect(boutonPar(/Afficher la carte dans le carrousel/)).toBeUndefined(); // le permis a quitté les demandables
    expect(container.textContent).toMatch(/carte ajoutée en 1re position/i);  // la confirmation SURVIT à la réinterrogation
  });

  it('§2 — un résultat s’affiche sur DEUX blocs : ① identité ; ② adresse + état + bouton', async () => {
    const boite = { rep: rep([permis()]), posts: [] as unknown[] };
    await monterSignal(0, boite);
    await rechercher('paris');
    const li = ligne('PC0951');
    expect(li.children.length).toBe(2);                              // exactement deux lignes visuelles
    expect(li.children[0].textContent).toContain('PC0951');          // ① identité : n° permis
    expect(li.children[0].textContent).toContain('Versailles');      // ① commune
    expect(li.children[1].textContent).toContain('34 AVENUE DE PARIS'); // ② adresse
    expect(li.children[1].textContent).toContain('demandable');      // ② état
    expect(li.children[1].querySelector('button')).not.toBeNull();   // ② bouton d'action sur la 2e ligne
  });
});
