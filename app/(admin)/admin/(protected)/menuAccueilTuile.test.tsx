// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { ContenuTuile } from './ContenuTuile';
import { URL_ACCUEIL_GESTION } from '../../../lib/gestion/ecranUrl';

/**
 * 🔴🔴 Arno (22/10/2026) — « Chaque entrée du menu de gauche ramène TOUJOURS à la première page de sa tuile, même quand on
 * est déjà dans cette tuile (sous-page, onglet, fiche, paramètres d'URL, modale ouverte). » Constaté sur le Banc de test :
 * recliquer « Banc de test » ne faisait rien. Chaque entrée est éprouvée : depuis une sous-page, depuis l'accueil avec des
 * paramètres, depuis l'accueil nu avec un état ouvert (le contenu est remonté). Routeur de Next simulé, aucun réseau.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cheminCourant = '/admin';
let rechercheCourante = '';
const pousses: string[] = [];
let rendre: () => void = () => {};
vi.mock('next/navigation', () => ({
  usePathname: () => cheminCourant,
  useSearchParams: () => new URLSearchParams(rechercheCourante),
  useRouter: () => ({ push: (u: string) => { pousses.push(u); } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...reste }: { href: string; children: unknown; onClick?: (e: unknown) => void }) =>
    createElement('a', { href, onClick, ...reste }, children as never),
}));

const PERMS = { pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true, permis: true, gestion: true, location: true, transaction: true } as const;

/** Les 12 entrées demandées par Arno, et l'accueil de chacune. */
const ENTREES: [string, string][] = [
  ['Statistiques', '/admin/statistiques'], ['Internautes (BD)', '/admin/internautes'], ['Pilotage Moteur', '/admin/pilotage'],
  ['Années de construction', '/admin/cartes-annee'], ['Banc de test', '/admin/banc-test'], ['Curation', '/admin/curation'],
  ['Permis de construire', '/admin/permis'], ['Sources de données', '/admin/sources'], ['Gestion', URL_ACCUEIL_GESTION],
  ['Location', '/admin/location'], ['Audit', '/admin/audit'], ['Administratif', '/admin/comptes'],
];

/** Un écran factice avec un état ouvert (onglet, modale, saisie) : seul un remontage le referme. */
function EcranAvecEtat() {
  const [ouvert, setOuvert] = useState(false);
  return createElement('button', { type: 'button', id: 'etat', onClick: () => setOuvert(true) }, ouvert ? 'modale ouverte' : 'fermé');
}
function Coquille() {
  const [, forcer] = useState(0);
  useEffect(() => { rendre = () => forcer((n) => n + 1); }, []);
  return createElement('div', null,
    createElement(Sidebar, { role: 'administrateur', perms: PERMS as never }),
    createElement(ContenuTuile, null, createElement(EcranAvecEtat)));
}

let container: HTMLDivElement;
let root: Root;
let poses: string[];
beforeEach(() => {
  cheminCourant = '/admin'; rechercheCourante = ''; pousses.length = 0; poses = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.spyOn(window.history, 'pushState').mockImplementation(((_s: unknown, _t: string, url: string) => { poses.push(url); }) as never);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async () => { await act(async () => { root.render(createElement(Coquille)); }); };
const lien = (libelle: string) => [...container.querySelectorAll('nav a')].find((a) => a.textContent === libelle) as HTMLAnchorElement;
const etat = () => container.querySelector('#etat')?.textContent;
const ouvrirEtat = async () => { await act(async () => { (container.querySelector('#etat') as HTMLButtonElement).click(); }); expect(etat()).toBe('modale ouverte'); };
/** Clique et dit si la navigation ordinaire du lien (Link) a été laissée faire. */
const cliquer = async (a: HTMLAnchorElement): Promise<boolean> => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => { a.dispatchEvent(ev); });
  return !ev.defaultPrevented;
};

describe('🔴🔴 chaque entrée du menu ramène à l’accueil de sa tuile', () => {
  it('les 12 entrées sont là, chacune vers l’accueil de sa tuile', async () => {
    await monter();
    for (const [libelle, accueil] of ENTREES) expect(lien(libelle)?.getAttribute('href'), libelle).toBe(accueil);
  });

  for (const [libelle, accueil] of ENTREES) {
    const slug = accueil.split('?')[0];
    it(`« ${libelle} » depuis une sous-page de la tuile : navigation vers l’accueil, entrée en surbrillance`, async () => {
      cheminCourant = `${slug}/sous-page/3`; rechercheCourante = 'onglet=b';
      await monter();
      expect(lien(libelle).getAttribute('aria-current')).toBe('page');
      expect(await cliquer(lien(libelle))).toBe(true);   // Link mène à `href` = l'accueil, paramètres et sous-chemin remis à zéro
      expect(poses).toEqual([]); expect(pousses).toEqual([]);
    });

    it(`« ${libelle} » depuis l’accueil, état ouvert : remis à zéro`, async () => {
      cheminCourant = slug; rechercheCourante = accueil.includes('?') ? accueil.split('?')[1] : '';
      await monter();
      await ouvrirEtat();
      expect(await cliquer(lien(libelle))).toBe(false);
      expect(poses).toEqual([accueil]);
      // Gestion : remise à zéro EN PLACE par son `popstate` (lot ACCUEIL-GESTION) ; les autres : le contenu est remonté.
      expect(etat()).toBe(libelle === 'Gestion' ? 'modale ouverte' : 'fermé');
    });
  }

  for (const [libelle, accueil] of ENTREES.filter(([l]) => l !== 'Gestion')) {
    it(`« ${libelle} » depuis l’accueil AVEC paramètres d’URL : router.push vers l’accueil, remontage À L’ARRIVÉE`, async () => {
      cheminCourant = accueil; rechercheCourante = 'q=07512024V0037&onglet=archives';
      Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '?q=07512024V0037&onglet=archives', pathname: accueil } });
      try {
        await monter();
        await ouvrirEtat();
        expect(await cliquer(lien(libelle))).toBe(false);
        expect(pousses).toEqual([accueil]);
        expect(etat()).toBe('modale ouverte');   // pas encore arrivé : on ne remonte pas avec les anciens paramètres
        rechercheCourante = '';
        await act(async () => { rendre(); });
        expect(etat()).toBe('fermé');
      } finally { Object.defineProperty(window, 'location', { configurable: true, value: new URL('http://localhost:3000/') }); }
    });
  }

  it('depuis une AUTRE tuile : navigation ordinaire, rien de remonté', async () => {
    cheminCourant = '/admin/curation';
    await monter();
    await ouvrirEtat();
    expect(await cliquer(lien('Banc de test'))).toBe(true);
    expect(poses).toEqual([]); expect(pousses).toEqual([]);
    expect(etat()).toBe('modale ouverte');
  });

  it('chaque entrée porte la marque qui déclenche l’avertissement « Modifications non enregistrées »', async () => {
    await monter();
    for (const [libelle] of ENTREES) expect(lien(libelle).hasAttribute('data-accueil-tuile'), libelle).toBe(true);
  });
});
