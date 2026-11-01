import { describe, expect, it } from 'vitest';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import type { GestionMois } from './modele';
import { coutsLocation, ligneLocationCa, lignesDesMois, totauxLocation } from './locationCa';
import { totauxGestion } from './gestionVue';
import { anneesFusion, aSaisirFusion, FAMILLES_COUTS, totauxFusion } from './fusionLocationGestion';
import { aSaisirGestion } from './gestionVue';
import { moisCommence, motSalairesASaisir, nbMoisSalairesASaisir } from './periodeMois';

/**
 * 🔴 LOT LG1 — la FUSION Location & Gestion n'a aucun calcul propre : la part location = `totauxLocation` (page Location), la part gestion =
 * `totauxGestion` (page Gestion), au centime, HT et TTC (salaires chargés sans TVA) ; total = somme ; « Activité » = partition exacte ;
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

const RIEN = { htC: 0, ttcC: 0 };
const plus = (x: { htC: number; ttcC: number }, y: { htC: number; ttcC: number }) => ({ htC: x.htC + y.htC, ttcC: x.ttcC + y.ttcC });

describe('🔴 LOT LG1 / LO11 — la fusion = la somme des deux pages, mois par mois, au centime', () => {
  it('septembre 2026 (salaires de gestion saisis, aucun de location) : CA = les deux pages ; 🔴 LOT LO15 — primes et variable DÉDUITS (les salaires de la gestion n’y jouent pas)', () => {
    const t = totauxFusion(lignes, gestion, sept);
    const L = totauxLocation(lignesDesMois(lignes, sept)); const G = totauxGestion(gestion, sept); const C = coutsLocation(lignes, sept, [], null);
    // 🔴 LOT LO15 — seuls les salaires de la LOCATION rendent primes et variable « inclus » : ici aucun, ils sont déduits (la page Location)
    expect([t.location.ca, t.location.couts.primes, t.location.couts.variable, t.location.deduits.primes, t.location.deduits.variable]).toEqual([L.ca, L.primes, C.variable, L.primes, C.variable]);
    expect(t.location.net).toEqual(C.net);
    expect([t.inclus.primes, t.inclus.variable, t.inclus.mois]).toEqual([RIEN, RIEN, 0]);
    expect([t.gestion.ca, t.gestion.net]).toEqual([{ htC: G.honorairesC, ttcC: G.honorairesTtcC }, { htC: G.netC, ttcC: G.netTtcC }]);
    expect([t.gestion.couts.adhoc, t.gestion.couts.monga, t.gestion.couts.salaries]).toEqual([{ htC: G.adhocC, ttcC: G.adhocTtcC }, { htC: G.mongaC, ttcC: G.mongaTtcC }, { htC: 268891, ttcC: 268891 }]);
    expect(t.ca).toEqual({ htC: L.ca.htC + G.honorairesC, ttcC: L.ca.ttcC + G.honorairesTtcC });
    expect(t.coutsTotal).toEqual({ htC: C.couts.htC + G.adhocC + G.mongaC + G.salariesC, ttcC: C.couts.ttcC + G.adhocTtcC + G.mongaTtcC + G.salariesC });
    expect([t.baux, t.lots]).toEqual([1, 300]);
  });
  for (const ms of [sept, annee]) {
    it(`tuile 4 = tuile 1 − tuile 3, au centime, HT et TTC ; coûts = somme des familles déduites (${ms.length} mois)`, () => {
      for (const sal of [true, false]) {
        const t = totauxFusion(lignes, gestion, ms, 'deux', sal);
        expect([t.net.htC, t.net.ttcC]).toEqual([t.ca.htC - t.coutsTotal.htC, t.ca.ttcC - t.coutsTotal.ttcC]);
        expect(FAMILLES_COUTS.reduce((x, f) => x + t.deduits[f.cle].ttcC, 0)).toBe(t.coutsTotal.ttcC);
        expect([t.location.net.htC + t.gestion.net.htC, t.location.net.ttcC + t.gestion.net.ttcC]).toEqual([t.net.htC, t.net.ttcC]);
      }
    });
  }
  it('« Activité » : partition exacte, « Avec » comme « Sans salaires » (🔴 LOT LO15 : plus de primes « inclus » dans les salaires de la gestion)', () => {
    const d = totauxFusion(lignes, gestion, annee, 'deux'); const l = totauxFusion(lignes, gestion, annee, 'location'); const gg = totauxFusion(lignes, gestion, annee, 'gestion');
    // la location seule = la page Location (aucun salaire de location saisi : primes et variable déduits)
    const C = coutsLocation(lignes, annee, [], null);
    expect([l.net, l.coutsTotal, l.inclus.mois]).toEqual([C.net, C.couts, 0]);
    for (const u of ['htC', 'ttcC'] as const) { expect(l.coutsTotal[u] + gg.coutsTotal[u]).toBe(d.coutsTotal[u]); expect(l.net[u] + gg.net[u]).toBe(d.net[u]); }
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
 * 🔴 LOT LG2 / LO11 — « Sans salaires » : aucun salaire compté (gestion et location), primes et variable toujours déduits ; « Avec » = Sans +
 * salaires − primes et variable des mois avec salaires ; tuile 4 = tuile 1 − tuile 3 dans les deux modes.
 */
