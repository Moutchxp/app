// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CommuneGeo } from '../../../../lib/sitadel/carteRepo';
import type { Bbox } from '../../../../lib/sitadel/carteProjection';
import type { BaseCommune } from './contactForm';
import { CarteRail } from './CarteRail';
import { CommutateurProcess, type CompteursProcess } from './CommutateurProcess';
import { EditeurContactCommune } from './EditeurContactCommune';

/**
 * Lot C — COMPORTEMENT des deux portes de la fiche contact commune, exercé sur un vrai rendu (jsdom + act, sans testing-library ;
 * `createElement`, pas de JSX — convention .test.ts du dépôt). On DÉCLENCHE des clics/touches et on observe les callbacks. Aucune
 * assertion de couleur, de classe CSS, de pixel, ni lecture de source.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const rendre = (el: ReactElement): void => { act(() => { root.render(el); }); };
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const clic = (el: Element): void => { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
/** Le `<g role="button">` d'une commune, repéré par le PRÉFIXE de son aria-label (= son nom). */
const communeCarte = (nom: string): Element => {
  const g = [...container.querySelectorAll('g[role="button"]')].find((n) => (n.getAttribute('aria-label') ?? '').startsWith(nom));
  if (!g) throw new Error(`commune « ${nom} » absente de la carte`);
  return g;
};

const RING: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const DONNEES: { communes: CommuneGeo[]; bbox: Bbox } = {
  communes: [
    { code: '75056', nom: 'Paris', dep: '75', canal: null, anneaux: [RING] },        // nonAffecte → sélectionnable
    { code: '92072', nom: 'Sèvres', dep: '92', canal: 'inconnu', anneaux: [RING] },   // hors process → non sélectionnable
  ],
  bbox: [0, 0, 10, 10],
};

describe('Lot C — PORTE 1 (carte) : le mode décide', () => {
  it('AU REPOS, un clic sur une commune ouvre SA fiche (bonne commune) et ne sélectionne rien', () => {
    const onOuvrir = vi.fn(); const onToggle = vi.fn();
    rendre(createElement(CarteRail, { rail: 'email', selection: new Set<string>(), onToggle, donnees: DONNEES, editable: false, onOuvrir }));
    clic(communeCarte('Paris'));
    expect(onOuvrir).toHaveBeenCalledWith('75056');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('AU REPOS, une commune HORS PROCESS est aussi ouvrable (ce sont justement celles à renseigner)', () => {
    const onOuvrir = vi.fn();
    rendre(createElement(CarteRail, { rail: 'email', selection: new Set<string>(), onToggle: vi.fn(), donnees: DONNEES, editable: false, onOuvrir }));
    clic(communeCarte('Sèvres'));
    expect(onOuvrir).toHaveBeenCalledWith('92072');
  });

  it('AU REPOS, Entrée sur une commune focalisée ouvre la fiche (parité clavier)', () => {
    const onOuvrir = vi.fn();
    rendre(createElement(CarteRail, { rail: 'email', selection: new Set<string>(), onToggle: vi.fn(), donnees: DONNEES, editable: false, onOuvrir }));
    act(() => { communeCarte('Paris').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onOuvrir).toHaveBeenCalledWith('75056');
  });

  it('EN ÉDITION, un clic SÉLECTIONNE (bascule) et n’ouvre RIEN', () => {
    const onOuvrir = vi.fn(); const onToggle = vi.fn();
    rendre(createElement(CarteRail, { rail: 'email', selection: new Set<string>(), onToggle, donnees: DONNEES, editable: true, onOuvrir }));
    clic(communeCarte('Paris'));
    expect(onToggle).toHaveBeenCalledWith('75056');
    expect(onOuvrir).not.toHaveBeenCalled();
  });
});

describe('Lot C — PORTE 2 (bloc « Hors process ») : une commune sans adresse ouvre sa fiche', () => {
  it('clic sur une commune de la liste → ouvre la fiche de la BONNE commune (code INSEE)', () => {
    const onOuvrirCommune = vi.fn();
    const compteurs: CompteursProcess = {
      email: { communes: 0, demandesEnCours: 0 }, formulaire: { communes: 0, demandesEnCours: 0 },
      hors: { communesSansAdresse: 1, courrierDemandes: 0, communes: [{ codeInsee: '93066', nom: 'Saint-Denis' }], courrier: [] },
    };
    rendre(createElement(CommutateurProcess, { actif: 'email', onChoisir: vi.fn(), compteurs, onOuvrirCommune }));
    // ouvrir le groupe « Hors process » (replié par défaut), puis cliquer la commune
    clic(boutons().find((b) => /Hors process/.test(b.textContent ?? ''))!);
    clic(boutons().find((b) => (b.getAttribute('aria-label') ?? '').includes('Saint-Denis'))!);
    expect(onOuvrirCommune).toHaveBeenCalledWith('93066');
  });
});

describe('Lot C — rafraîchissement : enregistrement le déclenche, fermeture sans enregistrement non', () => {
  const base: BaseCommune = { codeInsee: '75056', communeNom: 'Paris', destCanal: 'email', destEmail: 'urba@paris.fr', destUrlFormulaire: null, destAdressePostale: null };
  const brancherFetch = (): void => {
    const fake = vi.fn(async (_url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
      const corps = opts?.method === 'PATCH' ? { ok: true } : base; // GET (chargement) → BaseCommune ; PATCH (enregistrement) → ok
      return { ok: true, json: async () => corps } as unknown as Response;
    });
    global.fetch = fake as unknown as typeof fetch;
  };
  const monterEtCharger = async (onFerme: () => void, onEnregistre: () => void): Promise<void> => {
    await act(async () => { root.render(createElement(EditeurContactCommune, { codeInsee: '75056', onFerme, onEnregistre })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); }); // vider les microtâches du chargement GET
  };

  it('« Enregistrer » → onEnregistre (déclenche le rechargement) ET onFerme', async () => {
    brancherFetch();
    const onFerme = vi.fn(); const onEnregistre = vi.fn();
    await monterEtCharger(onFerme, onEnregistre);
    const enregistrer = boutons().find((b) => b.textContent === 'Enregistrer');
    expect(enregistrer).toBeTruthy();
    await act(async () => { enregistrer!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onEnregistre).toHaveBeenCalledTimes(1);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Annuler » (fermeture SANS enregistrement) → onFerme, PAS onEnregistre', async () => {
    brancherFetch();
    const onFerme = vi.fn(); const onEnregistre = vi.fn();
    await monterEtCharger(onFerme, onEnregistre);
    const annuler = boutons().find((b) => b.textContent === 'Annuler');
    expect(annuler).toBeTruthy();
    clic(annuler!);
    expect(onFerme).toHaveBeenCalledTimes(1);
    expect(onEnregistre).not.toHaveBeenCalled();
  });
});
