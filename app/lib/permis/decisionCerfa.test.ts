import { describe, it, expect } from 'vitest';
import { decisionCerfa, SOUS_DESTINATION_PAR_LETTRE, type ChampCerfa, type DecisionCerfa } from './decisionCerfa';

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

describe('decisionCerfa — destinations (N13 : sous-destinations réelles, jamais « mixte »)', () => {
  it('une seule sous-destination > 0 → cette destination (libellé exact du Cerfa)', () => {
    const d = decisionCerfa([champ('W2BF1', '11901'), champ('W2SF1', '11901')], null).destinations;
    expect(d).toMatchObject({ statut: 'ecrit', valeurs: ['Bureau'], confiance: 'a_verifier' });
  });
  it('plusieurs → TABLEAU complet (jamais de dominante, jamais « mixte »), provenance W2·F1', () => {
    const d = decisionCerfa([champ('W2BF1', '11901'), champ('W2CF1', '356'), champ('W2RF1', '775'), champ('W2SF1', '13032')], null).destinations;
    expect(d.valeurs).toEqual(['Bureau', 'Artisanat et commerce de détail', 'Restauration']); // ce qui donnera « Bureau, artisanat et commerce de détail, et restauration »
    expect(d.provenance?.champNom).toContain('W2·F1');
    expect(d.provenance?.extrait).toContain('W2BF1=11901');
  });
  it('« W2S » (Somme/total) n’est PAS une destination', () => {
    expect(decisionCerfa([champ('W2SF1', '13032')], null).destinations.statut).toBe('non_ecrit');
  });
  it('mapping lettre→sous-destination PINNÉ : casse si on le recale au jugé sans relire le formulaire', () => {
    expect(SOUS_DESTINATION_PAR_LETTRE.B).toBe('Bureau');
    expect(SOUS_DESTINATION_PAR_LETTRE.C).toBe('Artisanat et commerce de détail'); // PAS « commerce » générique
    expect(SOUS_DESTINATION_PAR_LETTRE.R).toBe('Restauration');
    expect(SOUS_DESTINATION_PAR_LETTRE.L).toBe('Logement');
    expect(SOUS_DESTINATION_PAR_LETTRE.H).toBe('Lieux de culte');   // PAS « habitation » — le piège corrigé
    expect(SOUS_DESTINATION_PAR_LETTRE.S).toBeUndefined();          // S = Surfaces totales, jamais une destination
  });
});

describe('decisionCerfa — adresse_terrain recoupée CHAMP PAR CHAMP avec Sitadel', () => {
  const adr = (loc = 'PARIS') => [champ('T2Q_numero', '3'), champ('T2V_voie', 'AVENUE BENOIT FRACHON'), champ('T2L_localite', loc)];
  const sit = (o: Partial<{ numero: string; voie: string; localite: string }> = {}) => ({ numero: '3', voie: 'AV Benoît Frachon', localite: 'PARIS 20', ...o });

  it('Sitadel absent → a_verifier sans réserve', () => {
    expect(col(decisionCerfa(adr(), null, null), 'adresse_terrain')).toMatchObject({ statut: 'ecrit', valeur: '3 AVENUE BENOIT FRACHON, PARIS', confiance: 'a_verifier', reserve: null });
  });
  it('arrondissement en supplément (« PARIS » ⊂ « PARIS 20 ») + abréviation voie → CONCORDANCE confirmee', () => {
    const d = col(decisionCerfa(adr(), null, sit()), 'adresse_terrain');
    expect(d.confiance).toBe('confirmee');
    expect(d.reserve).toBeNull();
  });
  it('VRAIE divergence — numéro différent → a_verifier + réserve (numéro JAMAIS relâché)', () => {
    const d = col(decisionCerfa(adr(), null, sit({ numero: '5' })), 'adresse_terrain');
    expect(d.confiance).toBe('a_verifier');
    expect(d.reserve).toContain('3 AVENUE BENOIT FRACHON, PARIS');
    expect(d.reserve).toContain('5 AV Benoît Frachon PARIS 20');
  });
  it('VRAIE divergence — voie différente → a_verifier + réserve (voie JAMAIS relâchée)', () => {
    const d = col(decisionCerfa(adr(), null, sit({ voie: 'RUE DE LA PAIX' })), 'adresse_terrain');
    expect(d.confiance).toBe('a_verifier'); expect(d.reserve).toContain('RUE DE LA PAIX');
  });
  it('VRAIE divergence — commune différente (PARIS vs MONTREUIL) → a_verifier + réserve', () => {
    const d = col(decisionCerfa(adr(), null, sit({ localite: 'MONTREUIL' })), 'adresse_terrain');
    expect(d.confiance).toBe('a_verifier'); expect(d.reserve).toContain('MONTREUIL');
  });
  it('VRAIE divergence — arrondissements distincts (PARIS 19 vs PARIS 20) → a_verifier + réserve', () => {
    const d = col(decisionCerfa(adr('PARIS 19'), null, sit({ localite: 'PARIS 20' })), 'adresse_terrain');
    expect(d.confiance).toBe('a_verifier'); expect(d.reserve).toContain('PARIS 20');
  });
  it('Sitadel incomplet (localité manquante) mais n°/voie concordent → a_verifier SANS réserve (pas de bruit)', () => {
    const d = col(decisionCerfa(adr(), null, { numero: '3', voie: 'AV Benoît Frachon', localite: null }), 'adresse_terrain');
    expect(d).toMatchObject({ confiance: 'a_verifier', reserve: null });
  });
  it('un champ Cerfa manquant → on écrit ce qu’on a (valeur partielle)', () => {
    const d = col(decisionCerfa([champ('T2V_voie', 'AVENUE BENOIT FRACHON'), champ('T2L_localite', 'PARIS')], null, null), 'adresse_terrain');
    expect(d.valeur).toBe('AVENUE BENOIT FRACHON, PARIS');
  });
  it('aucun champ d’adresse → non écrit', () => {
    expect(col(decisionCerfa([], null), 'adresse_terrain').statut).toBe('non_ecrit');
  });
});

