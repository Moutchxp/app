// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { URL_ACCUEIL_GESTION } from '../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 1 — LA TUILE « GESTION » RAMÈNE À LA PREMIÈRE PAGE ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « Un clic sur “Gestion” ouvre TOUJOURS la première page du module : l'ÉCRAN
 * PARTAGÉ […], quelle que soit la page du module où l'on se trouve. Aujourd'hui il garde l'écran courant (ex.
 * ?ecran=annuaire). Les autres chemins (Retour, liens internes, adresses directes) ne changent pas. »
 *
 * 🔴 CE QUE TIENNENT CES ÉPREUVES, ET QUE LA RELECTURE NE TIENT PAS :
 *   ① la tuile VISE l'écran partagé (`?ecran=partage`), et non la racine du module ;
 *   ② depuis l'INTÉRIEUR du module, le clic repose l'adresse d'accueil ET émet le `popstate` que le module écoute
 *      — sans quoi rien ne bouge, parce que Next croit déjà être à cette adresse ;
 *   ③ depuis un AUTRE module, c'est une navigation ordinaire : on ne touche à rien ;
 *   ④ les autres tuiles sont INCHANGÉES — même `href`, et le reclic repose leur propre adresse.
 *
 * 🔒 Aucun réseau, aucune base : le routeur de Next est simulé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cheminCourant = '/admin/gestion';
vi.mock('next/navigation', () => ({ usePathname: () => cheminCourant }));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...reste }: {
    href: string; children: unknown; onClick?: (e: unknown) => void;
  }) => createElement('a', { href, onClick, ...reste }, children as never),
}));

/** Un administrateur voit tout : `liensVisibles` n'a même pas besoin de lire les permissions. */
const PERMS = {
  pilotage: true, cartes_annee: true, statistiques: true, internautes: true,
  curation: true, banc_test: true, permis: true, gestion: true,
} as const;

let container: HTMLDivElement;
let root: Root;
let poses: { url: string }[];
let popstates: number;
const compter = (): void => { popstates += 1; };

beforeEach(() => {
  cheminCourant = '/admin/gestion';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  poses = [];
  popstates = 0;
  vi.spyOn(window.history, 'pushState').mockImplementation(((_s: unknown, _t: string, url: string) => {
    poses.push({ url });
  }) as never);
  /* ⚠️ L'ÉCOUTEUR EST RETIRÉ À CHAQUE FIN D'ÉPREUVE : sans cela ils s'empilent, et un seul `popstate` incrémente
     le compteur autant de fois qu'il y a eu d'épreuves avant — mesuré : 3 au lieu de 1. */
  window.addEventListener('popstate', compter);
});
afterEach(() => {
  window.removeEventListener('popstate', compter);
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

const monter = async () => {
  await act(async () => {
    root.render(createElement(Sidebar, { role: 'administrateur', perms: PERMS as never }));
  });
};
const lien = (libelle: string) =>
  [...container.querySelectorAll('a')].find((a) => a.textContent === libelle) as HTMLAnchorElement | undefined;

describe('① la tuile vise la PREMIÈRE PAGE du module', () => {
  it('🔴 « Gestion » pointe sur l’écran partagé, pas sur la racine', async () => {
    await monter();
    expect(lien('Gestion')?.getAttribute('href')).toBe(URL_ACCUEIL_GESTION);
    expect(URL_ACCUEIL_GESTION).toBe('/admin/gestion?ecran=partage');
  });

  it('⚠️ les autres tuiles sont INCHANGÉES : leur adresse reste leur racine', async () => {
    await monter();
    expect(lien('Curation')?.getAttribute('href')).toBe('/admin/curation');
    expect(lien('Permis de construire')?.getAttribute('href')).toBe('/admin/permis');
    expect(lien('Administratif')?.getAttribute('href')).toBe('/admin/comptes');
  });
});

describe('② depuis l’INTÉRIEUR du module, le clic repose l’adresse et réveille l’écran', () => {
  it('🔴🔴 sur ?ecran=annuaire, cliquer « Gestion » repose l’accueil ET émet un popstate', async () => {
    cheminCourant = '/admin/gestion';
    await monter();
    const a = lien('Gestion') as HTMLAnchorElement;
    await act(async () => { a.click(); });
    /**
     * 🔴 LES DEUX SONT NÉCESSAIRES, ET C'EST TOUT LE DÉFAUT. Poser l'adresse sans émettre l'événement laisserait
     * le module afficher l'écran d'avant : il ne relit l'adresse qu'au montage et sur « Précédent ». Émettre
     * l'événement sans poser l'adresse ferait relire… l'ancienne adresse.
     */
    expect(poses.map((p) => p.url)).toEqual([URL_ACCUEIL_GESTION]);
    expect(popstates).toBe(1);
  });

  it('⚠️ la même mécanique vaut pour les autres modules, vers LEUR racine', async () => {
    cheminCourant = '/admin/curation';
    await monter();
    await act(async () => { (lien('Curation') as HTMLAnchorElement).click(); });
    expect(poses.map((p) => p.url)).toEqual(['/admin/curation']);
    expect(popstates).toBe(1);
  });
});

describe('③ depuis un AUTRE module, la navigation reste ordinaire', () => {
  it('🔴 aucun pushState, aucun popstate : c’est `Link` qui travaille', async () => {
    cheminCourant = '/admin/curation';
    await monter();
    await act(async () => { (lien('Gestion') as HTMLAnchorElement).click(); });
    expect(poses).toEqual([]);
    expect(popstates).toBe(0);
  });

  it('⚠️ et depuis le tableau de bord non plus', async () => {
    cheminCourant = '/admin';
    await monter();
    await act(async () => { (lien('Gestion') as HTMLAnchorElement).click(); });
    expect(poses).toEqual([]);
    expect(popstates).toBe(0);
  });
});

describe('④ l’adresse NUE du module n’est pas touchée', () => {
  /**
   * 🔴🔴 C'EST LA MOITIÉ DE LA DEMANDE QU'ON OUBLIE LE PLUS FACILEMENT : « les adresses directes ne changent
   * pas ». `/admin/gestion` tapé à la main ouvre TOUJOURS la boîte sur « Réception » — décision d'Arno du
   * 27/09/2026. Changer `ETAT_DEFAUT` pour satisfaire la tuile aurait annulé cette décision-là sans le dire.
   */
  it('`ETAT_DEFAUT` reste « la boîte, sur Réception »', async () => {
    const { ETAT_DEFAUT, lireEtatUrl } = await import('../../../lib/gestion/ecranUrl');
    expect(ETAT_DEFAUT.ecran).toBe('boite');
    expect(lireEtatUrl('').ecran).toBe('boite');
    expect(lireEtatUrl('?ecran=partage').ecran).toBe('partage');
  });
});
