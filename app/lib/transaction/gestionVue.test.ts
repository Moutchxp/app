import { describe, expect, it } from 'vitest';
import type { GestionMois } from './modele';
import { anneesGestion, centimesGestion, ligneGestionEnUnite, moisGestion, TAUX_TVA_ADHOC, TAUX_TVA_MONGA, totauxGestion, valeurGestion } from './gestionVue';
import { resteGestionPropose } from './modele';

/** 🔴 LOT GE1 (Arno) — l'écran « Gestion » : CA net = honoraires − ADHOC − salariés, au centime ; mois non saisi = 0. */
const g = (id: number, annee: number, mois: number, o: Partial<GestionMois>): GestionMois =>
  ({ id, annee, mois, nbLots: null, honorairesHt: null, adhocHt: null, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...o } as GestionMois);
const gestion = [
  g(1, 2026, 9, { honorairesHt: 19066.46, adhocHt: 3206, nbLots: 300 }),
  g(2, 2026, 10, { honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, nbLots: 310 }),
  g(3, 2025, 10, { honorairesHt: 14000.005, adhocHt: 0, salarieHt: 1000.004 }),
];
describe('🔴 LOT GE1 — la gestion du mois et des périodes', () => {
  it('un mois : CA net = honoraires − ADHOC − salariés au centime ; un montant absent compte 0 ; un mois non saisi : 0, « non saisi »', () => {
    const o = moisGestion(gestion, 2026, 10);
    expect([o.honorairesC, o.adhocC, o.salariesC, o.netC, o.lots, o.saisi]).toEqual([1618463, 244900, 268891, 1104672, 310, true]);
    expect(o.honorairesC - o.adhocC - o.salariesC).toBe(o.netC);
    expect(moisGestion(gestion, 2026, 9).salariesC).toBe(0);
    const vide = moisGestion(gestion, 2026, 11);
    expect([vide.saisi, vide.netC, vide.lots]).toEqual([false, 0, null]);
    // chaque montant arrondi au centime avant la soustraction
    expect(moisGestion(gestion, 2025, 10).netC).toBe(1400001 - 100000);
  });
  it('une période : la somme des mois ; les lots en moyenne ; les mesures', () => {
    const t = totauxGestion(gestion, [{ annee: 2026, mois: 9 }, { annee: 2026, mois: 10 }, { annee: 2026, mois: 11 }]);
    expect([t.honorairesC, t.adhocC, t.salariesC, t.netC, t.lots, t.nbMois, t.nbSaisis]).toEqual([1906646 + 1618463, 320600 + 244900, 268891, 1906646 - 320600 + 1104672, 305, 3, 2]);
    expect(t.honorairesC - t.adhocC - t.salariesC).toBe(t.netC);
    expect([valeurGestion(t, 'net'), valeurGestion(t, 'lots'), valeurGestion(totauxGestion(gestion, [{ annee: 2024, mois: 1 }]), 'lots')]).toEqual([t.netC / 100, 305, 0]);
    expect(anneesGestion(gestion, '2026-10-31')).toEqual([2025, 2026]);
  });
  it('🔴 LOT GE2 — TTC : honoraires × 1,20, ADHOC × TAUX_TVA_ADHOC, salariés sans TVA ; CA net TTC = honoraires TTC − ADHOC TTC − salariés, au centime', () => {
    const t = totauxGestion(gestion, [{ annee: 2026, mois: 10 }]);
    expect([TAUX_TVA_ADHOC, centimesGestion(t, 'honoraires', 'ttc'), centimesGestion(t, 'adhoc', 'ttc'), centimesGestion(t, 'salaries', 'ttc'), centimesGestion(t, 'salaries', 'ht')])
      .toEqual([1.2, Math.round(1618463 * 1.2), 293880, 268891, 268891]);
    expect(centimesGestion(t, 'net', 'ttc')).toBe(centimesGestion(t, 'honoraires', 'ttc') - centimesGestion(t, 'adhoc', 'ttc') - centimesGestion(t, 'salaries', 'ttc'));
    expect(valeurGestion(t, 'net', 'ttc')).toBe(centimesGestion(t, 'net', 'ttc') / 100);
    // une ligne du tableau : le reste saisi reçoit la TVA des honoraires moins celle d'ADHOC
    const l = ligneGestionEnUnite({ honorairesHt: 16184.63, adhocHt: 2449, salarieHt: 2688.91, resteHt: 11046.72 }, 'ttc');
    expect(l).toEqual({ honoraires: 19421.56, adhoc: 2938.8, monga: null, salarie: 2688.91, reste: 13793.85 });
    expect(ligneGestionEnUnite(null, 'ttc')).toEqual({ honoraires: null, adhoc: null, monga: null, salarie: null, reste: null });
  });
  it('🔴 LOT GE3 — MONGA : CA net = honoraires − ADHOC − MONGA − salariés, au centime, HT et TTC (MONGA × TAUX_TVA_MONGA) ; un mois sans MONGA inchangé ; le reste proposé', () => {
    const avec = [...gestion, g(4, 2026, 8, { honorairesHt: 22725, adhocHt: 3206.4, mongaHt: 500.05, salarieHt: 100, resteHt: 18918.55 })];
    const t = totauxGestion(avec, [{ annee: 2026, mois: 8 }]);
    expect([TAUX_TVA_MONGA, t.mongaC, t.netC, centimesGestion(t, 'monga', 'ttc'), centimesGestion(t, 'net', 'ttc')])
      .toEqual([1.2, 50005, 2272500 - 320640 - 50005 - 10000, 60006, 2727000 - 384768 - 60006 - 10000]);
    expect(t.honorairesC - t.adhocC - t.mongaC - t.salariesC).toBe(t.netC);
    // un mois sans MONGA : exactement comme avant (le mois 10 de 2026)
    expect(moisGestion(avec, 2026, 10).netC).toBe(1618463 - 244900 - 268891);
    expect([valeurGestion(t, 'monga'), valeurGestion(t, 'monga', 'ttc')]).toEqual([500.05, 600.06]);
    // le tableau en TTC : le reste saisi reçoit aussi la TVA de MONGA en moins
    expect(ligneGestionEnUnite(avec.at(-1)!, 'ttc')).toEqual({ honoraires: 27270, adhoc: 3847.68, monga: 600.06, salarie: 100, reste: 22722.26 }); // 18 918,55 + 4 545 − 641,28 − 100,01
    expect([resteGestionPropose({ honorairesHt: 22725, adhocHt: 3206.4, mongaHt: 500.05, salarieHt: 100 }), resteGestionPropose({ honorairesHt: 100, adhocHt: 10, salarieHt: null })])
      .toEqual([22725 - 3206.4 - 500.05 - 100, 90]);
  });
});
