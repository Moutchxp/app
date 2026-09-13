// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupeRailsCommunes } from './GroupeRailsCommunes';
import type { CompteursProcess } from './CommutateurProcess';

/**
 * AJUSTEMENT — la ligne unique regroupant « Basculer une commune de rail » (②) + la carte des communes (③). On MONTE le composant, on lit le
 * COMPORTEMENT : le libellé nomme les deux fonctions ET porte le décompte hors-process (lisible SANS déplier) ; une fois déplié, les DEUX
 * fonctions sont présentes et actionnables (un geste chacune). Couleurs/mise en page NON testées (jsdom).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const RING = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][];
const HORS: CompteursProcess['hors'] = { communesSansAdresse: 11, courrierDemandes: 1, communes: [], courrier: [] };
const PAYLOAD = { communes: [{ code: '75056', nom: 'Paris', dep: '75', canal: 'email', anneaux: [RING] }], bbox: [0, 0, 10, 10] };

let root: Root | null = null; const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });
async function flush(n = 12) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
async function monter(hors: CompteursProcess['hors'] | null = HORS) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }) as unknown as Response) as unknown as typeof fetch;
  const c = document.createElement('div'); document.body.appendChild(c);
  root = createRoot(c);
  await act(async () => { root!.render(createElement(GroupeRailsCommunes, { hors, rail: 'email', onAction: vi.fn() })); });
  await flush();
  return c;
}
const btn = (c: HTMLElement, txt: string) => [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(txt));

describe('GroupeRailsCommunes — une seule ligne regroupant bascule + carte', () => {
  it('la ligne unique existe, nomme les deux fonctions, et affiche le décompte hors-process SANS déplier', async () => {
    const c = await monter();
    const ligne = btn(c, 'Bascule de rail')!;
    expect(ligne).toBeTruthy();
    expect(ligne.textContent).toContain('carte des communes');            // nomme les deux fonctions
    expect(ligne.textContent).toContain('hors process : 11 sans adresse'); // décompte lisible REPLIÉ
    expect(ligne.textContent).toContain('1 courrier');
    // replié : ni la bascule ni la carte ne sont encore montées
    expect(btn(c, 'Basculer une commune de rail')).toBeUndefined();
    expect(btn(c, 'Carte des communes — rail')).toBeUndefined();
  });

  it('une fois dépliée, les DEUX fonctions sont présentes, chacune sous son propre en-tête', async () => {
    const c = await monter();
    act(() => { btn(c, 'Bascule de rail')!.click(); }); await flush();
    expect(btn(c, 'Basculer une commune de rail')).toBeTruthy();  // ② présente
    expect(btn(c, 'Carte des communes — rail')).toBeTruthy();      // ③ présente (en-tête distinct)
  });

  it('geste ② : déplier « Basculer une commune de rail » révèle son formulaire (contrôle fonctionnel)', async () => {
    const c = await monter();
    act(() => { btn(c, 'Bascule de rail')!.click(); }); await flush();
    act(() => { btn(c, 'Basculer une commune de rail')!.click(); }); await flush();
    expect(c.querySelector('input[placeholder="ex. Paris ou 75056"]')).toBeTruthy(); // le champ commune du geste de bascule
  });

  it('geste ③ : déplier « Carte des communes » monte la carte et son cycle (contrôle fonctionnel)', async () => {
    const c = await monter();
    act(() => { btn(c, 'Bascule de rail')!.click(); }); await flush();
    act(() => { btn(c, 'Carte des communes — rail')!.click(); }); await flush();
    expect(btn(c, 'Modifier la sélection')).toBeTruthy(); // le cycle de la carte (Lot 3) est là et actionnable
    expect(c.querySelector('svg[aria-label^="Carte des communes du rail"]')).toBeTruthy();
  });

  it('sans données hors-process → le libellé reste lisible (0 sans adresse)', async () => {
    const c = await monter(null);
    expect(btn(c, 'Bascule de rail')!.textContent).toContain('hors process : 0 sans adresse');
  });
});
