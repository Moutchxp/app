import { describe, expect, it } from 'vitest';
import type { MontantC } from '../transaction/partAgence';
import { coutsGlobaux } from '../transaction/coutsGlobal';
import { atomesDuPoint, coutsVenteDeLaSociete, FILTRES_GRAPHE_DEFAUT, seriesDuPoint, type StructureGraphe } from '../transaction/grapheGlobal';
import { variableNegociateur } from '../transaction/locationCa';
import type { Agence } from './agence';
import { coutsDeLAnnee, coutsDuPoint, ongletCoutsVisible, type CoutsDuPoint } from './couts';
import { E_COUTS, GESTION_COUTS, LIGNES_LOCATION_COUTS, RETROS_COUTS, VENTES_COUTS } from './__fixtures__/couts';

/**
 * 🔴 « LES COÛTS » (Arno, 03/11/2026, lot C1) — UNE SEULE COMPTABILITÉ : chaque poste, chaque famille, chaque mois et l'année de l'onglet = « Coûts
 * globaux » du Suivi CA (FUSION) ou la fonction du graphique du CA global (CRITERIMMO / MACJ), au centime, HT et TTC, sur 2025 et 2026 ;
 * CRITERIMMO + MACJ = FUSION ; la colonne « Variable négo (calculé) » (C3) = le calcul existant, hors totaux ; une année ne lit jamais une autre.
 */
const ANNEES = [2025, 2026];
const POINTS = [...Array.from({ length: 12 }, (_, i) => i + 1), null];
const AGENCES: Agence[] = ['criterimmo', 'macj', 'tous'];
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, { htC: 0, ttcC: 0 });
// le CA (sans objet pour la mesure « Coûts ») : les ventes, sans location ni gestion
const E_G = { ventes: VENTES_COUTS, location: null, gestion: [] };
const STRUCTURES: Record<Agence, StructureGraphe[]> = { criterimmo: ['criterimmo'], macj: ['macj'], tous: ['criterimmo', 'macj'] };

describe('🔴 les données d’essai portent de vrais coûts (sinon les égalités ne prouveraient rien)', () => {
  it('commissions, apporteurs, extérieures, location, gestion, mois à confirmer : non nuls', () => {
    const a = coutsGlobaux(E_COUTS, 2026, null);
    for (const m of [a.vente.commissions, a.vente.apporteurs, a.vente.exterieures, a.location!.apporteurs, a.location!.primes, a.location!.salaires, a.gestion.adhoc, a.gestion.monga, a.gestion.salaires])
      expect(m.htC).toBeGreaterThan(0);
    expect(coutsVenteDeLaSociete(E_COUTS, 'macj', 2026, 3).commissions.htC).toBeGreaterThan(0); // la part de MACJ sur la vente partagée
    expect(coutsDeLAnnee(E_COUTS, 'tous', 2026).aConfirmer?.vente.commissions.htC).toBeGreaterThan(0);
  });
});

describe('🔴 FUSION = « Coûts globaux », poste par poste, au centime (2025, 2026, chaque mois et l’année)', () => {
  for (const annee of ANNEES) it(String(annee), () => {
    for (const mois of POINTS) {
      const c = coutsGlobaux(E_COUTS, annee, mois, true); const p = coutsDuPoint(E_COUTS, 'tous', annee, mois);
      expect([p.vente.commissions, p.vente.apporteurs, p.vente.exterieures]).toEqual([c.vente.commissions, c.vente.apporteurs, c.vente.exterieures]);
      const L = c.location!;
      expect(p.location).toEqual({ apporteurs: L.apporteurs, primes: L.primesDeduites, variable: variableNegociateur(L.variableDeduit, L.primesDeduites), salaires: L.salaires,
        variableCalcule: variableNegociateur(L.variable, L.primes), total: somme([L.apporteurs, L.primesDeduites, L.variableDeduit, L.salaires]) });
      expect(p.gestion).toEqual({ salaires: c.gestion.salaires, adhoc: c.gestion.adhoc, monga: c.gestion.monga, total: somme([c.gestion.salaires, c.gestion.adhoc, c.gestion.monga]) });
      // le total de la page = celui de « Coûts globaux » = la somme des familles
      expect(p.total).toEqual(c.total);
      expect(somme([p.vente.total, p.location!.total, p.gestion!.total])).toEqual(c.total);
    }
  });
});

describe('🔴 CRITERIMMO, MACJ : la vente de la structure (fonction du graphique du CA global) ; CRITERIMMO + MACJ = FUSION', () => {
  for (const annee of ANNEES) it(String(annee), () => {
    for (const mois of POINTS) {
      const t = coutsDuPoint(E_COUTS, 'tous', annee, mois); const cr = coutsDuPoint(E_COUTS, 'criterimmo', annee, mois); const mj = coutsDuPoint(E_COUTS, 'macj', annee, mois);
      for (const [p, s] of [[cr, 'criterimmo'], [mj, 'macj']] as const) {
        const v = coutsVenteDeLaSociete(E_COUTS, s, annee, mois);
        expect([p.vente.commissions, p.vente.apporteurs, p.vente.exterieures]).toEqual([v.commissions, v.apporteurs, v.exterieures]);
      }
      for (const k of ['commissions', 'apporteurs', 'exterieures', 'total'] as const) expect(plus(cr.vente[k], mj.vente[k])).toEqual(t.vente[k]);
      // C7 : la location et la gestion sont à CRITERIMMO (comme FUSION) ; MACJ = vente seulement
      expect([cr.location, cr.gestion]).toEqual([t.location, t.gestion]);
      expect([mj.location, mj.gestion]).toEqual([null, null]);
      expect(plus(cr.total, mj.total)).toEqual(t.total);
    }
  });
});

