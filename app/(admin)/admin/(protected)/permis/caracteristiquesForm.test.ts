import { describe, it, expect } from 'vitest';
import { construireCorps, construireGlobal, valeurVersInput, libelleBornes, MESURES, type EditionCorps, type Bornes } from './caracteristiquesForm';

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
  repere: '', nbEtages: '', nbNiveauxSousSol: '', altitudeDernierPlancherNgf: '', altitudeSommetNgf: '', hauteurRelativeM: '', altitudeTerrainNaturelNgf: '', ...over,
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
