import { describe, it, expect } from 'vitest';
import { decisionInstruireTeleservice, mapperDestinationTeleservice, type EntreeDecision, type EtatCible } from './decisionTeleservice';
import type { ValeursGenerees } from './descriptionScission';

/** CR-3 — décision PURE. On assertionne le COMPORTEMENT (écrit / écarté + motif), jamais la forme d'un SQL. */

const VIDE: EtatCible = { valeur: null, origine: null, proprietaire: null };
const val = (v: ValeursGenerees): ValeursGenerees => v;
const base = (o: Partial<EntreeDecision>): EntreeDecision => ({
  valeurs: { niveauxHorsSol: null, niveauxSousSol: null, destination: null, surfaceCreeeM2: null },
  divergenceEtages: false, nbCorps: 1, etatEtages: VIDE, etatSousSol: VIDE, etatDestinations: VIDE, ...o,
});
const dEtages = (ds: ReturnType<typeof decisionInstruireTeleservice>) => ds.find((d) => d.champ === 'nb_etages');
const dDest = (ds: ReturnType<typeof decisionInstruireTeleservice>) => ds.find((d) => d.champ === 'destinations');

describe('nb_etages — R+N direct (N de R+N, RDC exclu)', () => {
  it('champ VIDE → écrit N (aucune conversion)', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }) })));
    expect(d).toMatchObject({ action: 'ecrire', valeurNombre: 4 });
  });
  it('champ déjà SAISIE → écarté (jamais écrasé)', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }), etatEtages: { valeur: 6, origine: 'saisie', proprietaire: null } })));
    expect(d?.action).toBe('ecartee');
    expect(d?.motif).toMatch(/saisi/i);
  });
  it('champ détenu par une méthode supérieure (enonce) → écarté', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }), etatEtages: { valeur: 5, origine: 'extraite', proprietaire: 'enonce' } })));
    expect(d?.action).toBe('ecartee');
  });
  it('déjà détenu par teleservice → ré-écriture idempotente autorisée', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }), etatEtages: { valeur: 4, origine: 'extraite', proprietaire: 'teleservice' } })));
    expect(d?.action).toBe('ecrire');
  });
  it('DIVERGENCE avec l’humain (cas 470) → écarté, rien écrit pour les étages', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }), divergenceEtages: true })));
    expect(d?.action).toBe('ecartee');
    expect(d?.motif).toMatch(/divergence/i);
  });
  it('DEUX bâtiments → écarté (attribution non résolue)', () => {
    const d = dEtages(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }), nbCorps: 2 })));
    expect(d?.action).toBe('ecartee');
    expect(d?.motif).toMatch(/attribution par bâtiment/i);
  });
});

describe('nb_niveaux_sous_sol', () => {
  it('champ vide, 1 bâtiment → écrit', () => {
    const ds = decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: null, niveauxSousSol: 1, destination: null, surfaceCreeeM2: null }) }));
    expect(ds.find((d) => d.champ === 'nb_niveaux_sous_sol')).toMatchObject({ action: 'ecrire', valeurNombre: 1 });
  });
  it('deux bâtiments → écarté', () => {
    const ds = decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: null, niveauxSousSol: 1, destination: null, surfaceCreeeM2: null }), nbCorps: 2 }));
    expect(ds.find((d) => d.champ === 'nb_niveaux_sous_sol')?.action).toBe('ecartee');
  });
});

describe('destination — mapping fermé vers le CHECK', () => {
  it('« habitation » → Logement (mapping explicite)', () => {
    expect(mapperDestinationTeleservice("d'habitation")).toBe('Logement');
    expect(mapperDestinationTeleservice('à destination d’habitation')).toBe('Logement');
    const d = dDest(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: null, niveauxSousSol: null, destination: "d'habitation", surfaceCreeeM2: null }) })));
    expect(d).toMatchObject({ action: 'ecrire', valeurTexte: ['Logement'] });
  });
  it('destination HORS nomenclature → jamais écrite (écartée)', () => {
    expect(mapperDestinationTeleservice('de commerce de gros mixte')).toBeNull();
    expect(mapperDestinationTeleservice('null')).toBeNull();
    const d = dDest(decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: null, niveauxSousSol: null, destination: 'quelque chose', surfaceCreeeM2: null }) })));
    expect(d?.action).toBe('ecartee');
    expect(d?.motif).toMatch(/hors nomenclature/i);
  });
});

describe('surface — « Surface créée » n’est jamais la surface de plancher', () => {
  it('toujours écartée avec motif', () => {
    const ds = decisionInstruireTeleservice(base({ valeurs: val({ niveauxHorsSol: null, niveauxSousSol: null, destination: null, surfaceCreeeM2: 2590 }) }));
    const d = ds.find((x) => x.champ === 'surface_plancher_m2');
    expect(d?.action).toBe('ecartee');
    expect(d?.motif).toMatch(/surface de PLANCHER/i);
  });
});
