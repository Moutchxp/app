// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { EcranAjouterLocatairesAVenir, EcranSortieLocataire, EcranSortieRecherche, FormulaireBail, libelleFaireSortir } from './SortieLocataires';
import { EcranLocataires } from './EcransLocation';
import type { BailLogement } from '../../../../lib/location/sortieLocataires';

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — les VRAIS composants, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data, ...extra }) }) as unknown as Response;
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' },
  ],
  annexes: [{ lotId: 8, libelle: 'Cave n° 7', occupations: [{ occupationId: 21, locataireId: 101 }] }], autresOccupants: [],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

const saisir = (el: HTMLInputElement, valeur: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('la page « Ajouter ou supprimer un locataire » : deux grosses cartes, rien en dessous', () => {
  it('les deux cartes au format de « Supprimer un propriétaire » ; « Ajouter » mène au formulaire existant ; aucune lecture', () => {
    global.fetch = vi.fn(async () => ok({ lignes: [], total: 0, page: 0 }));
    act(() => root.render(createElement(EcranLocataires)));
    const cartes = [...container.querySelectorAll('.loc-gros-boutons--3d a.loc-gros-bouton')];
    expect(cartes.map((a) => [a.getAttribute('href'), a.firstChild?.textContent, a.classList.contains('loc-gros-bouton--plein'), a.querySelector('small')?.textContent])).toEqual([
      ['/admin/location/locataires/supprimer', 'Supprimer un/des locataire(s)', true, 'Faire sortir un ou plusieurs locataires d’un logement : sortie partielle ou totale, datée ; rien n’est effacé.'],
      ['/admin/location/nouveau-locataire', 'Ajouter un/des locataire(s)', false, 'Faire entrer un ou plusieurs locataires dans un logement.'],
    ]);
    expect(container.querySelector('.svv-page-sub')?.textContent).toBe('Supprimer = sortir du logement : rien n’est effacé, tout reste consultable.');
    expect(container.querySelector('.loc-retour a')?.getAttribute('href')).toBe('/admin/location');
    // Ni liste, ni bouton « + Nouveau locataire », ni lien vers la page « à venir » (gardée dans le code).
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('+ Nouveau locataire');
    expect(container.querySelector('a[href="/admin/location/locataires/ajouter"]')).toBeNull();
  });

  it('la page « à venir » reste dans le code : sans formulaire d’entrée', () => {
    act(() => root.render(createElement(EcranAjouterLocatairesAVenir)));
    expect(container.textContent).toContain('À venir');
    expect(container.querySelector('form, input')).toBeNull();
  });
});

describe('la recherche des occupants', () => {
  it('en temps réel (200 ms), la requête précédente annulée, chaque résultat VERT avec le MOT « occupant »', async () => {
    vi.useFakeTimers();
    const signaux: AbortSignal[] = [];
    global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) signaux.push(init.signal);
      return ok([{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephone: null, email: null, lotId: 7,
        adresse: '4 rue Fictive, 92800 Puteaux', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean' }]);
    });
    act(() => root.render(createElement(EcranSortieRecherche)));
    const champ = container.querySelector('input[data-recherche-occupants]') as HTMLInputElement;
    act(() => saisir(champ, 'be'));
    act(() => saisir(champ, 'ber'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('occupants=ber');
    const ligne = container.querySelector('a.sor-ligne') as HTMLAnchorElement;
    expect(ligne.getAttribute('href')).toBe('/admin/location/locataire/101?sortie=11');
    expect(ligne.querySelector('.sor-occupant')?.textContent).toBe('occupant');
    expect(ligne.textContent).toContain('4 rue Fictive');
    expect(ligne.textContent).toContain('3e étage');
    expect(ligne.textContent).toContain('Propriétaire : DUPONT Jean');
    // Une nouvelle frappe annule la requête en cours.
    act(() => saisir(champ, 'bern'));
    expect(signaux[0].aborted).toBe(true);
  });

  it('les couleurs passent par les jetons du thème — aucune couleur en dur', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
    expect(src).toContain('var(--color-svv-green-soft)');
  });
});

describe('le bloc « Sortie du logement »', () => {
  it('toutes les cases cochées par défaut ; date vide ; la phrase suit les cases', () => {
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres: () => {} })));
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([true, true]);
    expect((container.querySelector('input[data-date-sortie]') as HTMLInputElement).value).toBe('');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement deviendra VACANT');
    act(() => cases[1].click());
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement reste loué à : BERNARD Paul');
    expect(container.querySelector('[data-annexes-suivent]')?.textContent).toContain('Cave n° 7');
  });

  it('« Valider la sortie » sans date : refus à l’écran, rien n’est envoyé', () => {
    global.fetch = vi.fn();
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres: () => {} })));
    act(() => (container.querySelector('button[data-valider]') as HTMLButtonElement).click());
    expect(container.querySelector('[data-refus]')?.textContent).toBe('La date de sortie est obligatoire.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('avec une date : récapitulatif, puis confirmation ; un échec du mail est DIT, la sortie reste enregistrée', async () => {
    const apres = vi.fn();
    global.fetch = vi.fn(async () => ok({ date: '2026-10-31', vacant: false, restants: ['BERNARD Paul'] },
      { mail: { envoye: false, ignore: false, motif: 'Gmail injoignable' } }));
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres })));
    act(() => (container.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click());
    act(() => saisir(container.querySelector('input[data-date-sortie]') as HTMLInputElement, '2026-10-31'));
    act(() => (container.querySelector('button[data-valider]') as HTMLButtonElement).click());
    const recap = container.querySelector('[data-recapitulatif]')!;
    expect(recap.textContent).toContain('BERNARD Alice');
    expect(recap.textContent).toContain('31/10/2026');
    expect(recap.textContent).toContain('4 rue Fictive');
    expect(recap.textContent).toContain('DUPONT Jean');
    expect(recap.textContent).toContain('01/09/2022');
    expect(recap.textContent).toContain('Le logement reste loué à : BERNARD Paul');
    await act(async () => { (container.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    const corps = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(corps).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-31' });
    expect(apres).toHaveBeenCalledWith('Le logement reste loué à : BERNARD Paul', 'Enregistré, mais mail de confirmation non envoyé : Gmail injoignable.');
  });
});

