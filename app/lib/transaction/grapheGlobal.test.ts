import { describe, expect, it } from 'vitest';
import { FILTRES_GRAPHE_DEFAUT as D, filtresDepuisAdresse, filtresVersAdresse, nbFiltresActifs, raisonGrise, retenu, seriesDuPoint, type AtomeGraphe } from './grapheGlobal';

/** 🔴 LOT CG9 — les filtres du graphique du CA global : l'adresse, les choix grisés, la sélection des atomes, les séries (somme = total). */
const m = (c: number) => ({ htC: c, ttcC: Math.round(c * 1.2) });
const atomes: AtomeGraphe[] = [
  { structure: 'criterimmo', activite: 'vente', famille: null, m: m(1000) }, { structure: 'macj', activite: 'vente', famille: null, m: m(500) },
  { structure: 'a_attribuer', activite: 'vente', famille: null, m: m(100) }, { structure: 'inter', activite: 'vente', famille: null, m: m(-200) },
  { structure: 'criterimmo', activite: 'location', famille: null, m: m(300) }, { structure: 'criterimmo', activite: 'gestion', famille: null, m: m(400) },
  { structure: 'criterimmo', activite: 'vente', famille: 'commissions', m: m(150) }, { structure: 'macj', activite: 'vente', famille: 'commissions', m: m(50) },
  { structure: 'criterimmo', activite: 'location', famille: 'primes', m: m(30) }, { structure: 'criterimmo', activite: 'gestion', famille: 'adhoc', m: m(80) },
];
describe('🔴 LOT CG9 — grapheGlobal', () => {
  it('tout coché : CA = somme − inter ; coûts ; net = CA − coûts ; chaque comparaison : somme des séries = total', () => {
    expect(seriesDuPoint(atomes, { ...D, mesure: 'ca' }).total.htC).toBe(2100);
    expect(seriesDuPoint(atomes, { ...D, mesure: 'couts' }).total.htC).toBe(310);
    expect(seriesDuPoint(atomes, { ...D, mesure: 'net' }).total.htC).toBe(1790);
    for (const comparer of ['structures', 'activites', 'familles'] as const) for (const mesure of ['ca', 'couts', 'net'] as const) {
      if (comparer === 'familles' && mesure !== 'couts') continue;
      const s = seriesDuPoint(atomes, { ...D, mesure, comparer });
      expect([comparer, mesure, s.series.reduce((t, x) => t + x.m.htC, 0)]).toEqual([comparer, mesure, s.total.htC]);
    }
    expect(seriesDuPoint(atomes, { ...D, comparer: 'structures' }).series.map((x) => [x.cle, x.m.htC])).toEqual([['criterimmo', 1700], ['macj', 500], ['a_attribuer', 100], ['inter', -200]]);
  });
  it('l’inter-cabinet : retiré seulement avec CRITERIMMO ET MACJ ; une famille décochée sort des coûts ; Location + Gestion', () => {
    expect(retenu(atomes[3], { ...D, structures: ['criterimmo'] })).toBe(false);
    expect(seriesDuPoint(atomes, { ...D, structures: ['criterimmo'] }).total.htC).toBe(1700);
    expect(seriesDuPoint(atomes, { ...D, mesure: 'couts', familles: ['adhoc'] }).total.htC).toBe(80);
    expect(seriesDuPoint(atomes, { ...D, mesure: 'net', activites: ['location', 'gestion'] }).total.htC).toBe(300 + 400 - 30 - 80);
  });
  it('les choix grisés ; les filtres actifs ; l’adresse aller-retour', () => {
    expect(raisonGrise({ ...D, activites: ['location'] }, { sorte: 'structure', cle: 'macj' })).toBe('MACJ n’a que de la vente : cochez « Vente ».');
    expect(raisonGrise({ ...D, mesure: 'couts' }, { sorte: 'structure', cle: 'a_attribuer' })).toBe('Les ventes à attribuer n’ont aucun coût associé.');
    expect(raisonGrise(D, { sorte: 'comparer', cle: 'familles' })).toBe('Seulement avec la mesure « Coûts ».');
    expect(raisonGrise(D, { sorte: 'affichage' })).not.toBeNull();
    expect(raisonGrise({ ...D, comparer: 'activites' }, { sorte: 'affichage' })).toBeNull();
    expect(nbFiltresActifs(D)).toBe(0);
    const f = { ...D, mesure: 'couts' as const, familles: ['adhoc' as const], structures: [], comparer: 'familles' as const, cumul: true, empile: false };
    const a = filtresVersAdresse(f);
    expect(filtresDepuisAdresse((k) => a[k] ?? null)).toEqual(f);
    expect(Object.values(filtresVersAdresse(D)).every((x) => x === null)).toBe(true);
    expect(nbFiltresActifs(f)).toBe(6);
  });
});
