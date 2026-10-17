// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ListeAnalyses, type LigneEspace } from './ListeAnalyses';
import { ALT_CERTIFICAT_EMIS } from './presentation';

/**
 * LOT ESPACE-PARTAGE-ICONE (Arno, 17/10/2026) — le sceau rouge « Certificat émis » sur la première ligne d'un bloc
 * d'analyse, juste après la date, quand l'analyse a un certificat ; rien sur les autres blocs. La détection vient des
 * données déjà chargées (`certificatId`) : aucune requête.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ligne = (analyseId: number, certificatId: number | null): LigneEspace => ({
  analyseId, dateLabel: '17/10/2026', adresse: '12 rue de la République, Asnières', scoreLabel: '56/100',
  verdict: certificatId === null ? 'VIS_A_VIS' : 'SANS_VIS_A_VIS', certificatId, nominatifPret: true,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('le sceau « Certificat émis » dans l’historique', () => {
  it('présent (rouge, texte alternatif) sur un bloc avec certificat, juste après la date ; absent sinon', async () => {
    await act(async () => { root.render(createElement(ListeAnalyses, { lignes: [ligne(1, 470), ligne(2, null)] })); });
    const blocs = [...container.querySelectorAll('ul > li')];
    expect(blocs).toHaveLength(2);
    const sceau = blocs[0].querySelector('[data-certificat-emis]');
    expect(sceau).not.toBeNull();
    expect(sceau?.getAttribute('role')).toBe('img');
    expect(sceau?.getAttribute('aria-label')).toBe(ALT_CERTIFICAT_EMIS);
    expect(sceau?.getAttribute('aria-hidden')).toBe('false');
    expect(sceau?.getAttribute('class')).toContain('text-svv-red');
    // juste après la date, dans le même groupe, et la date ne passe pas à la ligne
    const date = sceau?.previousElementSibling;
    expect(date?.textContent).toBe('17/10/2026');
    expect(date?.className).toContain('whitespace-nowrap');
    expect(blocs[1].querySelector('[data-certificat-emis]')).toBeNull();
    expect(ALT_CERTIFICAT_EMIS).toBe('Certificat émis');
  });
  it('aucune requête réseau pour décider (données déjà chargées)', async () => {
    const appels: unknown[] = [];
    const origine = globalThis.fetch;
    globalThis.fetch = ((...a: unknown[]) => { appels.push(a); return Promise.reject(new Error('interdit')); }) as typeof fetch;
    try {
      await act(async () => { root.render(createElement(ListeAnalyses, { lignes: [ligne(1, 470), ligne(2, null), ligne(3, 471)] })); });
      expect(container.querySelectorAll('[data-certificat-emis]')).toHaveLength(2);
      expect(appels).toHaveLength(0);
    } finally {
      globalThis.fetch = origine;
    }
  });
});
