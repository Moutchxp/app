// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DepotAffiche } from './DemandesRendu';
import { BlocDepot } from './BlocDepot';

/**
 * Lot 1 « carrousel Téléservice » (présentation) — COMPORTEMENT du carrousel de BlocDepot, sur un vrai rendu (jsdom + act,
 * sans testing-library ; createElement, pas de JSX). Aucune assertion de couleur/classe/pixel, aucune lecture de source.
 * `fetch` (chargement de la file + trace « copier ») et `navigator.clipboard` sont mockés.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  // clipboard : BoutonCopier n'appelle onCopie qu'APRÈS un writeText résolu → on le mocke pour que les gestes « copier » aboutissent.
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];

const carte = (id: number, commune: string): DepotAffiche => ({
  id, reference: `SVAV-DEM-2026-${String(id).padStart(6, '0')}`, communeNom: commune,
  url: `https://ts.${commune.toLowerCase()}.fr`, corps: `Texte de la demande pour ${commune}`, nbDossiers: 1, statut: 'prete',
  dossiers: [{ type: 'PC', numDau: '07511524V0006' }],
});

/** Monte BlocDepot avec la file `demandes` servie par le GET, et laisse le chargement se vider. */
const monter = async (demandes: DepotAffiche[], onChangement = vi.fn()): Promise<void> => {
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/api/admin/permis/demandes/depot')) return { ok: true, json: async () => ({ demandes, releveDelaiSecondes: 60 }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response; // /depot-presume (trace « copier »), etc.
  }) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(BlocDepot, { signalRafraichir: 0, onChangement })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('Lot 1 — carrousel Téléservice (BlocDepot)', () => {
  it('liste vide → RIEN n’est rendu (return null conservé : pas de carrousel vide, pas de cadre orphelin)', async () => {
    await monter([]);
    expect(container.textContent).toBe('');
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it('N cartes → les N sont présentes, dans l’ORDRE de la source (listerADeposer)', async () => {
    await monter([carte(1, 'Alpha'), carte(2, 'Beta'), carte(3, 'Gamma')]);
    // une carte = un bouton « Marquer comme déposée »
    expect(boutons().filter((b) => b.textContent === 'Marquer comme déposée')).toHaveLength(3);
    const t = container.textContent ?? '';
    expect(t.indexOf('Alpha')).toBeGreaterThanOrEqual(0);
    expect(t.indexOf('Alpha')).toBeLessThan(t.indexOf('Beta'));
    expect(t.indexOf('Beta')).toBeLessThan(t.indexOf('Gamma'));
    // position initiale en TEXTE
    expect(container.textContent).toContain('1 sur 3');
  });

  it('la navigation (Suivant / Précédent) change la carte courante (position en texte)', async () => {
    await monter([carte(1, 'Alpha'), carte(2, 'Beta'), carte(3, 'Gamma')]);
    const suivant = boutons().find((b) => b.getAttribute('aria-label') === 'Carte suivante');
    const precedent = boutons().find((b) => b.getAttribute('aria-label') === 'Carte précédente');
    expect(suivant && precedent).toBeTruthy();
    expect((precedent as HTMLButtonElement).disabled).toBe(true); // début → Précédent inactif
    act(() => { suivant!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('2 sur 3');
    act(() => { suivant!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('3 sur 3');
    act(() => { precedent!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('2 sur 3');
  });

  it('les gestes de CarteDepot restent déclenchables : « Copier le texte » et « Copier le numéro » tracent le signal de dépôt', async () => {
    await monter([carte(1, 'Alpha')]);
    const copierTexte = boutons().find((b) => b.textContent === 'Copier le texte');
    const copierNum = boutons().find((b) => b.textContent === 'Copier le numéro de permis');
    expect(copierTexte && copierNum).toBeTruthy();
    await act(async () => { copierTexte!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { copierNum!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    const appels = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(appels.some((u) => u.includes('/api/admin/permis/depot-presume'))).toBe(true); // signalerDepot a bien tracé (onCopie déclenché)
  });
});
