import { describe, it, expect } from 'vitest';
import { agregerStock, moisDePeriode, FENETRE_STOCK_MOIS, type DossierStock } from './stock';
import type { CandidatDossier } from './demande';

/**
 * Q2b — agregerStock : le décompte du stock passe INTÉGRALEMENT par `estCandidatEligible` (la définition unique d'éligibilité,
 * Q2a) — on PROUVE que chaque motif d'exclusion (annulé, absent, hors fenêtre, déjà rattaché, sans canal, courrier) sort du
 * décompte, plus la borne d'AFFICHAGE « moins de 6 mois » (un permis de 7 mois ne compte pas). Aucune redéfinition d'éligibilité
 * ici : on FABRIQUE des candidats et on lit le résultat.
 */

// Deux bornes distinctes, fixes (fonction pure — aucun `new Date()`) : éligibilité large, affichage à 6 mois.
const DATE_MIN = '2023-08-10';       // fenêtre d'éligibilité (≈ 3 ans)
const DATE_MIN_6M = '2026-02-10';    // borne d'affichage (6 mois avant un « aujourd'hui » fictif = 2026-08-10)
const RECENT = '2026-05-01';         // < 6 mois → dans la colonne
const SEPT_MOIS = '2026-01-05';      // ~7 mois : ÉLIGIBLE (≥ DATE_MIN) mais HORS de la colonne 6 mois
const VIEUX = '2022-01-01';          // hors fenêtre d'éligibilité (< DATE_MIN)

function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  return {
    dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'email', numDau: 'PC1',
    dateReelleAutorisation: RECENT, adresse: '1 rue X', codePostal: '75001', cadastre: [],
    etatDau: '2', absentDuDernierMillesime: false, ...over,
  };
}
const im = (over: Partial<CandidatDossier> = {}): DossierStock => ({ candidat: cand(over), categorie: 'immeuble_neuf' });
const AUCUN: ReadonlySet<number> = new Set();

