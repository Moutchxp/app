import { describe, expect, it } from 'vitest';
import type { GestionMois } from './modele';
import { anneesGestion, moisGestion, totauxGestion, valeurGestion } from './gestionVue';

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
});
