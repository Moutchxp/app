// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';
import type { FraicheurBatimentsLive } from './statutBatimentsProjection';

/**
 * (C) remontée de FRAÎCHEUR (② enregistré à jour — Y COMPRIS « jamais enregistré » ; ① altitude à valider) + (B2) garde du bouton d'altitude
 * + (A) bouton d'enregistrement « jamais enregistré ». On MONTE CaracteristiquesBloc (montable ; ProjectionVue ne l'est pas — cf.
 * ProjectionVue.oscillationEtat) et on prouve LE COMPORTEMENT ; le durcissement des titres se fait via le module pur statutBatimentsProjection
 * (testé à part). « Jamais enregistré » = valeurs restées en origine 'extraite' (jamais confirmées humainement). Aucun réseau réel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));
const libelle = (cle: string) => MESURES.find((m) => m.cle === cle)!.libelle;

// Corps json_build_object (mesures = NOMBRES). `origine` = origine des mesures écrites par le bouton ('saisie' = enregistré, 'extraite' = jamais).
function corps(opts: { id?: number; repere?: string; origine?: 'saisie' | 'extraite'; confirmeLe?: string | null; sommet?: number }) {
  const o = opts.origine ?? 'saisie';
  return {
    id: opts.id ?? 5, repere: opts.repere ?? 'B1',
    nbEtages: 3, nbEtagesOrigine: o, nbNiveauxSousSol: 1, nbNiveauxSousSolOrigine: o,
    altitudeDernierPlancherNgf: 10, altitudeDernierPlancherNgfOrigine: o,
    altitudeSommetNgf: opts.sommet ?? 20, altitudeSommetNgfOrigine: o,
    altitudeSommetNgfConfirmeLe: opts.confirmeLe ?? null, altitudeSommetNgfConfirmePar: opts.confirmeLe ? '2' : null, altitudeSommetNgfConfirmeParNom: opts.confirmeLe ? 'Arnaud Jorel' : null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: o, majLe: null, majPar: null,
  };
}
function etatAvec(...cs: object[]) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: cs, bornes: bornesTous, journal: { parCorps: {}, permis: {} },
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

async function monter(etatObj: object, onFraicheur?: (f: FraicheurBatimentsLive) => void): Promise<HTMLElement> {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => etatObj } as unknown as Response)) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468, onFraicheur })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const btn = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('futurs bâtiments'));
  if (btn) await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return container;
}

describe('(C) remontée de la fraîcheur — cas OBLIGATOIRES', () => {
  it('bâtiment JAMAIS enregistré (valeurs extraites) + altitude validée → « à enregistrer », PAS « à valider »', async () => {
    let d: FraicheurBatimentsLive | null = null;
    await monter(etatAvec(corps({ origine: 'extraite', confirmeLe: '2026-08-20T10:00:00Z' })), (f) => { d = f; });
    expect(d!.aEnregistrer).toContain('B1');        // jamais confirmé humainement
    expect(d!.altitudeAValider).toEqual([]);         // l'altitude EST validée et à jour
  });

  it('bâtiment enregistré (saisie) + altitude JAMAIS validée → « à valider », PAS « à enregistrer »', async () => {
    let d: FraicheurBatimentsLive | null = null;
    await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: null })), (f) => { d = f; });
    expect(d!.aEnregistrer).toEqual([]);
    expect(d!.altitudeAValider).toContain('B1');     // jamais validée
    expect(d!.altitudeModifiee).toEqual([]);          // jamais validée ≠ validée-puis-modifiée (pour « Bâtiments et projection »)
  });

  it('les DEUX faites (enregistré + altitude validée à jour) → aucune fraîcheur', async () => {
    let d: FraicheurBatimentsLive | null = null;
    await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: '2026-08-20T10:00:00Z' })), (f) => { d = f; });
    expect(d!.aEnregistrer).toEqual([]);
    expect(d!.altitudeAValider).toEqual([]);
  });

  it('plusieurs bâtiments, un seul en défaut → seul CELUI-LÀ est nommé', async () => {
    let d: FraicheurBatimentsLive | null = null;
    await monter(etatAvec(
      corps({ id: 5, repere: 'B1', origine: 'saisie', confirmeLe: '2026-08-20T10:00:00Z' }), // conforme
      corps({ id: 6, repere: 'B2', origine: 'extraite', confirmeLe: '2026-08-20T10:00:00Z' }), // jamais enregistré
    ), (f) => { d = f; });
    expect(d!.aEnregistrer).toEqual(['B2']);
    expect(d!.altitudeAValider).toEqual([]);
  });

  it('altitude validée PUIS modifiée → « à valider » ET « altitudeModifiee » (pour « Bâtiments et projection »)', async () => {
    let d: FraicheurBatimentsLive | null = null;
    const c = await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: '2026-08-20T10:00:00Z' })), (f) => { d = f; });
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '25');
    expect(d!.altitudeAValider).toContain('B1');
    expect(d!.altitudeModifiee).toContain('B1'); // validée EN BASE mais modifiée → compte aussi pour « Bâtiments et projection »
  });
});

describe('(A) bouton « Enregistrer ce bâtiment » — le cas « jamais enregistré »', () => {
  function libelleBoutonEnr(c: HTMLElement): string | null {
    const b = [...c.querySelectorAll('button')].find((x) => /Enregistrer ce bâtiment|Bâtiment enregistré/.test(x.textContent ?? ''));
    return b ? (b.textContent ?? '').trim() : null;
  }
  it('valeurs encore extraites (jamais enregistré) → bouton ROUGE « Enregistrer ce bâtiment » DÈS le chargement', async () => {
    const c = await monter(etatAvec(corps({ origine: 'extraite', confirmeLe: null })));
    expect(libelleBoutonEnr(c)).toBe('Enregistrer ce bâtiment');
  });
  it('valeurs confirmées (saisie) et à jour → bouton VERT « Bâtiment enregistré »', async () => {
    const c = await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: null })));
    expect(libelleBoutonEnr(c)).toBe('Bâtiment enregistré');
  });
});

describe('(B2) garde — bouton d’altitude (déjà conforme, non-régression)', () => {
  function libelleBoutonAltitude(c: HTMLElement): string | null {
    const b = [...c.querySelectorAll('button')].find((x) => /Altitude validée|Valider cette altitude/.test(x.textContent ?? ''));
    return b ? (b.textContent ?? '').trim() : null;
  }
  it('altitude validée en base et valeur inchangée → « Altitude validée » + « ✓ validée par … »', async () => {
    const c = await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: '2026-08-20T10:00:00Z' })));
    expect(libelleBoutonAltitude(c)).toBe('Altitude validée');
    expect(c.textContent ?? '').toContain('✓ validée par Arnaud Jorel');
  });
  it('valeur du sommet modifiée → « Valider cette altitude » et la mention « validée » disparaît', async () => {
    const c = await monter(etatAvec(corps({ origine: 'saisie', confirmeLe: '2026-08-20T10:00:00Z' })));
    saisir(inputParLabel(c, libelle('altitudeSommetNgf')), '25');
    expect(libelleBoutonAltitude(c)).toBe('Valider cette altitude');
    expect(c.textContent ?? '').not.toContain('✓ validée par Arnaud Jorel');
  });
});
