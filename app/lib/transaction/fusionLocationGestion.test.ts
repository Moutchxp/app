import { describe, expect, it } from 'vitest';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import type { GestionMois } from './modele';
import { ligneLocationCa, lignesDesMois, totauxLocation } from './locationCa';
import { totauxGestion } from './gestionVue';
import { anneesFusion, FAMILLES_COUTS, totauxFusion } from './fusionLocationGestion';

/**
 * 🔴 LOT LG1 — la FUSION Location & Gestion n'a aucun calcul propre : la part location = `totauxLocation` (page Location), la part gestion =
 * `totauxGestion` (page Gestion), au centime, HT et TTC (coûts salariaux chargés sans TVA) ; total = somme ; « Activité » = partition exacte ;
 * CA net = CA brut − coûts.
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
const lignes = [a({ mandatGestion: true, avecGestion: true, apporteurId: 7 }), a({ dateSignature: '2026-08-03' }), a({ dateSignature: '2025-09-01', honoProprietaireHt: 300 })]
  .map((x) => ligneLocationCa(x, { regles, apporteurs }));
const g = (annee: number, mois: number, o: Partial<GestionMois>): GestionMois => ({ id: annee * 100 + mois, annee, mois, nbLots: 300, honorairesHt: 18000.07, adhocHt: 2914.8, mongaHt: 12.34,
  salarieHt: 2688.91, resteHt: null, note: null, origine: 'saisie', ...o } as GestionMois);
const gestion = [g(2026, 9, {}), g(2026, 8, { mongaHt: null, nbLots: 310 }), g(2025, 9, { honorairesHt: 17000 })];
const sept = [{ annee: 2026, mois: 9 }];
const annee = Array.from({ length: 12 }, (_, i) => ({ annee: 2026, mois: i + 1 }));

describe('🔴 LOT LG1 — la fusion = la somme des deux pages, au centime', () => {
  it('septembre 2026 : la part location = la page Location ; la part gestion = la page Gestion (salaires sans TVA) ; total = somme', () => {
    const t = totauxFusion(lignes, gestion, sept);
    const L = totauxLocation(lignesDesMois(lignes, sept)); const G = totauxGestion(gestion, sept);
    // 🔴 LOT LG4 — « Avec salaires » (les deux) : les primes sont dans les salaires — la part location AVANT primes (= CA net d'apporteurs de la page)
    expect([t.location.ca, t.location.net, t.location.couts.primes, t.location.couts.apporteurs, t.primesEnPaie]).toEqual([L.ca, L.netApporteurs, L.primes, L.apporteurs, L.primes]);
    expect([t.gestion.ca, t.gestion.net]).toEqual([{ htC: G.honorairesC, ttcC: G.honorairesTtcC }, { htC: G.netC, ttcC: G.netTtcC }]);
    expect([t.gestion.couts.adhoc, t.gestion.couts.monga, t.gestion.couts.salaries]).toEqual([{ htC: G.adhocC, ttcC: G.adhocTtcC }, { htC: G.mongaC, ttcC: G.mongaTtcC }, { htC: 268891, ttcC: 268891 }]);
    expect(t.ca).toEqual({ htC: L.ca.htC + G.honorairesC, ttcC: L.ca.ttcC + G.honorairesTtcC });
    expect(t.net).toEqual({ htC: L.net.htC + L.primes.htC + G.netC, ttcC: L.net.ttcC + L.primes.ttcC + G.netTtcC });
    expect(t.coutsTotal).toEqual({ htC: L.apporteurs.htC + G.adhocC + G.mongaC + G.salariesC, ttcC: L.apporteurs.ttcC + G.adhocTtcC + G.mongaTtcC + G.salariesC });
    expect([t.baux, t.lots]).toEqual([1, 300]);
  });
  for (const ms of [sept, annee]) {
    it(`tuile 4 = tuile 1 − tuile 3, au centime, HT et TTC ; coûts = somme des familles (${ms.length} mois)`, () => {
      const t = totauxFusion(lignes, gestion, ms);
      expect([t.net.htC, t.net.ttcC]).toEqual([t.ca.htC - t.coutsTotal.htC, t.ca.ttcC - t.coutsTotal.ttcC]);
      // 🔴 LOT LG4 — les familles comptées : sans les primes (dans les salaires)
      expect(FAMILLES_COUTS.filter((f) => f.cle !== 'primes').reduce((s, f) => s + t.couts[f.cle].ttcC, 0)).toBe(t.coutsTotal.ttcC);
    });
  }
  it('« Activité » : location + gestion = les deux, exactement (« Sans salaires » ; « Avec » : aux primes près, comptées une seule fois dans les deux) ; l’autre part compte 0', () => {
    const d = totauxFusion(lignes, gestion, annee, 'deux'); const l = totauxFusion(lignes, gestion, annee, 'location'); const gg = totauxFusion(lignes, gestion, annee, 'gestion');
    // 🔴 LOT LG4 — la location seule garde ses primes (= la page Location) ; les deux ne les retirent qu'une fois (dans les salaires)
    const pr = d.primesEnPaie!;
    expect([l.primesEnPaie, gg.primesEnPaie]).toEqual([null, null]);
    expect(l.ca.htC + gg.ca.htC).toBe(d.ca.htC);
    for (const u of ['htC', 'ttcC'] as const) { expect(l.coutsTotal[u] + gg.coutsTotal[u]).toBe(d.coutsTotal[u] + pr[u]); expect(l.net[u] + gg.net[u]).toBe(d.net[u] - pr[u]); }
    const ds = totauxFusion(lignes, gestion, annee, 'deux', false); const ls = totauxFusion(lignes, gestion, annee, 'location', false); const gs = totauxFusion(lignes, gestion, annee, 'gestion', false);
    for (const k of ['ca', 'coutsTotal', 'net'] as const) expect([ls[k].htC + gs[k].htC, ls[k].ttcC + gs[k].ttcC]).toEqual([ds[k].htC, ds[k].ttcC]);
    expect([l.gestion.ca.htC, gg.location.ca.htC, l.lots, gg.baux]).toEqual([0, 0, null, null]);
    expect(gg.lots).toBe(305);
  });
  it('une période = la somme de ses mois ; un mois de gestion non saisi compte 0 ; les années des deux activités', () => {
    const s = annee.map((m) => totauxFusion(lignes, gestion, [m]));
    const t = totauxFusion(lignes, gestion, annee);
    expect([s.reduce((x, y) => x + y.net.ttcC, 0), s.reduce((x, y) => x + y.ca.htC, 0)]).toEqual([t.net.ttcC, t.ca.htC]);
    expect(totauxFusion(lignes, gestion, [{ annee: 2026, mois: 1 }]).gestion.ca).toEqual({ htC: 0, ttcC: 0 });
    expect(anneesFusion(lignes, gestion, '2026-11-01')).toEqual([2025, 2026]);
  });
});

/**
 * 🔴 LOT LG2 — « Sans salaires » : les coûts SANS les coûts salariaux chargés (sans TVA : le même montant HT et TTC) ; le CA net augmenté d'eux ;
 * rien d'autre ne change ; tuile 4 = tuile 1 − tuile 3 dans les deux modes.
 */