describe('🔴 LOT LG2 / LO11 — Avec | Sans salaires', () => {
  for (const ms of [sept, annee]) {
    it(`Avec = Sans + salaires chargés − primes et variable inclus, au centime, HT et TTC (${ms.length} mois)`, () => {
      const avec = totauxFusion(lignes, gestion, ms); const sans = totauxFusion(lignes, gestion, ms, 'deux', false);
      const s = plus(avec.couts.salaries, avec.couts.salairesLocation); const inc = plus(avec.inclus.primes, avec.inclus.variable);
      expect([s.htC, sans.inclus.mois]).toEqual([s.ttcC, 0]);
      expect([avec.coutsTotal.htC, avec.coutsTotal.ttcC]).toEqual([sans.coutsTotal.htC + s.htC - inc.htC, sans.coutsTotal.ttcC + s.ttcC - inc.ttcC]);
      expect([sans.ca, sans.couts, sans.salaires, avec.salaires]).toEqual([avec.ca, avec.couts, false, true]);
      expect(sans.gestion.net).toEqual({ htC: avec.gestion.net.htC + avec.couts.salaries.htC, ttcC: avec.gestion.net.ttcC + avec.couts.salaries.ttcC });
    });
  }
  it('la gestion seule : la même règle (salaires non comptés en « Sans »)', () => {
    const g1 = totauxFusion(lignes, gestion, annee, 'gestion'); const g2 = totauxFusion(lignes, gestion, annee, 'gestion', false);
    expect(g2.net.htC - g1.net.htC).toBe(g1.couts.salaries.htC);
  });
});

/**
 * 🔴 LOT LO11 — LES SALAIRES CHARGÉS DE LA LOCATION ET LES RÉTROCESSIONS : un mois avec salaires de location saisis — la location seule déduit ses
 * apporteurs et ses salaires, pas ses primes ni son variable (montrés, « inclus ») ; une rétrocession diminue le variable du mois.
 */
describe('🔴 LOT LO11 — salaires de la Location, rétrocessions', () => {
  const sal = [{ annee: 2026, mois: 8, salairesHt: 1000, note: null }];
  it('août 2026 : salaires de location saisis — la page Location (activité Location) : apporteurs + salaires ; primes et variable inclus', () => {
    const aout = [{ annee: 2026, mois: 8 }];
    const C = coutsLocation(lignes, aout, [], sal);
    expect([C.salaires, C.primesDeduites, C.variableDeduit, C.moisAvecSalaires]).toEqual([{ htC: 100000, ttcC: 100000 }, RIEN, RIEN, 1]);
    expect(C.net).toEqual({ htC: C.ca.htC - C.apporteurs.htC - 100000, ttcC: C.ca.ttcC - C.apporteurs.ttcC - 100000 });
    const l = totauxFusion(lignes, gestion, aout, 'location', true, { retros: [], salaires: sal });
    expect([l.net, l.deduits.salairesLocation, l.inclus.mois]).toEqual([C.net, { htC: 100000, ttcC: 100000 }, C.variable.htC !== 0 || C.primes.htC !== 0 ? 1 : 0]);
    // « Sans salaires » : les salaires de la location ne sont pas comptés, primes et variable déduits
    const s = totauxFusion(lignes, gestion, aout, 'location', false, { retros: [], salaires: sal });
    expect([s.deduits.salairesLocation, s.couts.salairesLocation, s.deduits.variable]).toEqual([RIEN, { htC: 100000, ttcC: 100000 }, C.variable]);
  });
  it('un mois sans salaires : primes + variable déduits ; une rétrocession diminue le variable (sans TVA)', () => {
    const C0 = coutsLocation(lignes, sept, [], null);
    const C1 = coutsLocation(lignes, sept, [{ annee: 2026, mois: 9, negociateurCle: 'id:5', montantC: { htC: 2000, ttcC: 2400 } }], null);
    expect([C1.variable.htC, C1.variable.ttcC]).toEqual([C0.variable.htC - 2000, C0.variable.ttcC - 2000]);
    expect(C0.couts).toEqual(plus(plus(C0.apporteurs, C0.primes), C0.variable));
    expect(C0.variable.htC).toBe(lignesDesMois(lignes, sept).reduce((x, l) => x + l.variableC.htC, 0));
  });
});

