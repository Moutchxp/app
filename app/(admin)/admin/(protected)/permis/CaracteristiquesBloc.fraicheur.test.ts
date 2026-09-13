// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';
import type { FraicheurBatimentsLive } from './statutBatimentsProjection';

/**
 * (C) remontée de FRAÎCHEUR + (B2) garde du bouton d'altitude. On MONTE CaracteristiquesBloc (montable, contrairement à ProjectionVue qui
 * importe BlocTraceEmprise/pdfjs — cf. ProjectionVue.oscillationEtat.test) et on prouve LE COMPORTEMENT : la fraîcheur remontée au parent
 * (qui, lui, DURCIT le statut « Bâtiments et projection » via le module pur statutBatimentsProjection, testé à part). Aucun réseau réel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));
const libelle = (cle: string) => MESURES.find((m) => m.cle === cle)!.libelle;

function corps(opts: { confirmeLe?: string | null; confirmeParNom?: string | null }) {
  return {
    id: 5, repere: 'B1',
    nbEtages: 3, nbEtagesOrigine: 'saisie', nbNiveauxSousSol: 1, nbNiveauxSousSolOrigine: 'saisie',
    altitudeDernierPlancherNgf: 10, altitudeDernierPlancherNgfOrigine: 'saisie',
    altitudeSommetNgf: 20, altitudeSommetNgfOrigine: 'saisie',
    altitudeSommetNgfConfirmeLe: opts.confirmeLe ?? null, altitudeSommetNgfConfirmePar: opts.confirmeLe ? '2' : null, altitudeSommetNgfConfirmeParNom: opts.confirmeParNom ?? null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: '1 rue de la Paix', adresseOrigine: 'saisie', majLe: null, majPar: null,
  };
}
function etatAvec(c: object) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: [c], bornes: bornesTous, journal: { parCorps: {}, permis: {} },
    naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

function saisir(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function inputParLabel(c: HTMLElement, label: string): HTMLInputElement {
  const el = [...c.querySelectorAll('input')].find((i) => i.getAttribute('aria-label') === label);
  if (!el) throw new Error(`input introuvable: ${label}`);
  return el as HTMLInputElement;
}

async function monter(c: object, onFraicheur?: (f: FraicheurBatimentsLive) => void): Promise<HTMLElement> {
  const etatCourant = etatAvec(c);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => etatCourant } as unknown as Response)) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468, onFraicheur })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const btn = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('futurs bâtiments'));
  if (btn) await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return container;
}

describe('(C) — remontée de la fraîcheur au parent (onFraicheur)', () => {
  it('au chargement, aucune fraîcheur en attente (listes vides)', async () => {
    let dernier: FraicheurBatimentsLive | null = null;
    await monter(corps({}), (f) => { dernier = f; });
    expect(dernier).not.toBeNull();
    expect(dernier!.aEnregistrer).toEqual([]);
    expect(dernier!.altitudeARevalider).toEqual([]);
  });

  it('modifier un champ enregistré → le bâtiment remonte dans « à enregistrer » (nommé) ; revenir à l’origine le retire', async () => {
    let dernier: FraicheurBatimentsLive | null = null;
    const c = await monter(corps({}), (f) => { dernier = f; });
    saisir(inputParLabel(c, libelle('nbEtages')), '4');
    expect(dernier!.aEnregistrer).toContain('B1');
    saisir(inputParLabel(c, libelle('nbEtages')), '3');
    expect(dernier!.aEnregistrer).toEqual([]);
  });

  it('modifier une altitude VALIDÉE en base → le bâtiment remonte dans « à revalider » (le serveur ne le voit pas)', async () => {
    let dernier: FraicheurBatimentsLive | null = null;
    const c = await monter(corps({ confirmeLe: '2026-09-08T10:00:00Z', confirmeParNom: 'Arnaud Jorel' }), (f) => { dernier = f; });
    expect(dernier!.altitudeARevalider).toEqual([]); // à jour au chargement
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '25');
    expect(dernier!.altitudeARevalider).toContain('B1');
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '20'); // valeur validée d'origine
    expect(dernier!.altitudeARevalider).toEqual([]);
  });

  it('une altitude JAMAIS validée modifiée ne compte PAS comme « à revalider » (déjà comptée côté serveur)', async () => {
    let dernier: FraicheurBatimentsLive | null = null;
    const c = await monter(corps({ confirmeLe: null }), (f) => { dernier = f; });
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '25');
    expect(dernier!.altitudeARevalider).toEqual([]); // pas de confirmeLe → pas « à revalider »
  });
});

describe('(B2) garde — le bouton d’altitude reste conforme (valider → vert ; modifier → rouge, mention retirée)', () => {
  function libelleBoutonAltitude(c: HTMLElement): string | null {
    const b = [...c.querySelectorAll('button')].find((x) => /Altitude validée|Valider cette altitude/.test(x.textContent ?? ''));
    return b ? (b.textContent ?? '').trim() : null;
  }
  it('altitude validée en base et valeur inchangée → « Altitude validée » + mention « ✓ validée par … »', async () => {
    const c = await monter(corps({ confirmeLe: '2026-09-08T10:00:00Z', confirmeParNom: 'Arnaud Jorel' }));
    expect(libelleBoutonAltitude(c)).toBe('Altitude validée');
    expect(c.textContent ?? '').toContain('✓ validée par Arnaud Jorel');
  });
  it('modifier la valeur du sommet → « Valider cette altitude » et la mention « validée » ne prétend plus couvrir la nouvelle valeur', async () => {
    const c = await monter(corps({ confirmeLe: '2026-09-08T10:00:00Z', confirmeParNom: 'Arnaud Jorel' }));
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '25');
    expect(libelleBoutonAltitude(c)).toBe('Valider cette altitude');
    expect(c.textContent ?? '').not.toContain('✓ validée par Arnaud Jorel');
  });
});
