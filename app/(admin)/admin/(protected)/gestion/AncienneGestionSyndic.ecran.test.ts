// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DetailSyndicLecture } from './SyndicConnuLocation';

/**
 * 🔴 Arno (19/11/2026) — le détail du syndic (Location, modale « Syndic de la copropriété ») : « Immeubles et biens gérés » ne montre que les biens EN
 * GESTION ; « Ancienne gestion (N) » est replié, et déplié au clic, au même format, avec le mot « Ancienne gestion ». Vrai composant, route simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const FICHE = {
  id: 7, nom: 'CABINET ESSAI', ville: 'Paris', adresse: null, codePostal: null, telephone: null, telephone2: null, email: null, contacts: [],
  coproprietes: [{ cle: '43 avenue marceau', libelle: '43 avenue Marceau', codePostal: '92400', commune: 'COURBEVOIE', lots: [
    { id: 12, numero: '202', adresse: '43 avenue Marceau', commune: 'COURBEVOIE', type: 'Appartement · Type 1', proprietaires: ['Mme BASUYAUX'], fin: null, statut: 'ancienne_gestion' },
    { id: 13, numero: '399', adresse: '43 avenue Marceau', commune: 'COURBEVOIE', type: 'Appartement', proprietaires: ['M. DURAND'], fin: null, statut: 'en_gestion' },
  ] }],
};
let racine: Root; let c: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ etat: 'ok', fiche: FICHE })));
  c = document.createElement('div'); document.body.appendChild(c); racine = createRoot(c);
});
afterEach(() => { act(() => racine.unmount()); c.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

describe('🔴 « Immeubles et biens gérés » et « Ancienne gestion »', () => {
  it('la liste principale : le bien en gestion seul ; « Ancienne gestion (1) » replié, puis déplié au clic (même format, le mot écrit)', async () => {
    await act(async () => { racine.render(createElement(DetailSyndicLecture, { syndicId: 7 })); }); await calmer();
    expect([...c.querySelectorAll('[data-lot]')].map((x) => x.textContent)).toEqual(['lot 399AppartementM. DURAND']);
    const b = c.querySelector('[data-ouvrir-ancienne-gestion]') as HTMLButtonElement;
    expect(b.textContent).toContain('Ancienne gestion (1)');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('[data-lot-ancienne]')).toBeNull();
    await act(async () => { b.click(); });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(c.querySelector('[data-lot-ancienne]')?.textContent).toBe('lot 202Appartement · Type 1Mme BASUYAUXAncienne gestion');
  });
});
