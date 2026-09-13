// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * BUG DES DEUX COMPTEURS. « Futur(s) bâtiment(s) identifié(s) … (d'après les pièces) » = CONSTAT D'ANALYSE (nbBatimentsDetecte, snapshot
 * serveur), immunisé contre les gestes manuels. Le champ « changer le nombre » = corrélé aux cartes réelles (corps.length). On MONTE le bloc
 * (jsdom) et on prouve LE COMPORTEMENT : les deux peuvent différer et l'un ne contamine pas l'autre. Aucun réseau réel (fetch mocké).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
function etat(nbCorps: number, nbDetecte: number | null, nbValide: number | null) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: Array.from({ length: nbCorps }, (_, i) => corps(i + 1)), bornes: bornesTous,
    journal: { parCorps: {}, permis: {} }, naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
    nbBatimentsValide: nbValide, nbBatimentsDetecte: nbDetecte,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
const confirmOrig = window.confirm;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; window.confirm = confirmOrig; });

async function flush(n = 12) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
function saisir(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function champNb(c: HTMLElement): HTMLInputElement { return c.querySelector('input[aria-label="Nouveau nombre de bâtiments"]') as HTMLInputElement; }
function boutonTexte(c: HTMLElement, txt: string): HTMLButtonElement | null {
  return [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(txt)) as HTMLButtonElement | null ?? null;
}
// Le compteur d'ANALYSE affiche-t-il exactement N ? (regex robuste aux espaces, sur le libellé « … dans le permis : N »)
function analyseAffiche(c: HTMLElement, n: number): boolean {
  return new RegExp(`identifié\\(s\\) dans le permis\\s*:\\s*${n}\\b`).test((c.textContent ?? '').replace(/\s+/g, ' '));
}

// Mock stateful : le nombre de cartes (corps) bouge avec + ajouter / supprimer / changer-le-nombre ; nbDetecte (analyse) ne bouge JAMAIS ici.
async function monter(nbCorps: number, nbDetecte: number | null): Promise<{ c: HTMLElement; posts: () => string[] }> {
  const s = { nbCorps, nbDetecte, nbValide: null as number | null };
  const posts: string[] = [];
  global.fetch = vi.fn(async (_u: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') {
      const body = JSON.parse(opts!.body ?? '{}'); posts.push(body.action);
      if (body.action === 'creer') s.nbCorps += 1;
      else if (body.action === 'supprimer') s.nbCorps = Math.max(0, s.nbCorps - 1);
      else if (body.action === 'nb_batiments') { s.nbCorps = body.nombre; s.nbValide = body.nombre; } // le manuel bouge cartes+validé, JAMAIS le détecté
      return { ok: true, json: async () => ({ ok: true, cree: 0, retire: 0 }) } as unknown as Response;
    }
    return { ok: true, json: async () => etat(s.nbCorps, s.nbDetecte, s.nbValide) } as unknown as Response;
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

describe('deux compteurs — analyse (constat) vs manuel (cartes réelles)', () => {
  it('les deux DIFFÈRENT sans contamination : analyse = 4 (d’après les pièces), champ manuel = 2 (cartes réelles)', async () => {
    const { c } = await monter(2, 4);
    expect(analyseAffiche(c, 4)).toBe(true);   // compteur d'analyse = nbBatimentsDetecte, PAS corps.length
    expect(champNb(c).value).toBe('2');         // champ manuel = nombre de cartes réelles
  });

  it('« + ajouter un bâtiment » ne change PAS le compteur d’analyse, mais incrémente le manuel', async () => {
    const { c } = await monter(2, 4);
    act(() => { boutonTexte(c, '+ ajouter un bâtiment')!.click(); }); await flush();
    expect(analyseAffiche(c, 4)).toBe(true);   // analyse inchangée
    expect(champNb(c).value).toBe('3');         // manuel +1
  });

  it('« supprimer ce bâtiment » ne change PAS le compteur d’analyse, mais décrémente le manuel', async () => {
    window.confirm = () => true; // supprimer demande confirmation
    const { c } = await monter(2, 4);
    act(() => { boutonTexte(c, 'supprimer ce bâtiment')!.click(); }); await flush();
    expect(analyseAffiche(c, 4)).toBe(true);   // analyse inchangée
    expect(champNb(c).value).toBe('1');         // manuel −1
  });

  it('changer le nombre via le bouton ne change PAS le compteur d’analyse', async () => {
    const { c } = await monter(2, 4);
    act(() => { boutonTexte(c, 'Modifier le nombre')!.click(); }); await flush(); // ouvre l'édition
    saisir(champNb(c), '5'); await flush();
    act(() => { boutonTexte(c, 'valider nouvelle valeur')!.click(); }); await flush();
    expect(analyseAffiche(c, 4)).toBe(true);   // analyse TOUJOURS 4, malgré le passage à 5 côté manuel
    expect(champNb(c).value).toBe('5');
  });

  it('une valeur d’analyse différente s’affiche telle quelle (le compteur reflète l’analyse)', async () => {
    const { c } = await monter(2, 6); // une analyse ayant détecté 6
    expect(analyseAffiche(c, 6)).toBe(true);
    expect(champNb(c).value).toBe('2');
  });

  it('aucune valeur d’analyse (null) → « aucun futur bâtiment identifié dans les pièces » (jamais corps.length)', async () => {
    const { c } = await monter(3, null);
    expect((c.textContent ?? '')).toContain('aucun futur bâtiment identifié dans les pièces');
    expect(analyseAffiche(c, 3)).toBe(false);   // surtout PAS le comptage des cartes (3)
  });

  it('ajout PENDANT l’édition : la référence du cycle est recalée → le bouton ne réclame pas de validation', async () => {
    const { c } = await monter(2, 4);
    act(() => { boutonTexte(c, 'Modifier le nombre')!.click(); }); await flush(); // édition ; valeur = 2 = origine → « Garder la valeur »
    expect(boutonTexte(c, 'Garder la valeur')).not.toBeNull();
    act(() => { boutonTexte(c, '+ ajouter un bâtiment')!.click(); }); await flush(); // carte ajoutée pendant l'édition
    expect(champNb(c).value).toBe('3');                       // référence recalée sur le réel
    expect(boutonTexte(c, 'Garder la valeur')).not.toBeNull(); // toujours « Garder la valeur », PAS « valider nouvelle valeur »
    expect(boutonTexte(c, 'valider nouvelle valeur')).toBeNull();
  });
});
