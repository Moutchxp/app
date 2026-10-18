// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil, CLE_TRI, CSS_PREAVIS_ACCUEIL } from './PreavisAccueil';
import { AccueilLocation } from './AccueilLocation';
import { EcranSortieLocataire } from './SortieLocataires';
import { SectionLocationLocataire } from '../gestion/SectionsLocationFiche';
import type { BailLogement } from '../../../../lib/location/sortieLocataires';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';

/**
 * ACCUEIL LOCATION — LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 18/10/2026). Les VRAIS composants, routes simulées : rien ne
 * part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const HIER = (() => { const d = new Date(Date.now() - 86_400_000); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); })();

const ligne = (cle: string, o: Partial<LignePreavisAccueil> = {}): LignePreavisAccueil => ({
  cle, lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', occupationId: 11, occupationIds: [11, 12],
  locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul' }],
  recuLe: '2026-10-01', dateMax: '2099-11-01', etatDesLieuxLe: null, ...o,
});
/** A : fin lointaine, EDL proche · B : échu, sans EDL · C : fin moyenne, EDL lointain. */
const LIGNES = [
  ligne('A', { dateMax: '2099-12-01', etatDesLieuxLe: '2099-01-10', adresse: 'A rue', occupationId: 21, occupationIds: [21, 22],
    locataires: [{ occupationId: 21, locataireId: 201, nom: 'BERNARD Alice' }, { occupationId: 22, locataireId: 202, nom: 'BERNARD Paul' }] }),
  ligne('B', { dateMax: '2020-01-01', recuLe: '2019-12-01', adresse: 'B rue', occupationId: 31, occupationIds: [31],
    locataires: [{ occupationId: 31, locataireId: 301, nom: 'ECHU Bob' }] }),
  ligne('C', { dateMax: '2099-11-01', etatDesLieuxLe: '2099-06-01', adresse: 'C rue' }),
];
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' },
  ],
  annexes: [], autresOccupants: [],
};

let container: HTMLDivElement;
let root: Root;
let lignes: LignePreavisAccueil[];
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { window.localStorage.removeItem(CLE_TRI); } catch { /* sans stockage */ }
  lignes = LIGNES.map((l) => ({ ...l }));
  posts = [];
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      // La sortie validée : le serveur ne rend plus la ligne (le locataire est sorti).
      if (corps.action === 'sortie-locataires') lignes = lignes.filter((l) => !l.occupationIds.includes(Number(corps.occupationId)));
      return ({ ok: true, json: async () => ({ etat: 'ok', data: {}, mail: { etat: 'sans_adresse' } }) }) as unknown as Response;
    }
    const s = String(u);
    if (s.includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, lignes });
    if (s.includes('bail=')) return ok(BAIL);
    return ok({ lignes: [], total: 0, page: 0 });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const attendre = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
