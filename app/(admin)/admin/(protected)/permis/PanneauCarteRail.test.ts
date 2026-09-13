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

const toggleBtn = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => /Tout désélectionner|Tout resélectionner/.test(b.textContent ?? ''));

describe('POINT 2 — bascule « Tout désélectionner / Tout resélectionner »', () => {
  it('vider → sélection vide + cycle « Valider » ; re-cliquer → origine restaurée + cycle « Garder » ; AUCUNE écriture', async () => {
    const { c, patchFn } = await monter({ A: 'email', B: 'email', C: 'email', D: 'inconnu' }); // A,B,C sur email ; D hors process
    act(() => cycleBtn(c).click()); await flush(); // édition
    expect(toggleBtn(c)!.textContent).toContain('Tout désélectionner'); // non vide → prochain clic VIDE
    act(() => toggleBtn(c)!.click()); await flush();                    // VIDER
    expect(communeNode(c, 'Alphaville').getAttribute('aria-pressed')).toBe('false'); // désélectionnée
    expect(communeNode(c, 'Betaville').getAttribute('aria-pressed')).toBe('false');
    expect(cycleBtn(c).textContent).toContain('Valider ma sélection');  // écart vs origine
    expect(toggleBtn(c)!.textContent).toContain('Tout resélectionner');  // vide → prochain clic RESTAURE
    expect(patchFn).not.toHaveBeenCalled();                             // la bascule N'ÉCRIT RIEN
    act(() => toggleBtn(c)!.click()); await flush();                    // RESTAURER
    expect(communeNode(c, 'Alphaville').getAttribute('aria-pressed')).toBe('true'); // origine restaurée à l'identique
    expect(communeNode(c, 'Betaville').getAttribute('aria-pressed')).toBe('true');
    expect(cycleBtn(c).textContent).toContain('Garder la sélection');   // revenu à l'origine
    expect(patchFn).not.toHaveBeenCalled();
  });

  it('les communes HORS PROCESS ne sont jamais touchées par la bascule', async () => {
    const { c } = await monter({ A: 'email', D: 'inconnu' });
    act(() => cycleBtn(c).click()); await flush();  // édition
    act(() => toggleBtn(c)!.click()); await flush(); // vider
    expect(communeNode(c, 'Deltaville').getAttribute('aria-disabled')).toBe('true'); // toujours non sélectionnable
    expect(communeNode(c, 'Deltaville').getAttribute('aria-pressed')).toBeNull();     // jamais sélectionnée/désélectionnée
    act(() => toggleBtn(c)!.click()); await flush(); // restaurer
    expect(communeNode(c, 'Deltaville').getAttribute('aria-pressed')).toBeNull();
  });

  it('ENCHAÎNEMENT : vider → sélectionner 2 → valider → seules ces 2 restent sur le rail', async () => {
    const { c, patchFn } = await monter({ A: 'email', B: 'email', C: 'email' }); // 3 sur email
    act(() => cycleBtn(c).click()); await flush();   // édition
    act(() => toggleBtn(c)!.click()); await flush();  // vider
    act(() => { communeNode(c, 'Alphaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); // + A
    act(() => { communeNode(c, 'Betaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush();  // + B
    act(() => cycleBtn(c).click()); await flush();   // VALIDER (removes = {C})
    expect(patchFn).toHaveBeenCalledWith('C', 'inconnu', expect.anything(), expect.anything()); // C retirée du rail → hors process
    expect(patchFn).not.toHaveBeenCalledWith('A', expect.anything(), expect.anything(), expect.anything()); // A conservée
    // après re-chargement : A et B « sur ce rail », C n'y est plus
    expect(communeNode(c, 'Alphaville').getAttribute('aria-label')).toContain('sur ce rail');
    expect(communeNode(c, 'Betaville').getAttribute('aria-label')).toContain('sur ce rail');
    expect(communeNode(c, 'Gammaville').getAttribute('aria-label')).not.toContain('sur ce rail');
  });
});

const emailX = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`K${i}`, 'email'])) as Record<string, string>;
const dialog = (c: HTMLElement) => c.querySelector('[role="alertdialog"]');
const btnTexte = (c: HTMLElement, t: string) => [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(t));

describe('GARDE-FOU — confirmation sur les retraits en masse (seuil 20)', () => {
  it('21 retraits → confirmation demandée, nombre annoncé EXACT, RIEN appliqué avant', async () => {
    const { c, patchFn } = await monter(emailX(21)); // 21 communes sur email
    act(() => cycleBtn(c).click()); await flush();        // édition
    act(() => toggleBtn(c)!.click()); await flush();       // tout désélectionner → 21 retraits en attente
    act(() => cycleBtn(c).click()); await flush();        // Valider
    expect(dialog(c)).toBeTruthy();                        // confirmation demandée
    expect((dialog(c)?.textContent ?? '')).toContain('21 commune(s) vont être retirées');
    expect(patchFn).not.toHaveBeenCalled();               // RIEN appliqué tant qu'on n'a pas confirmé
  });

  it('20 retraits → AUCUNE confirmation, application directe', async () => {
    const { c, patchFn } = await monter(emailX(20)); // 20 = pas STRICTEMENT plus de 20
    act(() => cycleBtn(c).click()); await flush();
    act(() => toggleBtn(c)!.click()); await flush();  // 20 retraits
    act(() => cycleBtn(c).click()); await flush();   // Valider
    expect(dialog(c)).toBeNull();                     // pas de confirmation
    expect(patchFn).toHaveBeenCalledTimes(20);        // appliqué directement (20 désaffectations)
  });

  it('ANNULER la confirmation → aucune écriture, sélection préservée, carte toujours en édition', async () => {
    const { c, patchFn } = await monter(emailX(21));
    act(() => cycleBtn(c).click()); await flush();
    act(() => toggleBtn(c)!.click()); await flush();  // vidé
    act(() => cycleBtn(c).click()); await flush();   // Valider → confirmation
    act(() => btnTexte(c, 'Annuler')!.click()); await flush();
    expect(patchFn).not.toHaveBeenCalled();           // rien écrit
    expect(dialog(c)).toBeNull();                     // confirmation fermée
    expect(cycleBtn(c).textContent).toContain('Valider ma sélection'); // toujours en édition, écart préservé (sélection restée vidée)
    expect(toggleBtn(c)!.textContent).toContain('Tout resélectionner'); // sélection toujours vide
  });

  it('CONFIRMER → application normale (comme sans garde-fou)', async () => {
    const { c, patchFn } = await monter(emailX(21));
    act(() => cycleBtn(c).click()); await flush();
    act(() => toggleBtn(c)!.click()); await flush();  // vidé
    act(() => cycleBtn(c).click()); await flush();   // Valider → confirmation
    act(() => btnTexte(c, 'Confirmer le retrait')!.click()); await flush();
    expect(patchFn).toHaveBeenCalledTimes(21);        // 21 désaffectations appliquées
    expect(dialog(c)).toBeNull();
    expect(cycleBtn(c).textContent).toContain('Modifier la sélection'); // retour au repos
  });

  it('des AJOUTS nombreux sans retrait → aucune confirmation (les ajouts ne comptent pas)', async () => {
    const canaux: Record<string, string | null> = { A: 'email' };
    for (let i = 0; i < 21; i++) canaux[`N${i}`] = null; // 21 communes non affectées, ajoutables
    const { c, patchFn } = await monter(canaux);
    act(() => cycleBtn(c).click()); await flush();   // édition (sélection = {A})
    for (let i = 0; i < 21; i++) { act(() => { communeNode(c, `N${i}`).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
    await flush();
    act(() => cycleBtn(c).click()); await flush();   // Valider : 21 ajouts, 0 retrait
    expect(dialog(c)).toBeNull();                     // AUCUNE confirmation (removes = 0)
    expect(patchFn).toHaveBeenCalled();               // appliqué directement (les ajouts)
  });
});

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

  it('liste dépliable : décompte + noms des communes du rail, MISE À JOUR après validation', async () => {
    const { c } = await monter({ A: 'email', B: 'formulaire' }); // 1 sur email au départ
    const ligne = () => [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Communes sur ce rail'))!;
    expect(ligne().textContent).toContain('(1)');                 // décompte initial (A)
    act(() => ligne().click()); await flush();                    // déplier
    const liste = () => c.querySelector('ul[aria-label^="Communes du rail"]');
    expect((liste()?.textContent ?? '')).toContain('Alphaville');
    expect((liste()?.textContent ?? '')).not.toContain('Betaville');
    // on affecte B à email
    act(() => cycleBtn(c).click()); await flush();
    act(() => { communeNode(c, 'Betaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush();
    act(() => cycleBtn(c).click()); await flush();
    // la liste reflète la nouvelle réalité (2 communes) sans re-déplier
    expect(ligne().textContent).toContain('(2)');
    expect((liste()?.textContent ?? '')).toContain('Betaville');
    expect((liste()?.textContent ?? '')).toContain('Alphaville');
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
