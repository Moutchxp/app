import { describe, expect, it } from 'vitest';
import { E_COUTS } from './__fixtures__/couts';
import { lienSourceCa, moisDeLaFenetre, tableauRecap, type EntreesRecap } from './recap';
import { coutsVenteDeLaSociete } from '../transaction/grapheGlobal';
import { coutsGlobaux } from '../transaction/coutsGlobal';
import type { Validation } from './saisieMois';

/**
 * 🔴🔴 RÉCAPITULATIF « COÛTS ET CA » — CA VENTE et CA LOCATION (Arno, 13/11/2026), sur le modèle du CA GESTION ; tout DÉRIVÉ :
 *   · CA vente = la PART de la structure (le `ca` de sa carte − la part reversée à l'autre sur une vente partagée : option B d'Arno) ; coûts de vente = le sous-total vente ; CA net = la différence ;
 *   · CA location = le `ca` du Suivi CA › Location ; coûts de location = le sous-total location ; CA net = la différence ;
 *   · AUCUNE DOUBLE DÉDUCTION : CA − (commissions, apporteurs, agences extérieures) = le net des cartes ; CA location − ses coûts = le net de la Location.
 */
const JOUR = '2026-11-13';
const entrees = (x: Partial<EntreesRecap> = {}): EntreesRecap => ({ e: E_COUTS, agence: 'criterimmo', mois: moisDeLaFenetre('annee', JOUR), jour: JOUR, validations: [],
  versionsGestion: {}, monga: true, caGestion: true, ...x });
const t = tableauRecap(entrees());
const ligne = (tt: ReturnType<typeof tableauRecap>, cle: string) => tt.lignes.find((l) => l.cle === cle)!;
const somme = (l: ReturnType<typeof ligne>) => l.cellules.reduce((x, c) => ({ htC: x.htC + c.m.htC, ttcC: x.ttcC + c.m.ttcC }), { htC: 0, ttcC: 0 });

describe('l’ordre et la forme des sections', () => {
  it('sous « Total des coûts » : CA VENTE, CA LOCATION, puis CA GESTION (inchangée) ; trois lignes chacune, en lecture', () => {
    const sections = [...new Set(t.lignes.map((l) => l.section))];
    expect(sections).toEqual(['couts', 'ca-vente', 'ca-location', 'ca']);
    expect(t.lignes.filter((l) => l.section === 'ca-vente').map((l) => [l.cle, l.libelle])).toEqual([['cav-ca', 'CA vente'],
      ['cav-couts', 'Coûts de vente (repris du sous-total vente)'], ['cav-net', 'CA net de vente']]);
    expect(t.lignes.filter((l) => l.section === 'ca-location').map((l) => l.libelle)).toEqual(['CA location', 'Coûts de location (repris du sous-total location)', 'CA net de location']);
    expect(t.lignes.filter((l) => l.section === 'ca').map((l) => l.cle)).toEqual(['ca-honoraires', 'ca-gli', 'ca-total', 'ca-couts-gestion', 'ca-net']);
    expect([...ligne(t, 'cav-ca').cellules, ...ligne(t, 'cal-ca').cellules].every((c) => c.modifiable === 'source')).toBe(true);
    expect([...ligne(t, 'cav-net').cellules, ...ligne(t, 'cal-couts').cellules].every((c) => c.modifiable === 'non')).toBe(true);
  });
});

