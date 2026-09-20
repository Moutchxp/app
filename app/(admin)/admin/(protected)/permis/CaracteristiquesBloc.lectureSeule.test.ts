// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * RATT-EDIT (lot B2) — `lectureSeule` VERROUILLE l'édition (défaut dans Rattachement tant que « Modifier » n'a pas déverrouillé). On MONTE
 * réellement le bloc (jsdom), fetch mocké. On PROUVE le COMPORTEMENT, jamais une classe/couleur :
 *   · lectureSeule → les commandes d'écriture sont dans un <fieldset disabled> ET un clic sur « Enregistrer ce bâtiment » n'émet AUCUN POST
 *     (garde défense-en-profondeur `poster`) → l'altitude d'un permis validé ne bouge pas par inadvertance ;
 *   · sans lectureSeule (les 4 autres vues) → le même clic émet bien un POST (comportement d'édition INCHANGÉ).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

function corpsInitial() {
  return {
    id: 5, repere: 'B1',
    nbEtages: 3, nbEtagesOrigine: 'saisie', nbNiveauxSousSol: 1, nbNiveauxSousSolOrigine: 'saisie',
    altitudeDernierPlancherNgf: 10, altitudeDernierPlancherNgfOrigine: 'saisie',
    altitudeSommetNgf: 20, altitudeSommetNgfOrigine: 'saisie',
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: '1 rue de la Paix', adresseOrigine: 'saisie', majLe: null, majPar: null,
  };
}
function etatCharge() {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: [corpsInitial()], bornes: bornesTous,
    journal: { parCorps: {}, permis: {} },
    naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
  };
}

let root: Root | null = null;
let hote: HTMLDivElement | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; hote?.remove(); hote = null; global.fetch = fetchOrig; });

async function monter(props: { lectureSeule?: boolean }): Promise<{ c: HTMLElement; getPosts: () => number }> {
  let posts = 0;
  global.fetch = vi.fn(async (_url: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') { posts++; return { ok: true, json: async () => ({ ok: true }) } as Response; }
    return { ok: true, json: async () => etatCharge() } as Response;
  }) as unknown as typeof fetch;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 531, avecEtatFamilles: true, ...props })); });
  // Déplie le cartouche « Les futurs bâtiments » pour matérialiser le bouton « Enregistrer ce bâtiment » (BlocRepliable, lazy).
  const titre = [...hote.querySelectorAll('button')].find((b) => /Les futurs bâtiments/.test(b.textContent ?? ''));
  if (titre) await act(async () => { titre.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return { c: hote, getPosts: () => posts };
}
const boutonEnregistrer = (c: HTMLElement) =>
  [...c.querySelectorAll('button')].find((b) => /Enregistrer ce bâtiment|Bâtiment enregistré/.test(b.textContent ?? '')) as HTMLButtonElement | undefined;

describe('CaracteristiquesBloc — lectureSeule verrouille l’édition (B2)', () => {
  it('lectureSeule : « Enregistrer ce bâtiment » est dans un <fieldset disabled> ET un clic n’émet AUCUN POST', async () => {
    const { c, getPosts } = await monter({ lectureSeule: true });
    const b = boutonEnregistrer(c);
    expect(b, 'le bouton doit être rendu (consultation), mais désactivé').toBeTruthy();
    const fs = b!.closest('fieldset');
    expect(fs, 'le bouton est enveloppé par une ZoneEditable (fieldset)').not.toBeNull();
    expect((fs as HTMLFieldSetElement).disabled).toBe(true);
    await act(async () => { b!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(getPosts(), 'aucune écriture en lecture seule').toBe(0);
  });

  it('sans lectureSeule (défaut, les 4 autres vues) : le même clic émet bien un POST (édition inchangée)', async () => {
    const { c, getPosts } = await monter({});
    const b = boutonEnregistrer(c);
    expect(b).toBeTruthy();
    const fs = b!.closest('fieldset');
    expect(fs === null || !(fs as HTMLFieldSetElement).disabled, 'non verrouillé par défaut').toBe(true);
    await act(async () => { b!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(getPosts(), 'l’écriture part normalement').toBeGreaterThanOrEqual(1);
  });
});
