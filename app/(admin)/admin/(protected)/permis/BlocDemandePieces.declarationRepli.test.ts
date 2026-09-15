// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocDemandePieces, type PieceManquante } from './BlocDemandePieces';

/**
 * REPLI de « Déclarer une relance déjà envoyée (hors outil) » — motif BlocRepliable partagé, FERMÉ PAR DÉFAUT (geste rare). On éprouve :
 * (1) au montage, seule la LIGNE cliquable est là, son contenu (date, cases, bouton) n'est PAS monté, et le libellé dit que c'est un
 * CONSTAT (aucun e-mail) ; (2) au clic, le contenu complet apparaît et reste fonctionnel. jsdom + act, sans testing-library.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const ETAT = { numDau: 'PC0930012500081', destinataire: 'x@y.fr', repliable: true, motif: null, adresses: [], destinataireDefaut: 'x@y.fr', historique: [], expedition: null, reception: null };
const MANQUANTES: PieceManquante[] = [
  { code: 'cerfa', libelle: 'Formulaire Cerfa', libelleCorps: 'le formulaire Cerfa', ordre: 10 },
  { code: 'masse', libelle: 'Plan de masse (PC2)', libelleCorps: 'le plan de masse (PC2)', ordre: 30 },
];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ETAT } as unknown as Response)) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const entete = (): HTMLButtonElement | undefined => boutons().find((b) => /Déclarer une relance déjà envoyée/.test(b.textContent ?? ''));
const dateDecl = (): HTMLInputElement | null => container.querySelector('input[aria-label="Date de la relance déjà envoyée"]');
const monter = async (): Promise<void> => {
  await act(async () => { root.render(createElement(BlocDemandePieces, { dossierId: 1, famillesManquantes: MANQUANTES })); });
  await act(async () => { await Promise.resolve(); });
};

describe('Déclaration hors outil — repliée par défaut (motif BlocRepliable)', () => {
  it('au montage : une SEULE ligne, fermée (aria-expanded=false), contenu NON monté ; libellé = constat (aucun e-mail)', async () => {
    await monter();
    const e = entete();
    expect(e, 'la ligne dépliable « Déclarer une relance… » doit exister').toBeTruthy();
    expect(e!.getAttribute('aria-expanded')).toBe('false');
    expect(e!.textContent).toMatch(/constat/i);
    expect(e!.textContent).toMatch(/aucun e-mail/i); // on comprend SANS ouvrir que rien ne part
    // Contenu replié → non monté : ni le champ date, ni le bouton « Déclarer cette relance »
    expect(dateDecl()).toBeNull();
    expect(boutons().some((b) => /Déclarer cette relance/.test(b.textContent ?? ''))).toBe(false);
  });

  it('au clic : le contenu complet apparaît (date, « Aujourd’hui », bouton « Déclarer cette relance », phrase d’aide) et la ligne est ouverte', async () => {
    await monter();
    await act(async () => { entete()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(entete()!.getAttribute('aria-expanded')).toBe('true');
    expect(dateDecl()).not.toBeNull();
    expect(boutons().some((b) => /Aujourd’hui/.test(b.textContent ?? ''))).toBe(true);
    expect(boutons().some((b) => /Déclarer cette relance/.test(b.textContent ?? ''))).toBe(true);
    expect(container.textContent).toMatch(/aucun e-mail ne part/i); // phrase d'aide présente une fois déplié
  });

  it('le bloc d’ENVOI réel (« Demander les pièces manquantes ») reste visible, lui, sans repli', async () => {
    await monter();
    expect(container.textContent).toMatch(/Demander les pièces manquantes à la mairie/);
    expect(boutons().some((b) => /Préparer le message/.test(b.textContent ?? ''))).toBe(true); // le geste d'envoi n'est pas replié
  });
});
