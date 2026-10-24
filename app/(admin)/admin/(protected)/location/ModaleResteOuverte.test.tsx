// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/outils' }));
const { ModaleParametresLocation, OuvrirAnnuaireApporteurs } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — LA MODALE « PARAMÈTRES LOCATION » NE SE FERME QUE PAR LA CROIX, LE CLIC EN DEHORS OU « ANNULER ».
 *   · le clic en dehors : seulement s'il COMMENCE et FINIT hors de la fenêtre (un glisser depuis un champ ne ferme rien) ;
 *   · Échap ne ferme jamais la modale (seulement l'élément interne ouvert) ;
 *   · son état est dans l'adresse : ouverte, onglet, carte, panneau — un rechargement la rouvre au même endroit.
 * Routes simulées, données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.history.replaceState(null, '', '/admin/location/outils');
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {} });
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-24', dossiers: [] } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true,
      negociateurs: [], regles: [], retrocessions: [], collegues: [{ id: 5, libelle: 'Paul Collègue' }],
      apporteurs: [{ id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa', baremes: [],
        collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }], remunerations: [] }] } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const souris = async (el: Element, type: 'mousedown' | 'mouseup' | 'click') => { await act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true })); }); };

describe('🔴 ce qui ferme la modale, et ce qui ne la ferme pas', () => {
  it('un clic qui commence ET finit en dehors : ferme ; un glisser depuis un champ qui finit dehors : ne ferme rien ; Échap : ne ferme rien', async () => {
    const fermer = vi.fn();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: fermer })); });
    await calmer();
    const voile = container.querySelector('[data-voile-parametres]')!;
    const champ = container.querySelector('[data-modale-parametres] input, [data-modale-parametres] button')!;
    // Glisser : pressé DANS la fenêtre, relâché dehors (le « click » part sur l'ancêtre commun : le voile).
    await souris(champ, 'mousedown'); await souris(voile, 'mouseup'); await souris(voile, 'click');
    expect(fermer).not.toHaveBeenCalled();
    // Échap, n'importe où : jamais la modale.
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(fermer).not.toHaveBeenCalled();
    // Le vrai clic en dehors.
    await souris(voile, 'mousedown'); await souris(voile, 'mouseup'); await souris(voile, 'click');
    expect(fermer).toHaveBeenCalledTimes(1);
  });
  it('les onglets restent visibles quelle que soit la longueur du contenu : la tête, la barre d’onglets et le pied ne rétrécissent jamais', async () => {
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
    const css = (container.querySelector('[data-voile-parametres] style')?.textContent ?? '').replace(/\s+/g, '');
    for (const classe of ['plo-tete', 'plo-onglets', 'plo-pied']) expect(css).toMatch(new RegExp(`\\.${classe}\\{[^}]*flex-shrink:0`));
  });
  it('la croix et « Annuler » ferment', async () => {
    const fermer = vi.fn();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: fermer })); });
    await calmer();
    await souris(container.querySelector('.plo-x')!, 'click');
    await souris(container.querySelector('[data-annuler-parametres]')!, 'click');
    expect(fermer).toHaveBeenCalledTimes(2);
  });
});

describe('🔴 l’état dans l’adresse : un rechargement rouvre au même endroit', () => {
  const brique = () => createElement(OuvrirAnnuaireApporteurs, { rendu: (ouvrir: () => void) => createElement('button', { type: 'button', onClick: ouvrir, 'data-brique': 'annuaire' }, 'Annuaire') });
  it('ouvrir, choisir un panneau : l’adresse le dit ; fermer : l’adresse est nettoyée', async () => {
    await act(async () => { root.render(brique()); });
    await souris(container.querySelector('[data-brique="annuaire"]')!, 'click');
    await calmer();
    expect(window.location.search).toBe('?parametres=apporteurs');
    await souris(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="rattachement"]')!, 'click');
    expect(window.location.search).toBe('?parametres=apporteurs&apporteur=4&panneau=rattachement');
    await souris(container.querySelector('[data-onglet="commissions"]')!, 'click');
    expect(window.location.search).toBe('?parametres=commissions');
    await souris(container.querySelector('.plo-x')!, 'click');
    expect(window.location.search).toBe('');
    expect(container.querySelector('[data-modale-parametres]')).toBeNull();
  });
  it('« rechargement » avec ?parametres=apporteurs&apporteur=4&panneau=rattachement : la modale rouvre sur la même carte et le même panneau', async () => {
    window.history.replaceState(null, '', '/admin/location/outils?parametres=apporteurs&apporteur=4&panneau=rattachement');
    await act(async () => { root.render(brique()); });
    await calmer();
    expect(container.querySelector('[data-modale-parametres]')).not.toBeNull();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-onglet')).toBe('apporteurs');
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="rattachement"]')).not.toBeNull();
  });
});
