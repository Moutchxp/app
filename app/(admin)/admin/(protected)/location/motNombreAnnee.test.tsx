// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BulleBarre, motNombreDeLAnnee, type InfoBarre } from './TableauBordSuivi';

/**
 * 🔴 D34 (Arno, 03/11/2026) — le panneau de détail des graphiques (Mon espace : Mois, Année(s) ; le Suivi CA : le même composant) : « Ventes +
 * compromis » seulement pour l'année EN COURS ; une autre année : « Ventes ». Texte seul : les nombres ne changent pas. Horloge figée au 03/11/2026.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T10:00:00Z')); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); });
const lignes = () => [...container.querySelectorAll('[data-bulle-bloc]')].map((b) => `${b.getAttribute('data-bulle-bloc')}:${b.querySelector('[data-mot-nombre]')?.textContent} ${b.querySelector('[data-mot-nombre]')?.nextElementSibling?.textContent}`);
const info = (courant: string, n1: string, o: Partial<InfoBarre> = {}): InfoBarre => ({ titre: `${courant} (HT)`, motNb: 'Ventes + compromis', motCa: 'CA HT',
  courant: { libelle: courant, ca: 1000, nb: 11 }, precedent: { libelle: n1, ca: 800, nb: 15 }, ...o });

describe('🔴 D34 — le mot du nombre selon l’année', () => {
  it('la règle : année affichée ≠ année en cours → « Ventes » ; l’année en cours, « Ventes + compromis » ; le cumul ; un autre mot ou libellé : tel quel', () => {
    expect(motNombreDeLAnnee('Ventes + compromis', '2023', 2026)).toBe('Ventes');
    expect(motNombreDeLAnnee('Ventes + compromis', '2026', 2026)).toBe('Ventes + compromis');
    expect(motNombreDeLAnnee('Ventes + compromis (cumul)', '2025', 2026)).toBe('Ventes (cumul)');
    expect(motNombreDeLAnnee('Baux', '2023', 2026)).toBe('Baux');
    expect(motNombreDeLAnnee('Ventes + compromis', 'Un an plus tôt', 2026)).toBe('Ventes + compromis');
  });
  it('panneau « 2023 (HT) » : 2023 « Ventes 11 », 2022 « Ventes 15 »', async () => {
    await act(async () => { root.render(createElement(BulleBarre, { info: info('2023', '2022') })); });
    expect(lignes()).toEqual(['courant:Ventes 11', 'n1:Ventes 15']);
  });
  it('l’année en cours avec N−1 : 2026 « Ventes + compromis 11 », 2025 « Ventes 15 »', async () => {
    await act(async () => { root.render(createElement(BulleBarre, { info: info('2026', '2025') })); });
    expect(lignes()).toEqual(['courant:Ventes + compromis 11', 'n1:Ventes 15']);
  });
  it('la mesure « Nombre » (compte) : la même règle', async () => {
    await act(async () => { root.render(createElement(BulleBarre, { info: { ...info('2026', '2025'), compte: 'Ventes + compromis', courant: { libelle: '2026', ca: 11, nb: null }, precedent: { libelle: '2025', ca: 15, nb: null } } })); });
    expect([...container.querySelectorAll('[data-mot-nombre]')].map((x) => `${x.textContent} ${x.nextElementSibling?.textContent}`)).toEqual(['Ventes + compromis 11', 'Ventes 15']);
  });
});
