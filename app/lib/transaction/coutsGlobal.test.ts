import { describe, expect, it } from 'vitest';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import type { GestionMois } from './modele';
import { coutsLocation, ligneLocationCa } from './locationCa';
import { totauxGestion } from './gestionVue';
import { coutsGlobaux, coutsVente } from './coutsGlobal';

/**
 * 🔴 LOT CG2 (Arno) — les coûts globaux du CA global : chaque colonne = sa page d'origine (Location : `coutsLocation` ; Gestion : `totauxGestion`),
 * avec et sans salaires, HT et TTC ; Total coûts = la somme des colonnes ; sans vente : aucune commission.
 */
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [{ id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
let n = 0;
const a = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500.05, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [], locataires: [], ...o,
} as ActiviteLue);
const lignes = [a({ mandatGestion: true, avecGestion: true, apporteurId: 7 }), a({ dateSignature: '2026-08-03', mandatGestion: true }), a({ dateSignature: '2025-09-01', honoProprietaireHt: 300 })]
  .map((x) => ligneLocationCa(x, { regles, apporteurs }));
const g = (annee: number, mois: number, o: Partial<GestionMois>): GestionMois => ({ id: annee * 100 + mois, annee, mois, nbLots: 300, honorairesHt: 18000.07, adhocHt: 2914.8, mongaHt: 12.34,
  salarieHt: 2688.91, resteHt: null, note: null, origine: 'saisie', ...o } as GestionMois);
const gestion = [g(2026, 9, {}), g(2026, 8, { mongaHt: null, salarieHt: null }), g(2025, 9, { honorairesHt: 17000 })];
const salaires = [{ annee: 2026, mois: 8, salairesHt: 1000, note: null }];
const e = { ventes: [], retrocessions: [], location: { lignes, retrocessions: [], salaires }, gestion };

describe('🔴 LOT CG2 — coûts globaux', () => {
  for (const avec of [true, false]) {
    it(`${avec ? 'Avec' : 'Sans'} salaires : chaque mois de 2026 et l’année — Location = sa page, Gestion = sa page, total = somme des colonnes`, () => {
      for (const mois of [...Array.from({ length: 12 }, (_, i) => i + 1), null]) {
        const c = coutsGlobaux(e, 2026, mois, avec);
        const ms = mois === null ? Array.from({ length: 12 }, (_, i) => ({ annee: 2026, mois: i + 1 })) : [{ annee: 2026, mois }];
        const L = coutsLocation(lignes, ms, [], salaires, avec); const G = totauxGestion(gestion, ms, avec);
        expect(c.location).toEqual(L);
        expect([c.gestion.adhoc, c.gestion.monga, c.gestion.salaires]).toEqual([{ htC: G.adhocC, ttcC: G.adhocTtcC }, { htC: G.mongaC, ttcC: G.mongaTtcC }, avec ? { htC: G.salariesC, ttcC: G.salariesC } : { htC: 0, ttcC: 0 }]);
        for (const k of ['htC', 'ttcC'] as const) {
          const colonnes = [c.vente.commissions, c.vente.apporteurs, c.vente.exterieures, L.apporteurs, L.primesDeduites, L.variableDeduit, L.salaires, c.gestion.adhoc, c.gestion.monga, c.gestion.salaires];
          expect(colonnes.reduce((t, x) => t + x[k], 0)).toBe(c.total[k]);
          // CA − coûts = les CA nets des pages (sans vente)
          const ca = L.ca[k] + (k === 'htC' ? G.honorairesC : G.honorairesTtcC);
          expect(ca - c.total[k]).toBe(L.net[k] + (k === 'htC' ? G.netC : G.netTtcC));
        }
      }
    });
  }
  it('sans TVA : apporteurs et primes de location, variable, salaires (TTC = HT) ; ADHOC et MONGA à 20 %', () => {
    const c = coutsGlobaux(e, 2026, 9, true);
    for (const m of [c.location!.apporteurs, c.location!.primesDeduites, c.location!.variableDeduit, c.gestion.salaires]) expect(m.ttcC).toBe(m.htC);
    expect([c.gestion.adhoc.ttcC, c.gestion.monga.ttcC]).toEqual([Math.round(291480 * 1.2), Math.round(1234 * 1.2)]);
    // août : les salaires de la Location saisis — primes et variable « inclus » (non déduits) ; septembre : déduits
    const aout = coutsGlobaux(e, 2026, 8, true);
    expect([aout.location!.primesDeduites.htC, aout.location!.variableDeduit.htC, aout.location!.salaires.htC]).toEqual([0, 0, 100000]);
    expect(aout.location!.primes.htC).toBeGreaterThan(0);
  });
  it('sans vente : aucune commission ; la location non lue : null', () => {
    expect(coutsVente([])).toEqual({ ca: { htC: 0, ttcC: 0 }, commissions: { htC: 0, ttcC: 0 }, apporteurs: { htC: 0, ttcC: 0 }, exterieures: { htC: 0, ttcC: 0 }, net: { htC: 0, ttcC: 0 }, nb: 0 });
    expect(coutsGlobaux({ ...e, location: null }, 2026, 9).location).toBeNull();
  });
});
