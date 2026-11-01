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
    expect([t.location.ca, t.location.net, t.location.couts.primes, t.location.couts.apporteurs]).toEqual([L.ca, L.net, L.primes, L.apporteurs]);
    expect([t.gestion.ca, t.gestion.net]).toEqual([{ htC: G.honorairesC, ttcC: G.honorairesTtcC }, { htC: G.netC, ttcC: G.netTtcC }]);
    expect([t.gestion.couts.adhoc, t.gestion.couts.monga, t.gestion.couts.salaries]).toEqual([{ htC: G.adhocC, ttcC: G.adhocTtcC }, { htC: G.mongaC, ttcC: G.mongaTtcC }, { htC: 268891, ttcC: 268891 }]);
    expect(t.ca).toEqual({ htC: L.ca.htC + G.honorairesC, ttcC: L.ca.ttcC + G.honorairesTtcC });
    expect(t.net).toEqual({ htC: L.net.htC + G.netC, ttcC: L.net.ttcC + G.netTtcC });
    expect([t.baux, t.lots]).toEqual([1, 300]);
  });
  for (const ms of [sept, annee]) {
    it(`tuile 4 = tuile 1 − tuile 3, au centime, HT et TTC ; coûts = somme des familles (${ms.length} mois)`, () => {
      const t = totauxFusion(lignes, gestion, ms);
      expect([t.net.htC, t.net.ttcC]).toEqual([t.ca.htC - t.coutsTotal.htC, t.ca.ttcC - t.coutsTotal.ttcC]);
      expect(FAMILLES_COUTS.reduce((s, f) => s + t.couts[f.cle].ttcC, 0)).toBe(t.coutsTotal.ttcC);
    });
  }
  it('« Activité » : location + gestion = les deux, exactement (CA, coûts, net, HT et TTC) ; l’autre part compte 0', () => {
    const d = totauxFusion(lignes, gestion, annee, 'deux'); const l = totauxFusion(lignes, gestion, annee, 'location'); const gg = totauxFusion(lignes, gestion, annee, 'gestion');
    for (const k of ['ca', 'coutsTotal', 'net'] as const) expect([l[k].htC + gg[k].htC, l[k].ttcC + gg[k].ttcC]).toEqual([d[k].htC, d[k].ttcC]);
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
    it(`Sans = Avec − coûts salariaux chargés, au centime, HT et TTC ; CA net hors salaires = CA net + salaires (${ms.length} mois)`, () => {
      const avec = totauxFusion(lignes, gestion, ms); const sans = totauxFusion(lignes, gestion, ms, 'deux', false);
      const s = avec.couts.salaries;
      expect(s.htC).toBe(s.ttcC);
      expect([sans.coutsTotal.htC, sans.coutsTotal.ttcC]).toEqual([avec.coutsTotal.htC - s.htC, avec.coutsTotal.ttcC - s.ttcC]);
      expect([sans.net.htC, sans.net.ttcC]).toEqual([avec.net.htC + s.htC, avec.net.ttcC + s.ttcC]);
      expect([sans.net.htC, sans.net.ttcC]).toEqual([sans.ca.htC - sans.coutsTotal.htC, sans.ca.ttcC - sans.coutsTotal.ttcC]);
      expect([sans.ca, sans.location, sans.couts, sans.salaires, avec.salaires]).toEqual([avec.ca, avec.location, avec.couts, false, true]);
      expect(sans.gestion.net).toEqual({ htC: avec.gestion.net.htC + s.htC, ttcC: avec.gestion.net.ttcC + s.ttcC });
    });
  }
  it('la location seule ne change pas ; la gestion seule : la même règle', () => {
    expect(totauxFusion(lignes, gestion, annee, 'location', false).net).toEqual(totauxFusion(lignes, gestion, annee, 'location').net);
    const g1 = totauxFusion(lignes, gestion, annee, 'gestion'); const g2 = totauxFusion(lignes, gestion, annee, 'gestion', false);
    expect(g2.net.htC - g1.net.htC).toBe(g1.couts.salaries.htC);
  });
});