/**
 * 🔴 LOT LO12 / LO15 — FUSION = Location + Gestion, dans les deux modes : exactement la somme des deux pages (chacune dans le même mode). 🔴 LOT
 * LO15 — l'écart d'avant (les primes et le variable des mois où seule la gestion avait des salaires, « inclus ») disparaît.
 */
describe('🔴 LOT LO12 — FUSION = Location + Gestion, avec et sans salaires', () => {
  const sal = [{ annee: 2026, mois: 8, salairesHt: 1000, note: null }];
  for (const avecS of [true, false]) {
    it(`${avecS ? 'Avec' : 'Sans'} salaires : les parts = les pages (coutsLocation, totauxGestion), au centime, HT et TTC`, () => {
      const f = totauxFusion(lignes, gestion, annee, 'deux', avecS, { retros: [], salaires: sal });
      const L = coutsLocation(lignes, annee, [], sal, avecS);
      const G = totauxGestion(gestion, annee, avecS);
      expect(f.gestion.net).toEqual({ htC: G.netC, ttcC: G.netTtcC });
      // la location : sa page, au centime, dans les deux modes (🔴 LOT LO15)
      const fl = totauxFusion(lignes, gestion, annee, 'location', avecS, { retros: [], salaires: sal });
      expect([fl.net, f.location.net, f.location.coutsTotal]).toEqual([L.net, L.net, L.couts]);
      expect(f.net).toEqual(plus(f.location.net, f.gestion.net));
      expect(f.coutsTotal).toEqual(plus(f.location.coutsTotal, f.gestion.coutsTotal));
    });
  }
  it('Sans = Avec + salaires − primes et variable inclus, page Location seule (coutsLocation)', () => {
    const avec = coutsLocation(lignes, annee, [], sal); const sans = coutsLocation(lignes, annee, [], sal, false);
    expect([sans.salaires, sans.salairesSaisis, sans.moisAvecSalaires, sans.moisSaisis]).toEqual([RIEN, avec.salaires, 0, 1]);
    expect(sans.net.htC - avec.net.htC).toBe(avec.salaires.htC - (avec.primes.htC - avec.primesDeduites.htC) - (avec.variable.htC - avec.variableDeduit.htC));
    expect(sans.net.ttcC - avec.net.ttcC).toBe(avec.salaires.ttcC - (avec.primes.ttcC - avec.primesDeduites.ttcC) - (avec.variable.ttcC - avec.variableDeduit.ttcC));
  });
});

/**
 * 🔴 LOT LO14 (règle d'Arno) — les commissions d'apporteurs et les primes de nouvelle gestion de la location sont SANS TVA (TTC = HT) ; le HT ne
 * change pas ; le CA garde sa TVA ; la FUSION les reprend, avec et sans salaires.
 */
describe('🔴 LOT LO14 — primes et apporteurs sans TVA', () => {
  const sal = [{ annee: 2026, mois: 8, salairesHt: 1000, note: null }];
  it('chaque ligne : prime et apporteur TTC = HT ; CA TTC = HT × 1,20 ; le reste TTC = CA TTC − prime − apporteur', () => {
    for (const l of lignes) {
      expect([l.primeC.ttcC, l.apporteurC.ttcC, l.caC.ttcC]).toEqual([l.primeC.htC, l.apporteurC.htC, Math.round(l.caC.htC * 1.2)]);
      expect(l.netC).toEqual({ htC: l.caC.htC - l.primeC.htC - l.apporteurC.htC, ttcC: l.caC.ttcC - l.primeC.htC - l.apporteurC.htC });
    }
    expect(lignes.some((l) => l.primeC.htC !== 0) && lignes.some((l) => l.apporteurC.htC !== 0)).toBe(true);
  });
  for (const avecS of [true, false]) {
    it(`${avecS ? 'Avec' : 'Sans'} salaires : la FUSION — primes et apporteurs TTC = HT ; CA net TTC = CA brut TTC − coûts TTC ; = Location + Gestion`, () => {
      const f = totauxFusion(lignes, gestion, annee, 'deux', avecS, { retros: [], salaires: sal });
      for (const k of ['primes', 'apporteurs', 'variable', 'salairesLocation', 'salaries'] as const) expect([k, f.couts[k].ttcC]).toEqual([k, f.couts[k].htC]);
      expect(f.net).toEqual({ htC: f.ca.htC - f.coutsTotal.htC, ttcC: f.ca.ttcC - f.coutsTotal.ttcC });
      const L = coutsLocation(lignes, annee, [], sal, avecS);
      expect([L.primes.ttcC, L.apporteurs.ttcC]).toEqual([L.primes.htC, L.apporteurs.htC]);
      const fl = totauxFusion(lignes, gestion, annee, 'location', avecS, { retros: [], salaires: sal });
      expect(fl.net).toEqual(L.net);
    });
  }
});

