// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileATrier } from './FileATrier';

/**
 * LOT ERGO-BOITE-2 — L'EN-TÊTE DE LA FILE DE TRI DIT DEUX NOMBRES, JAMAIS LEUR SOMME.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 C'EST LA DEUXIÈME MOITIÉ DU MÊME DÉFAUT. L'entrée « À rattacher » de la colonne annonçait `aTrier +
 * sansCandidat` — et le titre de CET écran affichait exactement la même addition, à la même source. Corriger l'un
 * sans l'autre aurait laissé deux nombres pour une seule vérité, ce que le commentaire de `GestionVue` interdit.
 *
 * ⚠️ CE QUI RESTE INTOUCHÉ, et que ce fichier vérifie aussi : la file LISTE toujours les deux sortes, ses trois
 * filtres sont toujours là, et sa ligne de chiffres compte toujours les sans-candidat en clair. Le lot corrige une
 * addition, il ne cache pas de courrier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A_TRANCHER = 3261;
const SANS_CANDIDAT = 15847;

const PAGE = {
  lignes: [],
  totaux: { aTrier: A_TRANCHER, sansCandidat: SANS_CANDIDAT, automatiques: 37713, nonExamines: 0 },
  tronque: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ etat: 'ok', data: PAGE }) }) as unknown as Response) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async () => {
  await act(async () => { root.render(createElement(FileATrier, { onRetour: () => {} })); });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
};

describe('🔴 la file de tri : le compteur du titre, et ce qui reste à côté', () => {
  it('le titre compte les mails à trancher — la somme 19 108 n’est écrite nulle part', async () => {
    await monter();
    expect(container.querySelector('.fat-titre .gst-compte')?.textContent).toBe(String(A_TRANCHER));
    expect(container.textContent ?? '').not.toContain(String(A_TRANCHER + SANS_CANDIDAT));
  });

  it('les sans-candidat sont NOMMÉS à côté du titre, pas fondus dedans', async () => {
    await monter();
    const titre = container.querySelector('.fat-titre')?.textContent ?? '';
    expect(titre).toContain(String(SANS_CANDIDAT));
    expect(titre).toContain('sans candidat');
  });

  it('rien n’a été retiré de l’écran : la ligne de chiffres et les trois filtres sont là', async () => {
    await monter();
    const chiffres = container.querySelector('.fat-chiffres')?.textContent ?? '';
    expect(chiffres).toContain(String(A_TRANCHER));
    expect(chiffres).toContain(String(SANS_CANDIDAT));
    expect(chiffres).toContain('rattaché(s) automatiquement');
    const filtres = [...(container.querySelectorAll('.fat-filtres button') ?? [])].map((b) => b.textContent);
    expect(filtres).toEqual(['Tous', 'À départager', 'Sans candidat']);
  });
});
