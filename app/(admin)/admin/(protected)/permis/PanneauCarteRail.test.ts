// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PanneauCarteRail } from './PanneauCarteRail';
import type { DepsAffectation } from '../../../../lib/sitadel/carteRailValidation';

/**
 * Lot 3 — cycle du bouton + application de l'exclusivité. On MONTE le panneau (rail 'email'), fetch /carte mocké (STATEFUL : le canal
 * change après une affectation), deps d'affectation INJECTÉES (le geste existant). On teste le COMPORTEMENT : cycle 3 temps, application via
 * les deps, message + retour au repos, exclusivité (une commune affectée à email quitte formulaire), refus partiel. Couleurs/layout non testés.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const RING = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][];
const NOMS: Record<string, string> = { A: 'Alphaville', B: 'Betaville', C: 'Gammaville', D: 'Deltaville' };

let root: Root | null = null; const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });
async function flush(n = 14) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }

/** Monte le panneau avec un état de canaux MUTABLE. Le /carte est servi depuis cet état ; les deps mutent l'état (comme le ferait le serveur). */
async function monter(canauxInit: Record<string, string | null>, apercuRefus: (code: string) => string | null = () => null) {
  const canaux = new Map(Object.entries(canauxInit));
  const carte = () => ({ communes: [...canaux].map(([code, canal]) => ({ code, nom: NOMS[code] ?? code, dep: '75', canal, anneaux: [RING] })), bbox: [0, 0, 10, 10] });
  global.fetch = vi.fn(async (u: unknown) => {
    if (String(u).includes('/api/admin/permis/carte')) return { ok: true, json: async () => carte() } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;

  const patchFn = vi.fn(async (code: string, canal: string) => { canaux.set(code, canal); return true; }); // exclusivité : une seule colonne canal
  const apercuFn = vi.fn(async (code: string) => ({ raisonRefus: apercuRefus(code), ids: [] as number[], coordonnees: { email: 'm@x.fr', urlFormulaire: '', adressePostale: '' }, communeNom: NOMS[code] ?? code }));
  const deps: DepsAffectation = { apercu: apercuFn, annulerLot: vi.fn(async () => true), patchContact: patchFn };

  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(PanneauCarteRail, { rail: 'email', deps })); });
  await flush();
  return { c: container, patchFn, apercuFn };
}
const cycleBtn = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => /Modifier la sélection|Garder la sélection|Valider ma sélection/.test(b.textContent ?? ''))!;
const communeNode = (c: HTMLElement, nom: string) => [...c.querySelectorAll('[role="button"]')].find((g) => (g.getAttribute('aria-label') ?? '').startsWith(nom)) as unknown as SVGGElement;

describe('PanneauCarteRail — cycle + exclusivité', () => {
  it('cycle : repos → « Garder la sélection » (rien changé) → referme sans rien appliquer', async () => {
    const { c, patchFn } = await monter({ A: 'email', B: 'formulaire', C: 'inconnu', D: null });
    expect(cycleBtn(c).textContent).toContain('Modifier la sélection');
    act(() => cycleBtn(c).click()); await flush();
    expect(cycleBtn(c).textContent).toContain('Garder la sélection'); // édition, sélection == origine
    act(() => cycleBtn(c).click()); await flush();
    expect(cycleBtn(c).textContent).toContain('Modifier la sélection'); // retour repos
    expect(patchFn).not.toHaveBeenCalled();                            // rien appliqué
  });

  it('cycle : édition → sélection d\'une commune → « Valider ma sélection » → applique + confirmation + retour repos', async () => {
    const { c, patchFn } = await monter({ A: 'email', B: 'formulaire', C: 'inconnu', D: null });
    act(() => cycleBtn(c).click()); await flush();                     // édition
    act(() => { communeNode(c, 'Betaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); // ajoute B (autre rail → email)
    expect(cycleBtn(c).textContent).toContain('Valider ma sélection');
    act(() => cycleBtn(c).click()); await flush();
    expect(patchFn).toHaveBeenCalledWith('B', 'email', expect.anything(), expect.anything()); // affectée à email
    expect((c.textContent ?? '')).toContain('affectée(s) au rail'); // message de confirmation
    expect(cycleBtn(c).textContent).toContain('Modifier la sélection'); // re-verrouillé au repos
  });

  it('exclusivité : après validation, la commune est « sur ce rail » (email) et a quitté formulaire', async () => {
    const { c } = await monter({ A: 'email', B: 'formulaire' });
    act(() => cycleBtn(c).click()); await flush();
    act(() => { communeNode(c, 'Betaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush();
    act(() => cycleBtn(c).click()); await flush(); // valider
    // re-chargé : B est désormais sur email (canal changé) → son libellé accessible dit « sur ce rail », plus « sur l'autre rail ».
    expect(communeNode(c, 'Betaville').getAttribute('aria-label')).toContain('sur ce rail');
    expect(communeNode(c, 'Betaville').getAttribute('aria-label')).not.toContain('autre rail');
  });

  it('refus PARTIEL : une commune sans coordonnée est listée refusée, le message le signale', async () => {
    const { c, patchFn } = await monter({ A: 'email', D: null }, (code) => code === 'D' ? 'e-mail manquant — renseignez la fiche contact' : null);
    act(() => cycleBtn(c).click()); await flush();
    act(() => { communeNode(c, 'Deltaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); // D = nonAffecte, sélectionnable
    act(() => cycleBtn(c).click()); await flush(); // valider
    expect(patchFn).not.toHaveBeenCalled();                 // refusée → pas d'écriture
    expect((c.textContent ?? '')).toContain('refusée(s)');   // message
    expect((c.textContent ?? '')).toContain('renseignez la fiche contact'); // raison affichée
  });

  it('hors process non sélectionnable → jamais tenté au Valider', async () => {
    const { c, apercuFn } = await monter({ A: 'email', C: 'inconnu' });
    act(() => cycleBtn(c).click()); await flush();
    act(() => { communeNode(c, 'Gammaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); // clic sur hors-process : inerte
    expect(cycleBtn(c).textContent).toContain('Garder la sélection'); // aucune sélection ajoutée
    act(() => cycleBtn(c).click()); await flush();
    expect(apercuFn).not.toHaveBeenCalledWith('C', expect.anything()); // jamais tenté
  });
});
