// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * RÉGRESSION (dossier 468) — la PROPOSITION IA du sommet doit apparaître MÊME quand la valeur lue est journalisée au niveau PERMIS
 * (corps_id NULL) et que la valeur du CHAMP appartient au CORPS. On MONTE `CaracteristiquesBloc` avec un fetch mocké reproduisant
 * l'état réel du dossier 468 (corps 5 = 107,04 « à confirmer » ; journal permis = IA 122,65 ; journal corps 5 = motifs 107,04) et on
 * prouve que le bloc « utiliser la valeur IA (122.65) » s'affiche bien sur le champ sommet du bâtiment. Aucun réseau réel, aucun
 * service payant : `fetch` est mocké. Ce test VERROUILLE le repli permis→corps (CaracteristiquesBloc.tsx : `iaSommetDe(journalCorps)
 * ?? iaSommetDe(data.journal.permis)`), que la demande soupçonnait manquant.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));
const champVide = { confiance: null, reserve: null, provenances: [], ecartes: [], motif: null, methode: null, valeurRetenue: null };

function corps(sommet: number, plancher: number) {
  return {
    id: 5, repere: null,
    nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: plancher, altitudeDernierPlancherNgfOrigine: 'extraite' as const,
    altitudeSommetNgf: sommet, altitudeSommetNgfOrigine: 'extraite' as const,
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null,
  };
}

function etat(opts: { sommet: number; plancher: number; journalCorps?: object; journalPermis?: object }) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null,
    corps: [corps(opts.sommet, opts.plancher)],
    bornes: bornesTous,
    journal: {
      parCorps: opts.journalCorps ? { 5: { altitude_sommet_ngf: opts.journalCorps } } : {},
      permis: opts.journalPermis ? { altitude_sommet_ngf: opts.journalPermis } : {},
    },
    naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

async function monter(e: object): Promise<HTMLElement> {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => e })) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468 })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return container;
}

describe('RÉGRESSION 468 — la valeur IA au niveau PERMIS est proposée sur le champ SOMMET du bâtiment', () => {
  beforeEach(() => { global.fetch = fetchOrig; });

  it('journal permis = IA 122,65 / champ corps = 107,04 → « utiliser la valeur IA (122.65) » s’affiche', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: { ...champVide, confiance: 'a_verifier', methode: 'motifs', valeurRetenue: 107.04, provenances: [{ piece: 'MOUZAIA_PC3.pdf', page: 1 }] },
      journalPermis: { ...champVide, confiance: 'a_verifier', methode: 'ia', valeurRetenue: 122.65, provenances: [{ piece: 'MOUZAIA_PC5.pdf', page: 3 }] },
    }));
    const t = c.textContent ?? '';
    expect(t).toContain('utiliser la valeur IA (122.65)');
    expect(t).toContain('l’analyse IA a lu');
    c.remove();
  });

  it('valeur IA lue au niveau CORPS (methode ia) → proposée aussi', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: { ...champVide, confiance: 'a_verifier', methode: 'ia', valeurRetenue: 121.10, provenances: [{ piece: 'X.pdf', page: 2 }] },
    }));
    expect(c.textContent ?? '').toContain('utiliser la valeur IA (121.1)');
    c.remove();
  });

  it('valeur IA IDENTIQUE à la valeur du champ → AUCUNE proposition', async () => {
    const c = await monter(etat({
      sommet: 122.65, plancher: 115.68,
      journalPermis: { ...champVide, confiance: 'a_verifier', methode: 'ia', valeurRetenue: 122.65, provenances: [{ piece: 'MOUZAIA_PC5.pdf', page: 3 }] },
    }));
    expect(c.textContent ?? '').not.toContain('utiliser la valeur IA');
    c.remove();
  });

  it('aucune valeur IA au journal → AUCUNE proposition', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: { ...champVide, confiance: 'a_verifier', methode: 'motifs', valeurRetenue: 107.04, provenances: [{ piece: 'MOUZAIA_PC3.pdf', page: 1 }] },
    }));
    expect(c.textContent ?? '').not.toContain('utiliser la valeur IA');
    c.remove();
  });
});