/**
 * 🔴 LOT LO15 (règle d'Arno) — les primes et le variable sont payés au négociateur de la location, dont le salaire est saisi dans les salaires chargés
 * de la LOCATION : « Avec salaires », ils ne sont « inclus » (non déduits) que les mois où les salaires de la LOCATION sont saisis ; les salaires de
 * la Gestion n'y jouent plus. FUSION = Location + Gestion au centime, chaque mois et la période, HT et TTC, avec et sans salaires.
 */
describe('🔴 LOT LO15 — FUSION = Location + Gestion ; salaires « à saisir »', () => {
  // août : salaires de location saisis ; septembre : seuls ceux de la gestion
  const sal = [{ annee: 2026, mois: 8, salairesHt: 1000, note: null }];
  const loc = { retros: [], salaires: sal };
  for (const avecS of [true, false]) {
    it(`${avecS ? 'Avec' : 'Sans'} salaires : chaque mois de 2025-2026 et l’année, FUSION = page Location + page Gestion, HT et TTC`, () => {
      const mois = [...Array.from({ length: 12 }, (_, i) => ({ annee: 2025, mois: i + 1 })), ...annee];
      for (const ms of [...mois.map((m) => [m]), annee, mois]) {
        const f = totauxFusion(lignes, gestion, ms, 'deux', avecS, loc);
        const L = coutsLocation(lignes, ms, [], sal, avecS); const G = totauxGestion(gestion, ms, avecS);
        expect(f.location.net).toEqual(L.net);
        expect(f.gestion.net).toEqual({ htC: G.netC, ttcC: G.netTtcC });
        expect(f.net).toEqual({ htC: L.net.htC + G.netC, ttcC: L.net.ttcC + G.netTtcC });
        expect(f.ca).toEqual({ htC: L.ca.htC + G.honorairesC, ttcC: L.ca.ttcC + G.honorairesTtcC });
        expect(f.coutsTotal).toEqual({ htC: L.couts.htC + G.honorairesC - G.netC, ttcC: L.couts.ttcC + G.honorairesTtcC - G.netTtcC });
      }
    });
  }
  it('un mois AVEC salaires de location saisis (août) : primes et variable « inclus » ; un mois avec seulement ceux de la gestion (septembre) : déduits', () => {
    const aout = totauxFusion(lignes, gestion, [{ annee: 2026, mois: 8 }], 'deux', true, loc);
    expect([aout.location.deduits.primes, aout.location.deduits.variable, aout.location.deduits.salairesLocation]).toEqual([RIEN, RIEN, { htC: 100000, ttcC: 100000 }]);
    expect(aout.inclus.mois).toBe(aout.location.couts.primes.htC !== 0 || aout.location.couts.variable.htC !== 0 ? 1 : 0);
    const sep = totauxFusion(lignes, gestion, sept, 'deux', true, loc);
    expect(gestion.find((x) => x.annee === 2026 && x.mois === 9)?.salarieHt).not.toBeNull();
    expect([sep.location.deduits.primes, sep.location.deduits.variable, sep.inclus.mois]).toEqual([sep.location.couts.primes, sep.location.couts.variable, 0]);
    expect(sep.location.couts.primes.htC + sep.location.couts.variable.htC).toBeGreaterThan(0);
  });
  it('« à saisir » : les mois commencés sans salaires saisis (Location : ses salaires ; Gestion : la case salarié, le mois non saisi compris)', () => {
    const jour = '2026-09-15';
    expect([moisCommence({ annee: 2026, mois: 9 }, jour), moisCommence({ annee: 2026, mois: 10 }, jour), moisCommence({ annee: 2025, mois: 12 }, jour)]).toEqual([true, false, true]);
    // 2026 : 9 mois commencés ; août saisi (location) → 8 à saisir ; la gestion : août et septembre saisis → 7
    expect(nbMoisSalairesASaisir(annee, (m) => sal.some((x) => x.annee === m.annee && x.mois === m.mois), jour)).toBe(8);
    expect(aSaisirGestion(gestion, annee, jour)).toBe(7);
    expect(aSaisirGestion([g(2026, 9, { salarieHt: null })], sept, jour)).toBe(1);
    expect(aSaisirFusion(gestion, sal, annee, 'deux', jour)).toEqual({ location: 8, gestion: 7, mot: 'location : 8 mois de salaires à saisir · gestion : 7 mois de salaires à saisir' });
    expect(aSaisirFusion(gestion, sal, annee, 'location', jour)).toEqual({ location: 8, gestion: 0, mot: '8 mois de salaires à saisir' });
    expect(aSaisirFusion(gestion, sal, [{ annee: 2026, mois: 8 }], 'location', jour).mot).toBe('');
    expect(motSalairesASaisir(1)).toBe('1 mois de salaires à saisir');
  });
});