async function rendre(gestion = true): Promise<void> {
  await act(async () => { root.render(createElement(BlocPreavisAccueil, { gestion })); });
  await attendre();
}
const ordre = (): string[] => [...container.querySelectorAll('[data-ligne-preavis]')].map((li) => li.getAttribute('data-ligne-preavis')!);
const clic = (sel: string): void => act(() => (container.querySelector(sel) as HTMLButtonElement).click());
function saisir(el: HTMLInputElement, v: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('placement : le même espace que barre de recherche → cases', () => {
  it('entre les cases et le bloc, le MÊME espace réservé (mêmes classes) qu’entre la barre de recherche et les cases', async () => {
    await act(async () => { root.render(createElement(AccueilLocation, { gestion: true })); });
    await attendre();
    const page = container.querySelector('.loc-page')!;
    const enfants = [...page.children];
    const iCases = enfants.findIndex((e) => e.matches('ul.loc-cases'));
    const avant = enfants[iCases - 1];
    const apres = enfants[iCases + 1];
    expect(avant.className).toBe('loc-zone-resultats loc-zone-resultats--vide');
    expect(apres.className).toBe(avant.className);
    expect(apres.hasAttribute('data-espace-preavis')).toBe(true);
    expect(enfants[iCases + 2].matches('[data-bloc-preavis]')).toBe(true);
  });
});

describe('les lignes', () => {
  it('hauteur CONSTANTE : une hauteur fixe (bureau et téléphone), deux lignes de texte tronquées, texte complet en infobulle', async () => {
    const regle = (sel: string, css: string): string => new RegExp(`${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const [bureau, mobile] = CSS_PREAVIS_ACCUEIL.split('@media');
    expect(regle('.pva-ligne', bureau)).toMatch(/(^|;)height:4\.75rem/);
    expect(regle('.pva-ligne', mobile)).toMatch(/(^|;)height:6\.25rem/);
    expect(CSS_PREAVIS_ACCUEIL).not.toMatch(/\.pva-ligne\{[^}]*min-height/);
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-noms,\.pva-detail\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
    await rendre();
    const a = container.querySelector('[data-ligne-preavis="A"]')!;
    expect(a.querySelector('.pva-noms')?.getAttribute('title')).toBe('BERNARD Alice, BERNARD Paul');
    expect(a.querySelector('.pva-detail')?.textContent).toBe('A rue · Fin de préavis le 01/12/2099 · État des lieux le 10/01/2099');
    expect(container.querySelector('[data-ligne-preavis="B"] .pva-detail')?.textContent).toBe('B rue · Fin de préavis le 01/01/2020');
    expect(a.querySelectorAll('.pva-textes > span')).toHaveLength(2);
    expect(container.querySelector('[data-nombre-preavis]')?.textContent).toBe('3');
  });

  it('mention orange AVEC LE MOT : « en préavis » ; date passée → « Préavis échu — sortie à saisir »', async () => {
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="A"] [data-preavis]')?.textContent).toBe('en préavis');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.getAttribute('data-preavis')).toBe('echu');
  });

  it('état vide : « Aucun locataire en préavis »', async () => {
    lignes = [];
    await rendre();
    expect(container.querySelector('[data-preavis-vide]')?.textContent).toBe('Aucun locataire en préavis');
  });
});

describe('les tris', () => {
  it('par défaut : fin de préavis la plus proche d’abord ; les 4 sens ; sans état des lieux toujours en dernier ; mémorisé localement', async () => {
    await rendre();
    expect(ordre()).toEqual(['B', 'C', 'A']);
    expect(container.querySelector('button[data-tri="fin:asc"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('button.pva-segment[aria-pressed="true"]')).toHaveLength(1);
    clic('button[data-tri="fin:desc"]');
    expect(ordre()).toEqual(['A', 'C', 'B']);
    clic('button[data-tri="edl:asc"]');
    expect(ordre()).toEqual(['A', 'C', 'B']);
    clic('button[data-tri="edl:desc"]');
    expect(ordre()).toEqual(['C', 'A', 'B']);
    expect(container.querySelectorAll('button.pva-segment[aria-pressed="true"]')).toHaveLength(1);
    expect(window.localStorage.getItem(CLE_TRI)).toBe('edl:desc');
    // Relu au retour sur l'accueil.
    act(() => root.unmount()); root = createRoot(container);
    await rendre();
    expect(ordre()).toEqual(['C', 'A', 'B']);
  });

  it('cibles tactiles ≥ 44 px', () => {
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-segment\{min-height:44px/);
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-ouvrir\{min-height:44px/);
  });
});

describe('la ligne dépliée', () => {
  it('« Ouvrir » / « Fermer » ; liens vers la fiche et l’écran de sortie', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('button[data-ouvrir-preavis="C"]')?.textContent).toBe('Fermer');
    const d = container.querySelector('[data-ligne-depliee="C"]')!;
    expect([...d.querySelectorAll('a[data-lien-fiche]')].map((a) => a.getAttribute('href'))).toEqual(['/admin/location/locataire/101', '/admin/location/locataire/102']);
    expect(d.querySelector('a[data-lien-ecran-sortie]')?.getAttribute('href')).toBe('/admin/location/locataire/101?sortie=11');
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('[data-ligne-depliee="C"]')).toBeNull();
  });

  it('état des lieux : bornes à l’écran, enregistrement, effacement — par la route de la Location', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    const champ = (): HTMLInputElement => container.querySelector('input[data-date-edl]') as HTMLInputElement;
    expect(champ().min).toBe('2026-10-01');
    expect(champ().max).toBe('2100-05-01');
    act(() => saisir(champ(), '2026-09-30'));
    expect(container.querySelector('[data-message-edl]')?.textContent).toContain('ne peut pas précéder la réception du recommandé');
    expect((container.querySelector('button[data-enregistrer-edl]') as HTMLButtonElement).disabled).toBe(true);
    act(() => saisir(champ(), '2100-05-02'));
    expect(container.querySelector('[data-message-edl]')?.textContent).toContain('plus de 6 mois');
    act(() => saisir(champ(), '2099-11-05'));
    expect(container.querySelector('[data-message-edl]')).toBeNull();
    await act(async () => { (container.querySelector('button[data-enregistrer-edl]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'etat-des-lieux', occupationIds: [11, 12], date: '2099-11-05' });
    await act(async () => { (container.querySelector('button[data-effacer-edl]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'etat-des-lieux', occupationIds: [11, 12], date: '' });
  });

  it('« Valider la sortie » : LA confirmation commune (action `sortie-locataires`), puis la ligne disparaît', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre();
    const conf = container.querySelector('[data-ligne-depliee="C"] [data-recapitulatif]')!;
    expect([...conf.querySelectorAll('[data-sortant]')].map((l) => l.getAttribute('data-sortant'))).toEqual(['11', '12']);
    act(() => saisir(conf.querySelector('input[data-date-sortie]') as HTMLInputElement, HIER));
    await act(async () => { (conf.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts.at(-1)).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11, 12], date: HIER });
    expect(ordre()).toEqual(['B', 'A']);
    expect(container.querySelector('[data-preavis-bilan]')?.textContent).toContain('Sortie enregistrée — BERNARD Alice, BERNARD Paul.');
  });

  it('sans le droit Gestion : « La sortie est validée par un utilisateur de la Gestion », aucun bouton de sortie', async () => {
    await rendre(false);
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('button[data-valider-sortie]')).toBeNull();
    expect(container.querySelector('[data-sortie-gestion-seule]')?.textContent).toBe('La sortie est validée par un utilisateur de la Gestion');
    // La date d'état des lieux, elle, reste saisissable.
    expect((container.querySelector('input[data-date-edl]') as HTMLInputElement).disabled).toBe(false);
  });

  it('le serveur vérifie lui-même le droit Gestion sur la sortie (la route de la Location)', () => {
    const route = readFileSync('app/(admin)/api/admin/location/route.ts', 'utf8');
    expect(route).toMatch(/case 'sortie-locataires'[\s\S]{0,400}exigerCompteActif\(request, 'gestion'\)/);
  });
});

describe('la date d’état des lieux est visible sur la fiche et sur l’écran de sortie', () => {
  const P = { id: 50, occupationId: 11, recuLe: '2026-10-01', dateMax: '2099-11-01', mode: 'mois', dureeMois: 1, motif: null, creePar: 'x',
    creeLe: '2026-10-01', dureeProposee: 1, etatDesLieuxLe: '2099-11-05' };

  it('fiche locataire (section « Location »)', async () => {
    global.fetch = vi.fn(async () => ok({
      fiche: { modifiable: true }, sortie: null,
      locations: [{ occupationId: 11, lotId: 7, adresse: '4 rue Fictive', commune: 'PUTEAUX', entree: '2022-09-01', sortie: null, location: null }],
      preavis: [{ occupationId: 11, preavis: P }],
    })) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await attendre();
    expect(container.querySelector('[data-preavis-fiche] [data-etat-des-lieux]')?.textContent).toBe('État des lieux le 05/11/2099');
  });

  it('écran de sortie', async () => {
    global.fetch = vi.fn(async (u: string | URL | Request) => (String(u).includes('preavisBail=') ? ok({
      disponible: true, meuble: false, zoneTendue: true, dureeProposee: 1, raison: 'x',
      locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01', preavis: P },
        { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01', preavis: null }],
    }) : String(u).includes('encartBail=') ? ({ ok: true, status: 200, json: async () => ({ etat: 'erreur', message: 'hors épreuve' }) }) as unknown as Response
      : ok(BAIL))) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await attendre();
    expect(container.querySelector('[data-carte-preavis="11"] [data-etat-des-lieux]')?.textContent).toBe('État des lieux le 05/11/2099');
  });
});
