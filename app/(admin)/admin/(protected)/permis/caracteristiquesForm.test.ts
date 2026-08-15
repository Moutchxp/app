import { describe, it, expect } from 'vitest';
import { construireCorps, construireGlobal, construirePermis, valeurVersInput, libelleBornes, composerLibelleDestinations, raisonParcelleNonRattachee, ecartSuperficieCadastre, MESURES, CHAMPS_PERMIS, type EditionCorps, type EditionPermis, type Bornes } from './caracteristiquesForm';

const NATURES = ['habitation', 'bureaux', 'commerce', 'mixte', 'equipement', 'autre'];
const edPermis = (over: Partial<EditionPermis> = {}): EditionPermis => ({ natureProjet: '', surfacePlancherM2: '', nbLogements: '', nbPlacesStationnement: '', adresseTerrain: '', altitudeSommetNgf: '', ...over });
const BORNES_PERMIS: Record<string, Bornes> = { altitude_sommet_ngf: { min: -50, max: 500 } }; // LUES du CHECK (108/103) ; ici pour le test

describe('N7-E — construirePermis (champs déclarés du permis)', () => {
  it('vides → toutes valeurs null (tri-état préservé), aucune erreur', () => {
    const { valeurs, valide } = construirePermis(edPermis(), NATURES);
    expect(valide).toBe(true);
    expect(valeurs).toEqual({ natureProjet: null, surfacePlancherM2: null, nbLogements: null, nbPlacesStationnement: null, adresseTerrain: null, altitudeSommetNgf: null });
  });
  it('nature dans la liste → acceptée ; hors liste → erreur', () => {
    expect(construirePermis(edPermis({ natureProjet: 'mixte' }), NATURES).valeurs.natureProjet).toBe('mixte');
    const ko = construirePermis(edPermis({ natureProjet: 'usine' }), NATURES);
    expect(ko.valide).toBe(false); expect(ko.erreurs.natureProjet).toBeDefined();
  });
  it('nombres : négatif refusé, 0 accepté (0 ≠ vide)', () => {
    expect(construirePermis(edPermis({ nbPlacesStationnement: '-1' }), NATURES).erreurs.nbPlacesStationnement).toBeDefined();
    const ok = construirePermis(edPermis({ nbPlacesStationnement: '0', surfacePlancherM2: '13032' }), NATURES);
    expect(ok.valeurs.nbPlacesStationnement).toBe(0); expect(ok.valeurs.surfacePlancherM2).toBe(13032);
  });
  it('N8-C — altitude du sommet permis : bornée par le CHECK (négatif admis dans [-50 ; 500]), hors bornes → erreur citant la plage', () => {
    expect(construirePermis(edPermis({ altitudeSommetNgf: '89.46' }), NATURES, BORNES_PERMIS).valeurs.altitudeSommetNgf).toBe(89.46);
    expect(construirePermis(edPermis({ altitudeSommetNgf: '-12' }), NATURES, BORNES_PERMIS).valeurs.altitudeSommetNgf).toBe(-12); // borne réelle, PAS la règle ≥0
    const ko = construirePermis(edPermis({ altitudeSommetNgf: '600' }), NATURES, BORNES_PERMIS);
    expect(ko.valide).toBe(false); expect(ko.erreurs.altitudeSommetNgf).toContain('-50 et 500'); expect(ko.erreurs.altitudeSommetNgf).toContain('m');
  });
  it('les 6 champs déclarés sont exposés (dont le sommet permis)', () => {
    expect(CHAMPS_PERMIS.map((c) => c.cle).sort()).toEqual(['adresseTerrain', 'altitudeSommetNgf', 'natureProjet', 'nbLogements', 'nbPlacesStationnement', 'surfacePlancherM2']);
  });
});

/**
 * N3-C — helpers PURS de l'éditeur des caractéristiques (motif contactForm). Sémantique `ecrireContact` : champ vidé → null
 * EXPLICITE ; champ absent → non touché. Bornes LUES de la base (jamais recopiées) : hors plage refusé AVANT l'appel, message
 * citant les bornes réelles. Parking en TROIS états. NULL distinct de 0 (jamais « 0 » à la place d'un vide).
 */
const BORNES: Record<string, Bornes> = {
  nb_etages: { min: 0, max: 70 },
  nb_niveaux_sous_sol: { min: 0, max: 10 },
  altitude_sommet_ngf: { min: -50, max: 500 },
  altitude_dernier_plancher_ngf: { min: -50, max: 500 },
  hauteur_relative_m: { min: 0, max: 300 },
  altitude_terrain_naturel_ngf: { min: -50, max: 500 },
};
const edCorps = (over: Partial<EditionCorps> = {}): EditionCorps => ({
  repere: '', adresse: '', nbEtages: '', nbNiveauxSousSol: '', altitudeDernierPlancherNgf: '', altitudeSommetNgf: '', hauteurRelativeM: '', altitudeTerrainNaturelNgf: '', ...over,
});

