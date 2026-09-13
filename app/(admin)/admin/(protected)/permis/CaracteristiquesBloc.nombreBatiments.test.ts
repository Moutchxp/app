// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * (C) — CYCLE À TROIS TEMPS du nombre de bâtiments. On MONTE le bloc (jsdom) et on prouve LE COMPORTEMENT (libellé du bouton, champ
 * actif/inactif, confirmation, application), jamais une couleur/classe. L'APPLICATION métier est inchangée (POST nb_batiments) : on la
 * simule par un mock qui met le nombre RÉEL de cartes à la valeur soumise (comme le ferait le serveur), pour éprouver la confirmation.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPOS = 'modifier nombre de bâtiment(s) du permis de construire';
const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

function corps(id: number) {
  return {
    id, repere: `B${id}`, nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: null, altitudeDernierPlancherNgfOrigine: null, altitudeSommetNgf: null, altitudeSommetNgfOrigine: null,
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null, altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null, altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null,
  };
}
function etat(nbCorps: number) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: Array.from({ length: nbCorps }, (_, i) => corps(i + 1)), bornes: bornesTous,
    journal: { parCorps: {}, permis: {} }, naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
    nbBatimentsValide: null,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

async function flush(n = 12) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
function saisir(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function champNb(c: HTMLElement): HTMLInputElement { return c.querySelector('input[aria-label="Nouveau nombre de bâtiments"]') as HTMLInputElement; }
function boutonNb(c: HTMLElement): HTMLButtonElement {
  const b = [...c.querySelectorAll('button')].find((x) => new RegExp(`${REPOS.replace(/[()]/g, '\\$&')}|valider nouvelle valeur`).test(x.textContent ?? ''));
  if (!b) throw new Error('bouton du nombre introuvable');
  return b as HTMLButtonElement;
}

async function monter(): Promise<{ c: HTMLElement; posts: () => number }> {
  const state = { nb: 1 };
  let posts = 0;
  global.fetch = vi.fn(async (_u: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') {
      posts++;
      const body = JSON.parse(opts!.body ?? '{}');
      if (body.action === 'nb_batiments') { const cible = body.nombre as number; const cree = Math.max(0, cible - state.nb); state.nb = cible; return { ok: true, json: async () => ({ ok: true, cree, retire: 0 }) } as unknown as Response; }
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, json: async () => etat(state.nb) } as unknown as Response;
  }) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468 })); });
  await flush();
  const b = [...container.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('futurs bâtiments'));
  if (b) await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  return { c: container, posts: () => posts };
}

describe('(C) — cycle à trois temps du nombre de bâtiments', () => {
  it('au chargement : champ INACTIF + bouton au libellé de repos', async () => {
    const { c } = await monter();
    expect(champNb(c).disabled).toBe(true);
    expect(boutonNb(c).textContent).toContain(REPOS);
  });

  it('un clic ACTIVE le champ ; le bouton reste au repos tant que la valeur est inchangée', async () => {
    const { c } = await monter();
    act(() => { boutonNb(c).click(); }); await flush();
    expect(champNb(c).disabled).toBe(false);            // édition
    expect(boutonNb(c).textContent).toContain(REPOS);   // valeur == origine → pas encore « valider »
  });

  it('saisir une valeur DIFFÉRENTE fait passer le bouton à « valider nouvelle valeur »', async () => {
    const { c } = await monter();
    act(() => { boutonNb(c).click(); }); await flush();
    saisir(champNb(c), '2'); await flush();
    expect(boutonNb(c).textContent).toContain('valider nouvelle valeur');
  });

  it('valider applique la valeur, affiche la confirmation, revient au repos et re-verrouille le champ', async () => {
    const { c } = await monter();
    act(() => { boutonNb(c).click(); }); await flush();
    saisir(champNb(c), '2'); await flush();
    act(() => { boutonNb(c).click(); }); await flush();
    expect(c.textContent ?? '').toContain('Nouvelle valeur enregistrée.'); // confirmation verte
    expect(boutonNb(c).textContent).toContain(REPOS);                      // libellé de repos revenu
    expect(champNb(c).disabled).toBe(true);                                // champ re-verrouillé
    expect(champNb(c).value).toBe('2');                                     // le nombre réel a bien changé
  });

  it('revenir à la valeur d’origine pendant l’édition ramène le libellé de repos', async () => {
    const { c } = await monter();
    act(() => { boutonNb(c).click(); }); await flush();
    saisir(champNb(c), '5'); await flush();
    expect(boutonNb(c).textContent).toContain('valider nouvelle valeur');
    saisir(champNb(c), '1'); await flush();               // retour à l'origine (1)
    expect(boutonNb(c).textContent).toContain(REPOS);
  });

  it('cliquer sans avoir rien changé REFERME le champ sans rien appliquer', async () => {
    const { c, posts } = await monter();
    act(() => { boutonNb(c).click(); }); await flush();   // ouvre l'édition
    expect(champNb(c).disabled).toBe(false);
    act(() => { boutonNb(c).click(); }); await flush();   // re-clic sans changement → referme
    expect(champNb(c).disabled).toBe(true);
    expect(posts()).toBe(0);                               // AUCUNE application
    expect(c.textContent ?? '').not.toContain('Nouvelle valeur enregistrée.');
  });
});
