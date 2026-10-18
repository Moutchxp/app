// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CreationProprietaires } from './CreationProprietaires';
import { FormulaireCarte } from '../gestion/CartesPersonnes';
import { DUREE_FETE_MS } from './FeteOui';
import { EXEMPLES_QUALITE } from '../../../../lib/location/cartesLocation';
import { EXEMPLE_QUALITE_CLIENT, EXEMPLE_QUALITE_CONTACT } from '../../../../lib/gestion/ficheContact';

/**
 * Retouches d'Arno (18/10/2026) :
 *   ① les exemples du champ « Qualité » — contact : « ex. Conjoint, artisan, avocat, voisin… » ; client : « ex. Conjoint,
 *      indivision, gérant, représentant… » — les mêmes dans la création Location et la fiche commune ;
 *   ② la FÊTE du « Oui » de « Propriétaire(s) en gestion ? » : au passage à Oui seulement, contenue dans le bouton, 3 s,
 *      absente avec « réduire les animations », sans bloquer la suite (le bloc mandat s'affiche tout de suite).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let reduit: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  reduit = false;
  window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('reduce') ? reduit : false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: [] }) })) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

const bouton = (t: string) => [...container.querySelectorAll('[data-question-gestion] button')].find((b) => b.textContent?.trim() === t || b.querySelector('.fete-texte')?.textContent === t) as HTMLButtonElement;
const oui = () => container.querySelector('[data-question-gestion] button') as HTMLButtonElement;

describe('① les exemples du champ « Qualité »', () => {
  it('les textes d’Arno, les mêmes des deux côtés', () => {
    expect(EXEMPLE_QUALITE_CONTACT).toBe('ex. Conjoint, artisan, avocat, voisin…');
    expect(EXEMPLE_QUALITE_CLIENT).toBe('ex. Conjoint, indivision, gérant, représentant…');
    expect(EXEMPLES_QUALITE).toEqual({ proprietaire: EXEMPLE_QUALITE_CONTACT, locataire: EXEMPLE_QUALITE_CONTACT });
  });
  it('fiche commune : carte client et carte de contact (même formulaire que la création)', async () => {
    const qualite = () => ([...container.querySelectorAll('.cp-champ')].find((l) => (l.textContent ?? '').startsWith('Qualité'))?.querySelector('input') as HTMLInputElement).placeholder;
    await act(async () => { root.render(createElement(FormulaireCarte, { p: null, refus: null, onAnnuler: () => {}, onEnregistrer: async () => {}, creation: { rappel: '' } })); });
    expect(qualite()).toBe(EXEMPLE_QUALITE_CLIENT);
    await act(async () => { root.render(createElement(FormulaireCarte, { p: null, refus: null, onAnnuler: () => {}, onEnregistrer: async () => {}, contact: { titre: 'Nouveau contact' } })); });
    expect(qualite()).toBe(EXEMPLE_QUALITE_CONTACT);
  });
  it('création Location : la carte client porte l’exemple client', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const input = [...container.querySelectorAll('.cp-form .cp-champ')].find((l) => (l.textContent ?? '').startsWith('Qualité'))?.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe(EXEMPLE_QUALITE_CLIENT);
  });
});

describe('② la fête du « Oui »', () => {
  it('au passage à Oui : la fête DANS le bouton, le mandat tout de suite ; 3 s puis « ✓ Oui » normal', async () => {
    vi.useFakeTimers();
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { oui().click(); });
    const fete = container.querySelector('[data-fete]');
    expect(fete).not.toBeNull();
    // Rien hors du bouton : la fête et tous ses éléments sont ses descendants ; le bouton masque le débordement.
    expect(oui().contains(fete)).toBe(true);
    expect(document.querySelectorAll('[data-fete]')).toHaveLength(1);
    expect(oui().className).toContain('fete-hote');
    expect(fete?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-mandat]')).not.toBeNull();
    expect(oui().textContent).toBe('✓ Oui');
    await act(async () => { vi.advanceTimersByTime(DUREE_FETE_MS - 10); });
    expect(container.querySelector('[data-fete]')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(20); });
    expect(container.querySelector('[data-fete]')).toBeNull();
    expect(oui().textContent).toBe('✓ Oui');
  });

  it('Oui déjà choisi : pas de nouvelle fête ; Non puis Oui : la fête revient', async () => {
    vi.useFakeTimers();
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { oui().click(); });
    await act(async () => { vi.advanceTimersByTime(DUREE_FETE_MS + 10); });
    await act(async () => { oui().click(); });
    expect(container.querySelector('[data-fete]')).toBeNull();
    await act(async () => { bouton('Non').click(); });
    expect(container.querySelector('[data-fete]')).toBeNull();
    await act(async () => { oui().click(); });
    expect(container.querySelector('[data-fete]')).not.toBeNull();
  });

  it('« réduire les animations » : aucune fête, le reste inchangé', async () => {
    reduit = true;
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await act(async () => { oui().click(); });
    expect(container.querySelector('[data-fete]')).toBeNull();
    expect(oui().getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-mandat]')).not.toBeNull();
  });

  it('légère : CSS et SVG seuls, couleurs du thème, aucun son, coupée par la règle « mouvement réduit »', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeteOui.tsx', 'utf8');
    expect(src).not.toMatch(/^import .*(confetti|lottie|canvas|howler)/m);
    expect(src).not.toMatch(/new Audio|\.play\(/);
    expect(src).toContain('@media (prefers-reduced-motion: reduce){.fete{display:none}}');
    expect(src).toContain('var(--color-svv-red)');
    expect(src).toContain('var(--color-svv-or)');
    expect(src).toContain('var(--color-svv-blanc)');
    expect(src).toContain('.fete-hote{position:relative;overflow:hidden');
  });
});