describe('Q2b — agregerStock : exclusions via estCandidatEligible (définition unique)', () => {
  it('un immeuble neuf éligible, < 6 mois, non demandé → compté (chiffre principal)', () => {
    const r = agregerStock([im()], DATE_MIN, AUCUN, DATE_MIN_6M);
    expect(r).toHaveLength(1);
    expect(r[0].codeInsee).toBe('75056');
    expect(r[0].parType.immeuble_neuf).toBe(1);
    expect(r[0].total).toBe(1);
  });

  it('un permis ANNULÉ (etat_dau=4) n’est PAS compté', () => {
    expect(agregerStock([im({ etatDau: '4' })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('un dossier ABSENT du dernier millésime n’est PAS compté', () => {
    expect(agregerStock([im({ absentDuDernierMillesime: true })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('un dossier HORS FENÊTRE d’éligibilité (date < dateMin) n’est PAS compté', () => {
    expect(agregerStock([im({ dateReelleAutorisation: VIEUX })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('un dossier SANS DATE d’autorisation n’est PAS compté', () => {
    expect(agregerStock([im({ dateReelleAutorisation: null })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('un dossier DÉJÀ RATTACHÉ (demande active) n’est PAS compté', () => {
    expect(agregerStock([im({ dossierId: 42 })], DATE_MIN, new Set([42]), DATE_MIN_6M)).toHaveLength(0);
  });

  it('une commune SANS CANAL (canal inconnu, ou nom de commune null) n’est PAS comptée', () => {
    expect(agregerStock([im({ canal: 'inconnu' })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
    expect(agregerStock([im({ canal: null })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
    expect(agregerStock([im({ communeNom: null })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('un canal COURRIER (non adressable e-mail/formulaire) n’est PAS compté', () => {
    expect(agregerStock([im({ canal: 'courrier' })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
  });

  it('le canal FORMULAIRE (dépôt téléservice) EST compté (comme e-mail)', () => {
    expect(agregerStock([im({ canal: 'formulaire' })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(1);
  });
});

describe('Q2b — agregerStock : borne d’AFFICHAGE « moins de 6 mois » (sous-ensemble de l’éligibilité)', () => {
  it('un permis de ~7 mois est ÉLIGIBLE mais NE compte PAS dans la colonne « < 6 mois »', () => {
    // La preuve que c'est bien la borne d'affichage (et pas l'éligibilité) : avec une borne 6 mois RECULÉE à avant SEPT_MOIS,
    // le MÊME dossier compte. Donc il est éligible ; seule la borne d'affichage l'écartait.
    expect(agregerStock([im({ dateReelleAutorisation: SEPT_MOIS })], DATE_MIN, AUCUN, DATE_MIN_6M)).toHaveLength(0);
    expect(agregerStock([im({ dateReelleAutorisation: SEPT_MOIS })], DATE_MIN, AUCUN, '2025-12-01')).toHaveLength(1);
  });
});

describe('Q2b — agregerStock : catégories, regroupement, tri', () => {
  it('« autre » (aucune catégorie qualifiée) n’a pas de colonne et n’entre pas dans le total', () => {
    const r = agregerStock([{ candidat: cand(), categorie: 'autre' }], DATE_MIN, AUCUN, DATE_MIN_6M);
    expect(r).toHaveLength(0);
  });

  it('compte par type dans une même commune (immeuble + extension + surélévation)', () => {
    const r = agregerStock([
      { candidat: cand({ dossierId: 1 }), categorie: 'immeuble_neuf' },
      { candidat: cand({ dossierId: 2 }), categorie: 'extension' },
      { candidat: cand({ dossierId: 3 }), categorie: 'extension' },
      { candidat: cand({ dossierId: 4 }), categorie: 'surelevation' },
    ], DATE_MIN, AUCUN, DATE_MIN_6M);
    expect(r).toHaveLength(1);
    expect(r[0].parType).toEqual({ immeuble_neuf: 1, extension: 2, surelevation: 1 });
    expect(r[0].total).toBe(4);
  });

  it('trie par immeubles décroissant, puis total décroissant, puis nom', () => {
    const dossiers: DossierStock[] = [
      // Commune A : 1 immeuble
      { candidat: cand({ dossierId: 1, codeInsee: '93001', communeNom: 'Aubervilliers' }), categorie: 'immeuble_neuf' },
      // Commune B : 2 immeubles (doit passer devant A)
      { candidat: cand({ dossierId: 2, codeInsee: '93029', communeNom: 'Drancy' }), categorie: 'immeuble_neuf' },
      { candidat: cand({ dossierId: 3, codeInsee: '93029', communeNom: 'Drancy' }), categorie: 'immeuble_neuf' },
      // Commune C : 0 immeuble, 3 extensions (dernière — aucun immeuble)
      { candidat: cand({ dossierId: 4, codeInsee: '92004', communeNom: 'Asnières' }), categorie: 'extension' },
      { candidat: cand({ dossierId: 5, codeInsee: '92004', communeNom: 'Asnières' }), categorie: 'extension' },
      { candidat: cand({ dossierId: 6, codeInsee: '92004', communeNom: 'Asnières' }), categorie: 'extension' },
    ];
    const r = agregerStock(dossiers, DATE_MIN, AUCUN, DATE_MIN_6M);
    expect(r.map((l) => l.communeNom)).toEqual(['Drancy', 'Aubervilliers', 'Asnières']);
    expect(r[2].parType.immeuble_neuf ?? 0).toBe(0); // Asnières : aucune colonne immeuble, mais présente (a du stock)
    expect(r[2].total).toBe(3);
  });
});

describe('Q2b — moisDePeriode (panneau)', () => {
  it('clés connues → leur nombre de mois ; « origine » → null (tout l’historique)', () => {
    expect(moisDePeriode('6m')).toBe(6);
    expect(moisDePeriode('12m')).toBe(12);
    expect(moisDePeriode('24m')).toBe(24);
    expect(moisDePeriode('origine')).toBeNull();
  });
  it('clé inconnue / absente → défaut 6 mois (jamais « origine » par erreur)', () => {
    expect(moisDePeriode('n’importe quoi')).toBe(FENETRE_STOCK_MOIS);
    expect(moisDePeriode(null)).toBe(FENETRE_STOCK_MOIS);
    expect(FENETRE_STOCK_MOIS).toBe(6);
  });
});