describe('les montants, mois par mois et en total, HT et TTC', () => {
  it('CA vente = le CA des cartes de la structure ; coûts = le sous-total vente ; net = CA − coûts (HT et TTC, chacun dans son mode) ; Total = somme des mois', () => {
    for (let k = 0; k < 12; k++) {
      const brut = coutsVenteDeLaSociete(E_COUTS, 'criterimmo', 2026, k + 1).ca; const r = ligne(t, 'cav-ca').cellules[k].reverse;
      const ca = r === undefined ? brut : { htC: brut.htC - r.m.htC, ttcC: brut.ttcC - r.m.ttcC }; // B : la part de la structure
      expect(ligne(t, 'cav-ca').cellules[k].m).toEqual(ca);
      expect(ligne(t, 'cav-couts').cellules[k].m).toEqual(ligne(t, 'vente-total').cellules[k].m);
      expect(ligne(t, 'cav-net').cellules[k].m).toEqual({ htC: ca.htC - ligne(t, 'vente-total').cellules[k].m.htC, ttcC: ca.ttcC - ligne(t, 'vente-total').cellules[k].m.ttcC });
    }
    for (const c of ['cav-ca', 'cav-couts', 'cav-net', 'cal-ca', 'cal-couts', 'cal-net']) expect(ligne(t, c).total).toEqual(somme(ligne(t, c)));
  });
  it('CA location = le CA du Suivi CA › Location ; coûts = le sous-total location ; net = CA − coûts', () => {
    for (let k = 0; k < 12; k++) {
      const L = coutsGlobaux(E_COUTS, 2026, k + 1, true).location!;
      expect(ligne(t, 'cal-ca').cellules[k].m).toEqual(L.ca);
      expect(ligne(t, 'cal-couts').cellules[k].m).toEqual(ligne(t, 'location-total').cellules[k].m);
    }
  });
  it('🔴 AUCUNE DOUBLE DÉDUCTION : le CA net de vente = la part de la structure − (commissions, apporteurs, agences extérieures, coûts saisis), chacun UNE fois ; location : CA − ses coûts comptés = son net', () => {
    for (let k = 0; k < 12; k++) {
      const v = coutsVenteDeLaSociete(E_COUTS, 'criterimmo', 2026, k + 1);
      const saisis = ['vente-remunerations', 'vente-salaires', 'vente-autres'].reduce((x, c) => x + ligne(t, c).cellules[k].m.htC, 0);
      expect(ligne(t, 'cav-couts').cellules[k].m.htC).toBe(v.commissions.htC + v.apporteurs.htC + v.exterieures.htC + saisis);
      expect(ligne(t, 'cav-net').cellules[k].m.htC).toBe(ligne(t, 'cav-ca').cellules[k].m.htC - ligne(t, 'cav-couts').cellules[k].m.htC);
      const L = coutsGlobaux(E_COUTS, 2026, k + 1, true).location!;
      expect(L.ca.htC - L.couts.htC).toBe(L.net.htC);
    }
  });
  it('🔴 B — la vente PARTAGÉE de mars (3 333,39 € HT portée par CRITERIMMO, 1 666,70 € à MACJ) : CRITERIMMO 1 666,69 € (sa part), MACJ 1 666,70 €, FUSION 3 333,39 € = la somme ; CA net CRITERIMMO 1 366,66 €', () => {
    const m = tableauRecap(entrees({ agence: 'macj' })); const f = tableauRecap(entrees({ agence: 'tous' }));
    expect([ligne(t, 'cav-ca').cellules[2].m.htC, ligne(m, 'cav-ca').cellules[2].m.htC, ligne(f, 'cav-ca').cellules[2].m.htC]).toEqual([166669, 166670, 333339]);
    expect(ligne(t, 'cav-ca').cellules[2].m.ttcC + ligne(m, 'cav-ca').cellules[2].m.ttcC).toBe(ligne(f, 'cav-ca').cellules[2].m.ttcC);
    expect(ligne(t, 'cav-net').cellules[2].m.htC).toBe(136666);
    expect(ligne(t, 'cav-ca').cellules[2].reverse).toEqual({ m: { htC: 166670, ttcC: 200004 }, vers: 'macj', ventes: [{ libelle: 'PARTAGÉE', htC: 166670 }] });
    expect([ligne(m, 'cav-ca').cellules[2].reverse, ligne(f, 'cav-ca').cellules[2].reverse, ligne(t, 'cav-ca').cellules[5].reverse]).toEqual([undefined, undefined, undefined]);
  });
  it('un résultat négatif reste négatif (le signe ; le rouge : à l’écran)', () => {
    const neg = tableauRecap(entrees({ e: { ...E_COUTS, saisis: [...(E_COUTS.saisis ?? []), { societe: 'criterimmo', famille: 'vente', poste: 'autres', annee: 2026, mois: 1, montantHt: 9_999_999, tva: false }] } }));
    expect(ligne(neg, 'cav-net').cellules[0].m.htC).toBeLessThan(0);
  });
  it('« provisoire » : un coût de la famille à compléter ce mois écoulé ; tout coché : neutre ; mois en cours : neutre', () => {
    expect(ligne(t, 'cav-net').cellules[9].etat).toBe('provisoire');
    expect(ligne(t, 'cav-net').cellules[10].etat).toBe('neutre');
    const v = (poste: Validation['poste']): Validation => ({ societe: 'criterimmo', famille: 'vente', poste, annee: 2026, mois: 10 });
    const tout = tableauRecap(entrees({ validations: [v('remunerations'), v('salaires'), v('autres')] }));
    expect(ligne(tout, 'cav-net').cellules[9].etat).toBe('neutre');
    expect(ligne(tout, 'cal-net').cellules[9].etat).toBe('provisoire'); // la location, elle, reste à compléter
  });
});

describe('les structures et les périodes', () => {
  it('MACJ : CA VENTE seule ; FUSION = CRITERIMMO + MACJ (lecture) ; 12 mois glissants et ‹ ›', () => {
    const m = tableauRecap(entrees({ agence: 'macj' }));
    expect([...new Set(m.lignes.map((l) => l.section))]).toEqual(['couts', 'ca-vente']);
    const f = tableauRecap(entrees({ agence: 'tous' }));
    for (let k = 0; k < 12; k++) expect(ligne(f, 'cav-ca').cellules[k].m.htC).toBe(ligne(t, 'cav-ca').cellules[k].m.htC + ligne(m, 'cav-ca').cellules[k].m.htC); // B : la somme des parts
    expect(ligne(f, 'cal-ca').cellules.map((c) => c.m)).toEqual(ligne(t, 'cal-ca').cellules.map((c) => c.m));
    const g = tableauRecap(entrees({ mois: moisDeLaFenetre('glissant', JOUR, -1) }));
    expect(ligne(g, 'cav-ca').cellules.at(-1)!.m).toEqual(ligne(t, 'cav-ca').cellules[8].m); // septembre 2026 dans les deux fenêtres
  });
  it('la source d’un CA : la page du Suivi CA de la structure au mois ; FUSION : sa page ; la location : Suivi CA › Location', () => {
    expect(lienSourceCa('ca-vente', 'criterimmo', { annee: 2026, mois: 3 })).toBe('/admin/transaction/criterimmo?vue=mois&annee=2026&mois=3');
    expect(lienSourceCa('ca-vente', 'tous', { annee: 2026, mois: 3 })).toBe('/admin/transaction/fusion?vue=mois&annee=2026&mois=3');
    expect(lienSourceCa('ca-location', 'criterimmo', { annee: 2026, mois: 3 })).toBe('/admin/transaction/location?vue=mois&annee=2026&mois=3');
  });
});
