import { describe, expect, it } from 'vitest';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import { totauxPeriode } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import { coutsLocation, espaceLocationRegle, filtrerLocation, ligneLocationCa, variableNegociateur, type RetroLocation, type SalairesLocation } from './locationCa';

/**
 * 🔴 Arno (règle du 25/10/2026, chantier du 02/11/2026) — LE VARIABLE DU NÉGOCIATEUR AJOUTE LES PRIMES DE GESTION de la même période et du même
 * négociateur (`variableNegociateur`), sans toucher au CA net : les primes ne sont déduites qu'une fois, par leur propre colonne. Données fictives,
 * calées sur le cas d'Arno (octobre 2026 : variable 1 550,55 €, primes 300 € → 1 850,55 €).
 */
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [];
let n = 0;
const a = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-10-08', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 3500, honoLocataireHt: 2500,
  primeSaisie: null, mandatGestion: true, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: true, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [], locataires: [], ...o,
});
// Octobre 2026 : Jean-Baptiste 6 000 € × 15 % = 900 € (+ prime 150 €) ; Mélanie 4 337 € × 15 % = 650,55 € (+ prime 150 €). Septembre : une rétrocession.
const activites: ActiviteLue[] = [
  a({}),
  a({ honoProprietaireHt: 2337, honoLocataireHt: 2000, negociateurId: 8, negociateurLibelle: 'Mélanie' }),
  a({ dateSignature: '2026-09-14', honoProprietaireHt: 800, honoLocataireHt: 700 }),
  a({ dateSignature: '2026-03-03', honoProprietaireHt: 400, honoLocataireHt: 0, mandatGestion: false, avecGestion: false }),
];
const lignes = activites.map((x) => ligneLocationCa(x, { regles, apporteurs }));
const retros: RetroLocation[] = [{ annee: 2026, mois: 9, negociateurCle: 'id:5', montantC: { htC: 4050, ttcC: 4050 } }];
const douze = Array.from({ length: 12 }, (_, i) => ({ annee: 2026, mois: i + 1 }));

describe('🔴 le variable affiché = le calcul + les primes de gestion', () => {
  it('octobre 2026 : 1 550,55 € + 300 € = 1 850,55 € (« Tous »)', () => {
    const c = coutsLocation(lignes, [{ annee: 2026, mois: 10 }], retros, null);
    expect([c.variable.htC, c.primes.htC, variableNegociateur(c.variable, c.primes).htC]).toEqual([155055, 30000, 185055]);
    // sans TVA : le même en TTC
    expect(variableNegociateur(c.variable, c.primes).ttcC).toBe(185055);
  });

  it('un négociateur filtré : seules SES primes s’ajoutent ; « Tous » = la somme des deux ; l’Espace par négociateur dit la même chose', () => {
    const de = (cle: string) => { const c = coutsLocation(filtrerLocation(lignes, 'tous', [cle]), [{ annee: 2026, mois: 10 }], retros.filter((r) => r.negociateurCle === cle), null); return variableNegociateur(c.variable, c.primes).htC; };
    expect([de('id:5'), de('id:8')]).toEqual([90000 + 15000, 65055 + 15000]);
    expect(de('id:5') + de('id:8')).toBe(185055);
    const espace = espaceLocationRegle(lignes, [{ annee: 2026, mois: 10 }], retros, null);
    expect(Object.fromEntries(espace.map((g) => [g.cle, variableNegociateur(g.variable, g.primes).htC]))).toEqual({ 'id:5': 105000, 'id:8': 80055 });
  });

  it('🔴 INVARIANT : le CA net ne change pas, au centime, sur les 12 mois et le total (avec ou sans salaires) — les primes déduites une seule fois', () => {
    const salaires: SalairesLocation[] = [{ annee: 2026, mois: 9, salairesHt: 2000, note: null }];
    for (const sal of [null, salaires]) for (const avec of [true, false]) {
      const mois = douze.map((m) => coutsLocation(lignes, [m], retros, sal, avec));
      for (const c of [...mois, coutsLocation(lignes, douze, retros, sal, avec)]) {
        // le CA net d'avant le chantier : CA − apporteurs − primes déduites − variable déduit (hors primes) − salaires
        expect(c.net.htC).toBe(c.ca.htC - c.apporteurs.htC - c.primesDeduites.htC - c.variableDeduit.htC - c.salaires.htC);
        // le variable affiché, moins les primes de sa colonne, retombe sur ce qui est déduit : jamais deux fois
        expect(variableNegociateur(c.variableDeduit, c.primesDeduites).htC - c.primesDeduites.htC).toBe(c.variableDeduit.htC);
        expect(c.couts.htC).toBe(c.apporteurs.htC + c.primesDeduites.htC + c.variableDeduit.htC + c.salaires.htC);
      }
      // le total = la somme des mois (CA net et variable affiché)
      const total = coutsLocation(lignes, douze, retros, sal, avec);
      expect(total.net.htC).toBe(mois.reduce((t, c) => t + c.net.htC, 0));
      expect(variableNegociateur(total.variable, total.primes).htC).toBe(mois.reduce((t, c) => t + variableNegociateur(c.variable, c.primes).htC, 0));
    }
  });

  it('le même chiffre que le variable du module Location (taux × base + primes − rétrocessions, `totauxPeriode`)', () => {
    const ctx = { regles, apporteurs, retrocessions: [{ negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-09-01', montant: 40.5, libelle: 'Avance' }], aujourdhui: '2026-11-02' };
    for (const mois of [9, 10]) {
      const c = coutsLocation(lignes, [{ annee: 2026, mois }], retros, null);
      expect(variableNegociateur(c.variable, c.primes).htC).toBe(Math.round(totauxPeriode(activites, ctx, { annee: 2026, mois }).commission * 100));
    }
  });
});
