// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RechercheVivierManuel } from './RechercheVivierManuel';
import type { PermisVivier } from '../../../../lib/sitadel/rechercheVivier';

/**
 * MODE MANUEL — COMPORTEMENT du panneau de préparation manuelle (jsdom + act, sans testing-library). `fetch` mocké, routé par
 * URL. Aucune assertion de couleur/classe/pixel, aucune lecture de source. Couvre : un permis choisi part vers le chemin de
 * création EXISTANT (POST …/demandes avec `dossiersManuels`) ; une commune bloquée est signalée AVANT la tentative (aucun
 * « Préparer ») ; un plafond dépassé avertit SANS bloquer (bouton « Préparer » actif et fonctionnel).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let postDemandes: unknown[]; // corps JSON des POST vers /api/admin/permis/demandes (création)

const CATS = [{ cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 }];
const permis = (over: Partial<PermisVivier> = {}): PermisVivier => ({
  dossierId: 4242, numDau: 'PC07511524V0006', type: 'PC', codeInsee: '75111', communeNom: 'Paris 11e',
  canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2025-02-01', ...over,
});

// Réponses servies par le fetch mocké (mutables entre les étapes d'un test).
let repVivier: unknown = { resultats: [], total: 0, autreProcess: 0, tronque: false, bloquees: {}, plafonds: {} };
let repCreation: unknown = { demandesCreees: 1, dossiersCrees: 1, lotsSelectionnes: 1, ignoresConflit: 0, lotsInvalides: [], crees: ['SVAV-DEM-2026-000001'], profil: 'entreprise' };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  postDemandes = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/vivier-recherche')) return { ok: true, json: async () => repVivier } as unknown as Response;
    if (u.includes('/debloquer')) return { ok: true, json: async () => ({ ok: true, leve: true }) } as unknown as Response;
    if (u.includes('/api/admin/permis/demandes')) { // création (POST) — après vivier-recherche/debloquer déjà filtrés
      postDemandes.push(JSON.parse(String(init?.body ?? '{}')));
      return { ok: true, json: async () => repCreation } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const monter = async (onPrepared = vi.fn()): Promise<ReturnType<typeof vi.fn>> => {
  await act(async () => { root.render(createElement(RechercheVivierManuel, { categories: CATS, onPrepared })); });
  await flush();
  return onPrepared;
};

/** Saisit une requête dans le champ contrôlé et soumet le formulaire → déclenche la recherche du vivier. */
const rechercher = async (texte: string): Promise<void> => {
  const input = container.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, texte); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const form = container.querySelector('form') as HTMLFormElement;
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};

describe('MODE MANUEL — panneau de préparation', () => {
  it('un permis choisi PART vers le chemin de création existant (POST …/demandes avec dossiersManuels)', async () => {
    repVivier = { resultats: [permis()], total: 1, autreProcess: 0, tronque: false, bloquees: {}, plafonds: {} };
    const onPrepared = await monter();
    await rechercher('PC0751');
    expect(boutonPar(/Préparer cette demande/)).toBeDefined();

    await act(async () => { boutonPar(/Préparer cette demande/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    // Le POST de CRÉATION a bien été émis avec le dossier choisi (aucun nouvel endpoint : la route existante).
    expect(postDemandes).toEqual([{ dossiersManuels: [4242] }]);
    expect(onPrepared).toHaveBeenCalled();                 // la carte rejoint le carrousel (rafraîchissement des vues sœurs)
    expect(container.textContent).toMatch(/Demande préparée/i);
  });

  it('commune BLOQUÉE (verrou) → signalée AVANT la tentative, AUCUN bouton « Préparer » (mais un déblocage possible)', async () => {
    repVivier = {
      resultats: [permis()], total: 1, autreProcess: 0, tronque: false,
      bloquees: { '75111': { reference: 'SVAV-DEM-2026-000009', demandeId: 9 } }, plafonds: {},
    };
    await monter();
    await rechercher('Paris');

    expect(container.textContent).toMatch(/Commune bloquée/i);
    expect(container.textContent).toContain('SVAV-DEM-2026-000009'); // la demande qui bloque est nommée
    expect(boutonPar(/Préparer cette demande/)).toBeUndefined();     // rien à préparer tant que la commune est bloquée
    expect(boutonPar(/Débloquer/)).toBeDefined();                    // le geste qui lève le blocage est proposé
    expect(postDemandes).toHaveLength(0);                            // aucune tentative de création
  });

  it('plafond mensuel DÉPASSÉ → avertit SANS bloquer (le bouton « Préparer » reste actif et fonctionne)', async () => {
    repVivier = {
      resultats: [permis()], total: 1, autreProcess: 0, tronque: false, bloquees: {},
      plafonds: { '75111': { consomme: 5, plafond: 5, depasse: true } },
    };
    await monter();
    await rechercher('Paris');

    expect(container.textContent).toMatch(/au plafond mensuel/i);       // avertissement affiché
    const prep = boutonPar(/Préparer cette demande/);
    expect(prep).toBeDefined();
    expect(prep!.disabled).toBe(false);                                 // le plafond NE BLOQUE PAS

    await act(async () => { prep!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(postDemandes).toEqual([{ dossiersManuels: [4242] }]);        // la préparation passe malgré le plafond
  });

  it('permis déjà rattaché entre-temps (ignoresConflit) → message clair, jamais un faux succès', async () => {
    repVivier = { resultats: [permis()], total: 1, autreProcess: 0, tronque: false, bloquees: {}, plafonds: {} };
    repCreation = { demandesCreees: 0, dossiersCrees: 0, lotsSelectionnes: 1, ignoresConflit: 1, lotsInvalides: [], crees: [], profil: 'entreprise' };
    const onPrepared = await monter();
    await rechercher('Paris');
    await act(async () => { boutonPar(/Préparer cette demande/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(container.textContent).toMatch(/déjà rattaché/i);
    expect(onPrepared).not.toHaveBeenCalled();
    // remet le stub de création pour les tests suivants (ordre indépendant)
    repCreation = { demandesCreees: 1, dossiersCrees: 1, lotsSelectionnes: 1, ignoresConflit: 0, lotsInvalides: [], crees: ['SVAV-DEM-2026-000002'], profil: 'entreprise' };
  });

  it('session expirée (403) à la recherche → invite à se reconnecter, jamais « données indisponibles »', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ erreur: 'INTERDIT' }) } as unknown as Response)) as unknown as typeof fetch;
    await monter();
    await rechercher('Paris');
    expect(container.textContent).toMatch(/reconnecte-toi/i);
    expect(container.textContent).not.toMatch(/indisponible/i);
  });
});