describe('🔴 le graphique (GrapheGlobal, mesure « Coûts ») tombe sur les mêmes montants, structure imposée par « Voir »', () => {
  it.each(AGENCES)('%s — chaque mois et l’année, 2025 et 2026', (a) => {
    for (const annee of ANNEES) for (const mois of POINTS) {
      const s = seriesDuPoint(atomesDuPoint(E_G, E_COUTS, annee, mois, true), { ...FILTRES_GRAPHE_DEFAUT, mesure: 'couts', comparer: 'activites', structures: STRUCTURES[a] });
      const p = coutsDuPoint(E_COUTS, a, annee, mois);
      expect([annee, mois, s.total]).toEqual([annee, mois, p.total]);
      expect(s.series.find((x) => x.cle === 'vente')?.m ?? { htC: 0, ttcC: 0 }).toEqual(p.vente.total);
      if (p.location !== null) expect(s.series.find((x) => x.cle === 'location')!.m).toEqual(p.location.total);
      if (p.gestion !== null) expect(s.series.find((x) => x.cle === 'gestion')!.m).toEqual(p.gestion.total);
    }
  });
});

describe('🔴 le tableau d’une année : 12 mois + « mois à confirmer » = la ligne de l’année (celle de « Coûts globaux »)', () => {
  it.each(AGENCES)('%s', (a) => {
    for (const annee of ANNEES) {
      const t = coutsDeLAnnee(E_COUTS, a, annee);
      const lignes: CoutsDuPoint[] = [...t.mois, ...(t.aConfirmer === null ? [] : [t.aConfirmer])];
      expect(somme(lignes.map((x) => x.total))).toEqual(t.annee.total);
      for (const k of ['commissions', 'apporteurs', 'exterieures', 'total'] as const) expect(somme(lignes.map((x) => x.vente[k]))).toEqual(t.annee.vente[k]);
      if (t.annee.location !== null) for (const k of ['apporteurs', 'primes', 'variable', 'salaires', 'variableCalcule', 'total'] as const) expect(somme(lignes.map((x) => x.location![k]))).toEqual(t.annee.location[k]);
      if (t.annee.gestion !== null) for (const k of ['salaires', 'adhoc', 'monga', 'total'] as const) expect(somme(lignes.map((x) => x.gestion![k]))).toEqual(t.annee.gestion[k]);
      expect(t.annee).toEqual(coutsDuPoint(E_COUTS, a, annee, null));
    }
    // la vente « mois à confirmer » est de 2026 et de CRITERIMMO : une ligne à part en 2026, aucune en 2025, aucune pour MACJ
    expect(coutsDeLAnnee(E_COUTS, a, 2025).aConfirmer).toBeNull();
    expect(coutsDeLAnnee(E_COUTS, a, 2026).aConfirmer === null).toBe(a === 'macj');
  });
});

describe('🔴 C3 — « Variable négo (calculé) » : le calcul existant, pour information, jamais dans un total', () => {
  it('août 2026 (salaires de la Location saisis) : variable compté 0 (« inclus »), variable calculé > 0 ; le total de la location l’ignore', () => {
    const p = coutsDuPoint(E_COUTS, 'tous', 2026, 8).location!;
    expect(p.variable.htC).toBe(0);
    expect(p.variableCalcule.htC).toBeGreaterThan(0);
    expect(p.total).toEqual(somme([p.apporteurs, p.variable, p.salaires]));
  });
  it('septembre 2026 (sans salaires) : variable compté = variable calculé ; le total ne le compte qu’une fois', () => {
    const p = coutsDuPoint(E_COUTS, 'tous', 2026, 9).location!;
    expect(p.variable).toEqual(p.variableCalcule);
    expect(p.total).toEqual(somme([p.apporteurs, p.variable, p.salaires]));
  });
});

describe('🔴 une seule année : changer les données d’une autre année ne change rien à l’année montrée', () => {
  it.each(AGENCES)('%s — 2026 identique quand 2025 change (ventes, rétrocessions, location, gestion)', (a) => {
    const avant = coutsDeLAnnee(E_COUTS, a, 2026);
    const x3 = (n: number | null) => (n === null ? null : n * 3 + 0.01);
    const autre = { ...E_COUTS,
      ventes: VENTES_COUTS.map((v) => (v.annee === 2025 ? { ...v, honorairesTtc: x3(v.honorairesTtc)!, lignes: v.lignes.map((l) => ({ ...l, montantTtc: x3(l.montantTtc) })) } : v)),
      retrocessions: RETROS_COUTS.map((r) => (r.annee === 2025 ? { ...r, montantTtc: x3(r.montantTtc)! } : r)),
      location: { ...E_COUTS.location!, lignes: LIGNES_LOCATION_COUTS.filter((l) => l.annee !== 2025) },
      gestion: GESTION_COUTS.map((m) => (m.annee === 2025 ? { ...m, adhocHt: x3(m.adhocHt), salarieHt: x3(m.salarieHt) } : m)) };
    expect(coutsDeLAnnee(autre, a, 2026)).toEqual(avant);
    expect(coutsDeLAnnee(autre, a, 2025)).not.toEqual(coutsDeLAnnee(E_COUTS, a, 2025));
  });
});

describe('🔴 C1 + C2 — l’onglet : un associé, en mode agence', () => {
  it.each([
    [{ associe: true, administrateur: true }, 'tous', true], [{ associe: true, administrateur: true }, 'macj', true],
    [{ associe: true, administrateur: true }, null, false], [{ associe: false, administrateur: true }, 'criterimmo', false],
    [{ administrateur: true }, 'tous', false], [{ associe: true, administrateur: false }, 'tous', false],
  ] as const)('%j, %s → %s', (t, a, attendu) => { expect(ongletCoutsVisible(t, a)).toBe(attendu); });
});
