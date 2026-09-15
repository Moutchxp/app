// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocDemandePieces, type PieceManquante } from './BlocDemandePieces';

/**
 * PART-2 (B) — « Tout cocher / Tout décocher » des pièces manquantes (jsdom + act, sans testing-library). On éprouve le COMPORTEMENT via
 * l'état du bouton « Préparer le message » (actif ⟺ au moins une pièce cochée) et l'état propre des deux boutons de masse — jamais
 * l'apparence. « Tout cocher » ne coche QUE les familles manquantes (la liste `famillesManquantes` NE contient que des manquantes).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const ETAT_REPLIABLE = { numDau: 'PC0930012500081', destinataire: 'x@y.fr', repliable: true, motif: null, adresses: [], destinataireDefaut: 'x@y.fr', historique: [] };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  // GET /demander-pieces au montage → état répondable (le reste du composant s'affiche). Aucun envoi.
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ETAT_REPLIABLE } as unknown as Response)) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const MANQUANTES: PieceManquante[] = [
  { code: 'situation', libelle: 'Plan de situation (PC1)', libelleCorps: 'le plan de situation (PC1)', ordre: 20 },
  { code: 'masse', libelle: 'Plan de masse (PC2)', libelleCorps: 'le plan de masse (PC2)', ordre: 30 },
  { code: 'facade', libelle: 'Plans des façades (PC5)', libelleCorps: 'les plans des façades (PC5)', ordre: 60 },
];

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLButtonElement | undefined): Promise<void> => { await act(async () => { b!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

const monter = async (): Promise<void> => {
  await act(async () => { root.render(createElement(BlocDemandePieces, { dossierId: 1, famillesManquantes: MANQUANTES })); });
  await act(async () => { await Promise.resolve(); }); // résout le fetch de montage
};

describe('B — Tout cocher / Tout décocher (ne coche QUE les manquantes)', () => {
  it('au montage : toutes les manquantes cochées → « Préparer » actif, « Tout cocher » inactif (déjà tout coché), « Tout décocher » actif', async () => {
    await monter();
    expect(boutonPar(/Préparer le message/)?.disabled).toBe(false);
    expect(boutonPar(/Tout cocher/)?.disabled).toBe(true);   // rien à cocher de plus
    expect(boutonPar(/Tout décocher/)?.disabled).toBe(false);
  });

  it('« Tout décocher » → plus aucune pièce cochée : « Préparer » inactif + invite ; « Tout cocher » redevient actif', async () => {
    await monter();
    await cliquer(boutonPar(/Tout décocher/));
    expect(boutonPar(/Préparer le message/)?.disabled).toBe(true);
    expect(container.textContent).toMatch(/Cochez au moins une pièce/);
    expect(boutonPar(/Tout cocher/)?.disabled).toBe(false);
    expect(boutonPar(/Tout décocher/)?.disabled).toBe(true);
  });

  it('« Tout cocher » après un « Tout décocher » → toutes les manquantes recochées, « Préparer » actif de nouveau', async () => {
    await monter();
    await cliquer(boutonPar(/Tout décocher/));
    await cliquer(boutonPar(/Tout cocher/));
    expect(boutonPar(/Préparer le message/)?.disabled).toBe(false);
    expect(boutonPar(/Tout cocher/)?.disabled).toBe(true); // de nouveau tout coché
  });

  it('les cases individuelles restent décochables une par une (contrôle existant préservé)', async () => {
    await monter();
    const cases = [...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    const cochees = cases.filter((c) => c.checked).length;
    await act(async () => { cases.find((c) => c.checked)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const cochees2 = ([...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]).filter((c) => c.checked).length;
    expect(cochees2).toBe(cochees - 1); // une case décochée à l'unité
  });
});
