import { describe, it, expect } from 'vitest';
import { decisionCerfa, type ChampCerfa, type DecisionCerfa } from './decisionCerfa';

/**
 * N7-D — décision de mapping Cerfa (pure, données synthétiques). Chaque règle : le cas « écrit » ET le cas « non écrit ».
 * stationnement écrit même à 0 ; surface confirmee/à vérifier selon Sitadel ; nature single/mixte/none ; adresse complète/partielle ;
 * nb_logements et corps.adresse jamais écrits.
 */
const champ = (nom: string, valeur: string, pieceNom = 'cerfa_13409.pdf', page: number | null = 4): ChampCerfa => ({ nom, valeur, page, pieceNom });
const col = (d: DecisionCerfa, colonne: string, portee?: 'permis' | 'corps') => d.champs.find((x) => x.colonne === colonne && (portee ? x.portee === portee : true))!;

describe('decisionCerfa — nb_places_stationnement (S1M, après travaux)', () => {
  it('écrit MÊME à 0 (zéro déclaré ≠ absence), a_verifier', () => {
    const d = col(decisionCerfa([champ('S1M_stationnementapres', '0')], null), 'nb_places_stationnement');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: 0, confiance: 'a_verifier', cle: 'nbPlacesStationnement' });
    expect(d.provenance?.extrait).toContain('S1M_stationnementapres = 0');
  });
  it('non écrit si le champ est absent', () => {
    expect(col(decisionCerfa([], null), 'nb_places_stationnement').statut).toBe('non_ecrit');
  });
});

describe('decisionCerfa — surface_plancher_m2 (W2SF1) recoupée avec Sitadel', () => {
  it('égale à surf_creee → confirmee, sans réserve', () => {
    const d = col(decisionCerfa([champ('W2SF1', '13032')], 13032), 'surface_plancher_m2');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: 13032, confiance: 'confirmee', reserve: null });
  });
  it('différente → a_verifier + réserve citant les deux valeurs', () => {
    const d = col(decisionCerfa([champ('W2SF1', '13032')], 12000), 'surface_plancher_m2');
    expect(d.confiance).toBe('a_verifier');
    expect(d.reserve).toContain('13032');
    expect(d.reserve).toContain('12000');
  });
  it('surf_creee absent → a_verifier sans réserve', () => {
    const d = col(decisionCerfa([champ('W2SF1', '13032')], null), 'surface_plancher_m2');
    expect(d).toMatchObject({ statut: 'ecrit', confiance: 'a_verifier', reserve: null });
  });
  it('non écrit si W2SF1 absent', () => {
    expect(col(decisionCerfa([], null), 'surface_plancher_m2').statut).toBe('non_ecrit');
  });
});

describe('decisionCerfa — nature_projet (destinations, sans dominante)', () => {
  it('une seule destination > 0 → cette destination', () => {
    const d = col(decisionCerfa([champ('W2BF1', '11901'), champ('W2SF1', '11901')], null), 'nature_projet');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: 'bureaux', confiance: 'a_verifier' });
  });
  it('plusieurs destinations > 0 → mixte (jamais de dominante), détail dans l’extrait', () => {
    const d = col(decisionCerfa([champ('W2BF1', '11901'), champ('W2CF1', '356'), champ('W2SF1', '12257')], null), 'nature_projet');
    expect(d.valeur).toBe('mixte');
    expect(d.provenance?.extrait).toContain('W2BF1=11901');
    expect(d.provenance?.extrait).toContain('W2CF1=356');
  });
  it('« W2S » (Somme/total) n’est PAS une destination', () => {
    const d = col(decisionCerfa([champ('W2SF1', '13032')], null), 'nature_projet');
    expect(d.statut).toBe('non_ecrit'); // W2S exclu → aucune destination
  });
});

describe('decisionCerfa — adresse_terrain (T2Q + T2V + T2L)', () => {
  it('les trois présents → « numéro voie, localité »', () => {
    const d = col(decisionCerfa([champ('T2Q_numero', '3'), champ('T2V_voie', 'AVENUE BENOIT FRACHON'), champ('T2L_localite', 'PARIS')], null), 'adresse_terrain');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: '3 AVENUE BENOIT FRACHON, PARIS', reserve: null });
  });
  it('un manquant → on écrit ce qu’on a, on journalise le manque', () => {
    const d = col(decisionCerfa([champ('T2V_voie', 'AVENUE BENOIT FRACHON'), champ('T2L_localite', 'PARIS')], null), 'adresse_terrain');
    expect(d.valeur).toBe('AVENUE BENOIT FRACHON, PARIS');
    expect(d.reserve).toContain('T2Q_numero');
  });
  it('aucun champ d’adresse → non écrit', () => {
    expect(col(decisionCerfa([], null), 'adresse_terrain').statut).toBe('non_ecrit');
  });
});

describe('decisionCerfa — jamais écrits', () => {
  it('nb_logements → non écrit, motif « absence ≠ zéro »', () => {
    const d = col(decisionCerfa([], null), 'nb_logements');
    expect(d.statut).toBe('non_ecrit');
    expect(d.motif).toContain('absence de champ ne vaut pas zéro');
  });
  it('corps.adresse → non écrit (attribution non résolue), portée corps', () => {
    const d = col(decisionCerfa([], null), 'adresse', 'corps');
    expect(d).toMatchObject({ statut: 'non_ecrit', portee: 'corps' });
    expect(d.motif).toContain('attribution par corps');
  });
});
