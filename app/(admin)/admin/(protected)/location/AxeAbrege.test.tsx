// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CourbeCumul, eurAxe, Histogramme, margeAxe, PAS_ANNEE_FIXE } from './TableauBordSuivi';

/**
 * 🔴 LOT CR (Arno, 31/10/2026) — L'AXE VERTICAL DES GRAPHIQUES EN ABRÉGÉ (« Mois par mois », « Année par année », Mensuel et Cumul ; partagé avec la
 * Location) : à partir de 100 000 €, « 100 000 € » était coupé à gauche (« 00 000 € »). Les graduations : « 850 € », « 25 k€ », « 1,2 M€ » ; la
 * marge de l'axe suit la plus longue — aucune graduation coupée. Le détail (encart) garde le montant complet.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const barres = (valeurs: readonly number[]) => valeurs.map((v, i) => ({ cle: i + 1, libelle: `m${i + 1}`, valeur: v,
  info: { titre: `Mois ${i + 1}`, courant: { libelle: '2026', ca: v, nb: 1 }, precedent: null } }));
/** Les graduations de l'axe, et la place qu'elles ont : la marge (x du texte + 6) doit contenir la plus longue (police de 11 : 6,6 par signe + 12). */
const axe = (): { textes: string[]; place: number } => {
  const t = [...container.querySelectorAll('svg text.tdb-axe')].filter((x) => x.getAttribute('text-anchor') === 'end');
  return { textes: t.map((x) => x.textContent ?? ''), place: Math.min(...t.map((x) => Number(x.getAttribute('x')) + 6)) };
};
const FORME = /^-?\d{1,3}(,\d)? (€|k€|M€)$/;
const lisible = ({ textes, place }: { textes: string[]; place: number }) => {
  for (const t of textes) expect([t, FORME.test(t)]).toEqual([t, true]);
  expect(place).toBeGreaterThanOrEqual(12 + Math.max(...textes.map((t) => t.length)) * 6.6);
};

describe('🔴 LOT CR — les graduations en abrégé', () => {
  it('eurAxe : montant entier sous 1 000 €, puis k€, puis M€ (une décimale au plus) ; le palier suivant quand l’arrondi y mène', () => {
    expect([0, 850, 999.4, 999.6, 25000, 21280, 63840, 100000, 127680, 999960, 1200000, 1000000, -21280].map(eurAxe))
      .toEqual(['0 €', '850 €', '999 €', '1 k€', '25 k€', '21,3 k€', '63,8 k€', '100 k€', '127,7 k€', '1 M€', '1,2 M€', '1 M€', '-21,3 k€']);
  });
  it('margeAxe : jamais moins qu’avant (56) ; plus large pour une graduation plus longue', () => {
    expect(margeAxe(['0 €', '25 k€'])).toBe(56);
    expect(margeAxe(['-127,7 k€'])).toBeGreaterThanOrEqual(12 + 9 * 6.6);
  });
});

describe('🔴 LOT CR — l’axe lisible dans les graphiques (aucune graduation coupée)', () => {
  for (const [nom, valeurs] of [['100 000 €', [100000, 40000, 85000]], ['1 000 000 €', [1000000, 250000, 640000]], ['petits montants', [800, 120, 450]]] as const) {
    it(`Mensuel (barres) — ${nom}`, async () => {
      await act(async () => { root.render(createElement(Histogramme, { barres: barres(valeurs), courante: 1, onChoisir: () => undefined, attribut: 'data-barre-mois', aria: 'CA' })); });
      lisible(axe());
      // l'encart garde le montant complet
      expect(container.querySelector('[data-histo-detail]')?.textContent ?? '').not.toMatch(/k€|M€/);
    });
    it(`Cumul (courbe) — ${nom}`, async () => {
      await act(async () => { root.render(createElement(CourbeCumul, { courant: [...valeurs], n1: null, annee: 2026, selection: 1, aria: 'CA cumulé', etiquettes: ['a', 'b', 'c'] })); });
      lisible(axe());
    });
  }
  it('Année par année (défile) : l’axe fixe à gauche, lisible à 1 000 000 €', async () => {
    const v = Array.from({ length: 15 }, (_, i) => 1000000 - i * 50000);
    await act(async () => { root.render(createElement(Histogramme, { barres: barres(v), courante: 1, onChoisir: () => undefined, attribut: 'data-barre-annee', aria: 'CA', pasFixe: PAS_ANNEE_FIXE })); });
    const t = [...container.querySelectorAll('[data-histo-axe] text')];
    expect(t.map((x) => x.textContent)).toEqual(['0 €', '250 k€', '500 k€', '750 k€', '1 M€']);
    const largeur = Number(container.querySelector('[data-histo-axe]')!.getAttribute('viewBox')!.split(' ')[2]);
    expect(largeur).toBeGreaterThanOrEqual(12 + 6 * 6.6);
  });
});
