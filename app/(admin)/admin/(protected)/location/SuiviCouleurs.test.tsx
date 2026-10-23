// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BulleBarre, CSS_TABLEAU_BORD, MouvementsGestion, sensDe } from './TableauBordSuivi';

/**
 * 🔴 Arno (23/10/2026) — Outils de suivi (Suivi du mois et Suivi annuel, même composant) : la tuile « Biens en gestion » colorée
 * (+N vert, −N rouge, solde vert / rouge / gris), l'écart du bloc de détail coloré par son signe, et le bloc de détail À DROITE de
 * l'histogramme (dessous au téléphone). Aucun calcul ne change.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const rendre = async (el: ReturnType<typeof createElement>) => { await act(async () => { root.render(el); }); };
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const plat = (c: string) => c.replace(/\s+/g, ' ');

describe('🔴 la tuile « Biens en gestion »', () => {
  it('+N en vert, −N en rouge ; le solde : vert s’il est positif, rouge s’il est négatif, gris s’il est nul', async () => {
    for (const [n, s, solde, sens] of [[3, 1, '+2', 'positif'], [1, 4, '−3', 'negatif'], [2, 2, '0', 'nul']] as const) {
      await rendre(createElement(MouvementsGestion, { periode: 'oct. 26', nouveaux: n, sortis: s }));
      expect(q('[data-gestion-nouveaux]')?.textContent).toBe(`+${n}`);
      expect(q('[data-gestion-nouveaux]')?.className).toContain('tdb-signe--positif');
      expect(q('[data-gestion-sortis]')?.textContent).toBe(`−${s}`);
      expect(q('[data-gestion-sortis]')?.className).toContain('tdb-signe--negatif');
      expect(q('[data-gestion-solde]')?.textContent).toBe(solde);
      expect(q('[data-gestion-solde]')?.className).toContain(`tdb-signe--${sens}`);
      expect(q('.tdb-gestion-solde-mot')?.textContent).toBe('Solde');
    }
  });
  it('les couleurs sont celles du thème (vert, rouge, gris), lisibles en clair et en sombre ; le solde est écrit en gros', () => {
    const css = plat(CSS_TABLEAU_BORD);
    expect(css).toContain('.tdb-signe--positif{color:var(--color-svv-green-ink)}');
    expect(css).toContain('.tdb-signe--negatif{color:var(--color-svv-red)}');
    expect(css).toContain('.tdb-signe--nul{color:var(--color-svv-muted)}');
    expect(css).toContain('.tdb-gestion-solde-valeur{font-size:2.4rem');
    expect(sensDe(5)).toBe('positif'); expect(sensDe(-0.01)).toBe('negatif'); expect(sensDe(0)).toBe('nul');
  });
});

describe('🔴 la ligne « Écart » du bloc de détail', () => {
  const info = (ca: number, caN1: number) => ({ titre: 'Septembre', courant: { libelle: '2026', ca, nb: 3 }, precedent: { libelle: '2025', ca: caN1, nb: 2 } });
  it('positive en vert, négative en rouge, nulle en gris (montant et pourcentage) ; « Écart » reste neutre', async () => {
    for (const [ca, n1, sens] of [[1500, 1000, 'positif'], [800, 1000, 'negatif'], [1000, 1000, 'nul']] as const) {
      await rendre(createElement(BulleBarre, { info: info(ca, n1), sous: true }));
      const montant = q('[data-bulle-pied] [data-ecart]')!;
      expect(montant.getAttribute('data-ecart')).toBe(sens);
      expect(montant.className).toContain(`tdb-signe--${sens}`);
      expect(q('[data-bulle-pied] > span:first-child')?.textContent).toBe('Écart');
      expect(q('[data-bulle-pied] > span:first-child')?.className ?? '').not.toContain('tdb-signe');
    }
  });
});

describe('🔴 le bloc de détail à droite de l’histogramme', () => {
  it('dans la même carte, à droite du graphique (largeur fixe, graphique sur le reste), aligné en haut ; dessous au téléphone', () => {
    const css = plat(CSS_TABLEAU_BORD);
    expect(css).toContain('.tdb-histo-rangee{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:20px;align-items:start}');
    expect(css).toContain('@media (max-width:760px){ .tdb-histo-rangee{grid-template-columns:minmax(0,1fr);gap:8px} }');
  });
});