describe('🔴 LOT LG2 — Avec | Sans salaires', () => {
  for (const ms of [sept, annee]) {
    it(`Avec = Sans + coûts salariaux − primes payées en paie (🔴 LOT LG4), au centime, HT et TTC ; CA net Avec = CA brut − coûts Avec (${ms.length} mois)`, () => {
      const avec = totauxFusion(lignes, gestion, ms); const sans = totauxFusion(lignes, gestion, ms, 'deux', false);
      const s = avec.couts.salaries; const pr = avec.primesEnPaie!;
      expect([s.htC, sans.primesEnPaie]).toEqual([s.ttcC, null]);
      expect([avec.coutsTotal.htC, avec.coutsTotal.ttcC]).toEqual([sans.coutsTotal.htC + s.htC - pr.htC, sans.coutsTotal.ttcC + s.ttcC - pr.ttcC]);
      expect([avec.net.htC, avec.net.ttcC]).toEqual([avec.ca.htC - avec.coutsTotal.htC, avec.ca.ttcC - avec.coutsTotal.ttcC]);
      expect([sans.net.htC, sans.net.ttcC]).toEqual([sans.ca.htC - sans.coutsTotal.htC, sans.ca.ttcC - sans.coutsTotal.ttcC]);
      expect([sans.ca, sans.couts, sans.salaires, avec.salaires]).toEqual([avec.ca, avec.couts, false, true]);
      expect(sans.gestion.net).toEqual({ htC: avec.gestion.net.htC + s.htC, ttcC: avec.gestion.net.ttcC + s.ttcC });
    });
  }
  it('la location seule ne change pas ; la gestion seule : la même règle', () => {
    expect(totauxFusion(lignes, gestion, annee, 'location', false).net).toEqual(totauxFusion(lignes, gestion, annee, 'location').net);
    const g1 = totauxFusion(lignes, gestion, annee, 'gestion'); const g2 = totauxFusion(lignes, gestion, annee, 'gestion', false);
    expect(g2.net.htC - g1.net.htC).toBe(g1.couts.salaries.htC);
  });
});