describe('N3-C — construireCorps : vide → null explicite, bornes de la base, entiers', () => {
  it('champs vides → toutes valeurs null (posées explicitement), aucune erreur', () => {
    const { valeurs, erreurs, valide } = construireCorps(edCorps(), BORNES);
    expect(valide).toBe(true);
    expect(erreurs).toEqual({});
    for (const m of MESURES) expect(valeurs[m.cle]).toBeNull(); // null explicite, jamais 0
  });

  it('valeurs valides → nombres ; 0 est une valeur RÉELLE (distinct de vide)', () => {
    const { valeurs } = construireCorps(edCorps({ nbEtages: '0', altitudeSommetNgf: '42.5' }), BORNES);
    expect(valeurs.nbEtages).toBe(0);            // 0 posé, PAS null
    expect(valeurs.altitudeSommetNgf).toBe(42.5);
  });

  it('valeur HORS BORNES → refusée + message citant les bornes RÉELLES ; champ exclu du corps (non touché)', () => {
    const { valeurs, erreurs, valide } = construireCorps(edCorps({ nbEtages: '100', altitudeSommetNgf: '-100' }), BORNES);
    expect(valide).toBe(false);
    expect(erreurs.nbEtages).toContain('0 et 70');
    expect(erreurs.altitudeSommetNgf).toContain('-50 et 500');
    expect(erreurs.altitudeSommetNgf).toContain('m');       // unité citée
    expect('nbEtages' in valeurs).toBe(false);              // non écrit
  });

  it('entier attendu : « 2.5 » sur nb_etages → erreur ; virgule décimale tolérée sur une altitude', () => {
    expect(construireCorps(edCorps({ nbEtages: '2.5' }), BORNES).erreurs.nbEtages).toContain('entier');
    expect(construireCorps(edCorps({ altitudeSommetNgf: '30,5' }), BORNES).valeurs.altitudeSommetNgf).toBe(30.5);
  });

  it('borne manquante (colonne sans CHECK lu) → message « plage indisponible », pas de plage inventée', () => {
    expect(libelleBornes(MESURES[0], undefined)).toContain('indisponible');
  });
});

describe('N3-C — construireGlobal : parking TROIS états, champ absent non touché', () => {
  it('parking : «’’» → null · « oui » → true · « non » → false', () => {
    expect(construireGlobal({ parking: '' }).parking).toBeNull();
    expect(construireGlobal({ parking: 'oui' }).parking).toBe(true);
    expect(construireGlobal({ parking: 'non' }).parking).toBe(false);
  });
  it('champ ABSENT → non touché (clé absente du corps) ; commentaire vide → null', () => {
    expect('parking' in construireGlobal({ commentaire: 'x' })).toBe(false); // parking non fourni → non écrit
    expect(construireGlobal({ commentaire: '   ' }).commentaire).toBeNull();
    expect(construireGlobal({ commentaire: 'RAS' }).commentaire).toBe('RAS');
  });
});

describe('N3-C — valeurVersInput : NULL affiché vide, 0 affiché « 0 »', () => {
  it('null/undefined → «» ; 0 → « 0 » (jamais confondus)', () => {
    expect(valeurVersInput(null)).toBe('');
    expect(valeurVersInput(undefined)).toBe('');
    expect(valeurVersInput(0)).toBe('0');
    expect(valeurVersInput(12.5)).toBe('12.5');
  });
});

describe('N13 — composerLibelleDestinations : « A, b, et c », minuscule initiale sauf en tête', () => {
  it('0 destination → chaîne vide (le caller affiche « non renseignée »)', () => {
    expect(composerLibelleDestinations([])).toBe('');
  });
  it('1 destination → telle quelle (majuscule conservée)', () => {
    expect(composerLibelleDestinations(['Bureau'])).toBe('Bureau');
  });
  it('2 destinations → « A et b » (pas de virgule)', () => {
    expect(composerLibelleDestinations(['Bureau', 'Restauration'])).toBe('Bureau et restauration');
  });
  it('3 destinations → « A, b, et c » (virgule avant « et »)', () => {
    expect(composerLibelleDestinations(['Bureau', 'Artisanat et commerce de détail', 'Restauration']))
      .toBe('Bureau, artisanat et commerce de détail, et restauration');
  });
});

describe('N3-E — raison de non-rattachement + écart de superficie (purs)', () => {
  const base = { idu: '75120000DZ0009' as string | null, aGeometrie: false, deptCharge: true, reserve: null as string | null };
  it('rattachée → aucune raison', () => {
    expect(raisonParcelleNonRattachee({ ...base, aGeometrie: true })).toBeNull();
  });
  it('idu null → commune indéterminée (ou la réserve)', () => {
    expect(raisonParcelleNonRattachee({ ...base, idu: null, reserve: 'numéro illisible' })).toBe('numéro illisible');
    expect(raisonParcelleNonRattachee({ ...base, idu: null, reserve: null })).toContain('commune cadastrale indéterminée');
  });
  it('idu présent mais département non chargé → « géométrie non chargée pour le département XX »', () => {
    expect(raisonParcelleNonRattachee({ ...base, deptCharge: false })).toBe('géométrie non chargée pour le département 75');
  });
  it('idu présent, département chargé, mais pas trouvé → « référence introuvable au cadastre »', () => {
    expect(raisonParcelleNonRattachee({ ...base, deptCharge: true })).toContain('introuvable au cadastre');
  });
  it('écart superficie : signalé au-delà de l’arrondi (> 1 m²), sinon null', () => {
    expect(ecartSuperficieCadastre(2631.5, 2631)).toBeNull();          // 0,5 = arrondi
    expect(ecartSuperficieCadastre(255, 255)).toBeNull();
    expect(ecartSuperficieCadastre(2631.5, 2000)).toContain('2631.5 m² déclarés vs 2000 m²');
    expect(ecartSuperficieCadastre(null, 2631)).toBeNull();
  });
});