describe('l’écran de sortie ALIGNÉ sur « Supprimer un des biens » (?sortie=…)', () => {
  const rendre = async (reponse: (u: string, init?: RequestInit) => Response): Promise<ReturnType<typeof vi.fn>> => {
    const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => reponse(String(u), init));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11 })); });
    await act(async () => { await Promise.resolve(); });
    return f;
  };
  const gros = (): HTMLButtonElement => container.querySelector('button[data-faire-sortir]') as HTMLButtonElement;
  const cartes = (): HTMLButtonElement[] => [...container.querySelectorAll('button[data-choisir]')] as HTMLButtonElement[];

  it('accord du libellé', () => {
    expect(libelleFaireSortir(0)).toBe('Faire sortir 0 locataire');
    expect(libelleFaireSortir(1)).toBe('Faire sortir 1 locataire');
    expect(libelleFaireSortir(2)).toBe('Faire sortir 2 locataires');
  });

  it('retour, titre à pastille, contexte, cartes TOUTES sélectionnées ; ni bloc « Fiche commune », ni fiche', async () => {
    const f = await rendre(() => ok(BAIL));
    expect(container.querySelector('.loc-retour a')?.getAttribute('href')).toBe('/admin/location/locataires');
    expect(container.querySelector('.loc-retour a')?.textContent).toBe('← Ajouter ou supprimer un locataire');
    expect(container.querySelector('.arc-biens-titre')?.textContent).toBe('Locataires de ce logement 2');
    const ctx = container.querySelector('[data-contexte]')?.textContent ?? '';
    for (const x of ['4 rue Fictive', 'Appartement · 3e étage · porte G', 'Cave n° 7', 'DUPONT Jean']) expect(ctx).toContain(x);
    expect(cartes().map((b) => [b.getAttribute('aria-pressed'), b.textContent])).toEqual([['true', '✓ Faire sortir'], ['true', '✓ Faire sortir']]);
    expect(container.querySelectorAll('mark.arc-surligne--en-place')).toHaveLength(2);
    expect(container.textContent).toContain('Entré(e) dans les lieux le 01/09/2022');
    expect(container.querySelector('a[data-voir-fiche]')?.getAttribute('href')).toBe('/admin/location/locataire/101');
    expect(gros().textContent).toBe('Faire sortir 2 locataires');
    expect(gros().className).toBe('arc-gros arc-gros--archiver');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement deviendra VACANT');
    expect(container.textContent).not.toContain('Fiche commune avec la Gestion');
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual(['/api/admin/location?bail=11&v=0']);
  });

  it('la bascule suit le compteur et la phrase ; à 0, le gros bouton est inactif', async () => {
    await rendre(() => ok(BAIL));
    act(() => cartes()[1].click());
    expect(cartes()[1].textContent).toBe('Reste dans le logement');
    expect(gros().textContent).toBe('Faire sortir 1 locataire');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement reste loué à : BERNARD Paul');
    act(() => cartes()[0].click());
    expect(gros().textContent).toBe('Faire sortir 0 locataire');
    expect(gros().disabled).toBe(true);
  });

  it('la confirmation exige la date : vide par défaut, refus sans date et avant l’entrée, puis envoi', async () => {
    const f = await rendre((u) => (u.includes('bail=') ? ok(BAIL)
      : ok({ date: '2026-10-31', vacant: false, restants: ['BERNARD Paul'] }, { mail: { envoye: true, ignore: false, motif: null } })));
    act(() => cartes()[1].click());
    act(() => gros().click());
    const recap = container.querySelector('[data-recapitulatif]')!;
    expect(recap.textContent).toContain('BERNARD Alice');
    expect(recap.textContent).toContain('Le logement reste loué à : BERNARD Paul');
    const date = container.querySelector('input[data-date-sortie]') as HTMLInputElement;
    expect(date.value).toBe('');
    await act(async () => { (container.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-refus]')?.textContent).toBe('La date de sortie est obligatoire.');
    act(() => saisir(date, '2020-01-01'));
    await act(async () => { (container.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-refus]')?.textContent).toContain('antérieure à la date d’entrée');
    expect(f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
    act(() => saisir(container.querySelector('input[data-date-sortie]') as HTMLInputElement, '2026-10-31'));
    await act(async () => { (container.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-31' });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[data-sortie-faite]')?.textContent).toContain('Le logement reste loué à : BERNARD Paul');
  });

  it('la recherche, au gabarit de l’écran des biens : résultats VERTS avec le mot « occupant »', async () => {
    vi.useFakeTimers();
    await rendre((u) => (u.includes('occupants=') ? ok([{ occupationId: 31, locataireId: 301, nom: 'MARTIN Léa', telephone: null, email: null,
      lotId: 9, adresse: '9 rue Autre', etage: null, porte: null, proprietaire: 'DURAND Paul' }]) : ok(BAIL)));
    act(() => saisir(container.querySelector('input[data-recherche-occupants]') as HTMLInputElement, 'mar'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const res = container.querySelector('button[data-occupation="31"]')!;
    expect(res.querySelector('.loc-res-type--locataires')?.textContent).toBe('occupant');
    expect(res.textContent).toContain('MARTIN Léa');
  });
});