describe('LECT-1 (C) — repli TEXTE (AcroForm vide)', () => {
  const texte = (t: string) => ({ texte: t, pieceNom: 'PC_scanne.pdf', page: 1 });
  it('nb_logements ← MODE corroboré du texte quand AUCUN champ AcroForm', () => {
    const d = col(decisionCerfa([], 586, null, texte('Construction de 21 logements. Résidence sociale de 21 logements. De 2 1 logements.')), 'nb_logements');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: 21, cle: 'nbLogements', confiance: 'a_verifier' });
  });
  it('surface_plancher — PIÈGE 531 : « surface créée : 586 » (sous-sol) NON captée → non écrit (jamais un faux)', () => {
    const d = col(decisionCerfa([], 586, null, texte('niveau de sous-sol (surface créée : 586.0 m²) ; 21 logements')), 'surface_plancher_m2');
    expect(d.statut).toBe('non_ecrit');
  });
  it('surface_plancher ← texte « surface de plancher créée : 1240 m² », confirmee si == Sitadel', () => {
    const d = col(decisionCerfa([], 1240, null, texte('surface de plancher créée : 1240 m²')), 'surface_plancher_m2');
    expect(d).toMatchObject({ statut: 'ecrit', valeur: 1240, confiance: 'confirmee' });
  });
  it('le repli NE s’active PAS si l’AcroForm a des champs (l’AcroForm fait foi)', () => {
    const d = col(decisionCerfa([champ('W2SF1', '999')], 999, null, texte('Construction de 21 logements. 21 logements.')), 'nb_logements');
    expect(d.statut).toBe('non_ecrit'); // AcroForm présent → pas de repli, nb_logements reste non écrit
  });

  it('PROV-3 (3) — destinations : sous-destination CANDIDATE (non cochée) tirée des pages du Cerfa, page la plus FIABLE', () => {
    const cerfa = { texte: '', pieceNom: 'PC_scan.pdf', page: null, pages: [
      { page: 23, texte: 'recouvrement de la part logement de la redevance' },       // signal FAIBLE
      { page: 7, texte: 'financement : Logement Locatif Social · 21 logements' },     // signal FORT
    ] };
    const d = decisionCerfa([], 586, null, cerfa).destinations;
    expect(d.statut).toBe('non_ecrit');                       // JAMAIS coché d'office
    expect(d.candidats).toHaveLength(1);
    expect(d.candidats![0].sousDestination).toBe('Logement');
    expect(d.candidats![0].provenance.page).toBe(7);          // la page FORTE l’emporte (pas la p.23 faible)
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
    expect(d.motif).toContain('attribution par bâtiment');
  });
});
