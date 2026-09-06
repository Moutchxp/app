// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * RÉGRESSION (dossier 468) — la PROPOSITION IA du sommet doit apparaître quand la valeur lue par l'IA est journalisée au niveau
 * PERMIS (corps_id NULL) et que la valeur du CHAMP appartient au CORPS.
 *
 * ⚠️ CE TEST PART DES TYPES QUE LA ROUTE RENVOIE RÉELLEMENT (mesuré sur le dossier 468, chemin réel) — c'est le point qui manquait à
 * la version précédente (elle fabriquait des NOMBRES et passait à tort) :
 *   • le JOURNAL vient d'un SELECT brut → `pg` renvoie les colonnes `numeric` comme des CHAÎNES : `valeurRetenue` vaut '122.65'
 *     (string), PAS 122.65 (number). C'est ce qui cassait `Number.isFinite(valeurIA)` côté ChampMesureEditeur.
 *   • l'objet CORPS vient d'un `json_build_object` → `altitudeSommetNgf`/`altitudeDernierPlancherNgf` sont bien des NOMBRES.
 * Si la coercion string→number disparaît du code, `Number.isFinite('122.65') === false` → aucune proposition → CE TEST ÉCHOUE.
 * Aucun réseau réel, aucun service payant : `fetch` est mocké.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

// Champ de journal TEL QUE LA ROUTE LE REND : `valeurRetenue` est une CHAÎNE (numeric pg), le reste est fidèle à construireJournalChamp.
function champJournal(methode: string, valeurStr: string, piece: string, page: number) {
  return { confiance: 'a_verifier', reserve: null, provenances: [{ piece, page }], ecartes: [], motif: null, methode, valeurRetenue: valeurStr };
}

// Corps TEL QUE json_build_object le rend : altitudes = NOMBRES.
function corps(sommet: number, plancher: number) {
  return {
    id: 5, repere: null,
    nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: plancher, altitudeDernierPlancherNgfOrigine: 'extraite',
    altitudeSommetNgf: sommet, altitudeSommetNgfOrigine: 'extraite',
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null,
  };
}

function etat(opts: { sommet: number; plancher: number; journalCorps?: object; journalPermis?: object }): object {
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

describe('RÉGRESSION 468 — valeur IA (numeric pg = CHAÎNE) au niveau PERMIS proposée sur le champ SOMMET du bâtiment', () => {
  beforeEach(() => { global.fetch = fetchOrig; });

  it('config EXACTE du 468 : champ 107,04 (number) ; journal permis IA "122.65" (string) ; journal corps motifs "107.04" → proposition affichée', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: champJournal('motifs', '107.04', 'MOUZAIA_PC3.pdf', 1),
      journalPermis: champJournal('ia', '122.65', 'MOUZAIA_PC5.pdf', 3),
    }));
    const t = c.textContent ?? '';
    expect(t).toContain('l’analyse IA a lu');
    expect(t).toContain('utiliser la valeur IA (122.65)'); // ← invisible avant le correctif (Number.isFinite('122.65') === false)
    c.remove();
  });

  it('valeur IA lue au niveau CORPS (methode ia, chaîne "121.10") → proposée aussi', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: champJournal('ia', '121.10', 'X.pdf', 2),
    }));
    expect(c.textContent ?? '').toContain('utiliser la valeur IA (121.1)');
    c.remove();
  });

  it('valeur IA IDENTIQUE à la valeur du champ (chaîne "122.65" vs nombre 122.65) → AUCUNE proposition', async () => {
    const c = await monter(etat({
      sommet: 122.65, plancher: 115.68,
      journalPermis: champJournal('ia', '122.65', 'MOUZAIA_PC5.pdf', 3),
    }));
    expect(c.textContent ?? '').not.toContain('utiliser la valeur IA');
    c.remove();
  });

  it('aucune valeur IA au journal → AUCUNE proposition', async () => {
    const c = await monter(etat({
      sommet: 107.04, plancher: 115.68,
      journalCorps: champJournal('motifs', '107.04', 'MOUZAIA_PC3.pdf', 1),
    }));
    expect(c.textContent ?? '').not.toContain('utiliser la valeur IA');
    c.remove();
  });
});
