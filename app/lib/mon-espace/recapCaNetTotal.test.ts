import { describe, expect, it } from 'vitest';
import { E_COUTS } from './__fixtures__/couts';
import { moisDeLaFenetre, tableauRecap, type EntreesRecap } from './recap';
import { estConfidentiel } from '../transaction/confidentialiteSalaires';

/**
 * 🔴🔴 RÉCAPITULATIF « COÛTS ET CA » — le CA NET TOTAL (Arno, 13/11/2026), tout en bas : la SOMME des trois lignes « CA net » déjà affichées
 * (vente + location + gestion ; MACJ : la vente seule ; FUSION : les deux structures), mois par mois et en total, HT et TTC chacun dans son mode ;
 * provisoire si l'un d'eux l'est ; confidentiel si l'un d'eux l'est. Rien de stocké.
 */
const JOUR = '2026-11-13';
const entrees = (x: Partial<EntreesRecap> = {}): EntreesRecap => ({ e: E_COUTS, agence: 'criterimmo', mois: moisDeLaFenetre('annee', JOUR), jour: JOUR, validations: [],
  versionsGestion: {}, monga: true, caGestion: true, ...x });
type T = ReturnType<typeof tableauRecap>;
const ligne = (t: T, cle: string) => t.lignes.find((l) => l.cle === cle)!;
const t = tableauRecap(entrees());
const m = tableauRecap(entrees({ agence: 'macj' }));
const f = tableauRecap(entrees({ agence: 'tous' }));

describe('la ligne et sa place', () => {
  it('la DERNIÈRE ligne, seule de sa section « total », en lecture ; libellé selon la structure', () => {
    expect(t.lignes.at(-1)!.cle).toBe('total-net');
    expect(t.lignes.filter((l) => l.section === 'total').map((l) => [l.cle, l.libelle, l.niveau])).toEqual([['total-net', 'CA NET TOTAL (vente + location + gestion)', 'resultat']]);
    expect(ligne(m, 'total-net').libelle).toBe('CA NET TOTAL (vente)');
    expect(ligne(f, 'total-net').libelle).toBe('CA NET TOTAL (vente + location + gestion)');
    expect(ligne(t, 'total-net').cellules.every((c) => c.modifiable === 'non')).toBe(true);
  });
});

describe('le calcul : la somme des CA net affichés', () => {
  it('CRITERIMMO : mois par mois, HT et TTC = CA net de vente + de location + de gestion ; Total = la somme des mois = la somme des trois totaux', () => {
    for (let k = 0; k < 12; k++) for (const u of ['htC', 'ttcC'] as const) {
      expect(ligne(t, 'total-net').cellules[k].m[u]).toBe(ligne(t, 'cav-net').cellules[k].m[u] + ligne(t, 'cal-net').cellules[k].m[u] + ligne(t, 'ca-net').cellules[k].m[u]);
    }
    for (const u of ['htC', 'ttcC'] as const) {
      expect(ligne(t, 'total-net').total[u]).toBe(ligne(t, 'total-net').cellules.reduce((s, c) => s + c.m[u], 0));
      expect(ligne(t, 'total-net').total[u]).toBe(ligne(t, 'cav-net').total[u] + ligne(t, 'cal-net').total[u] + ligne(t, 'ca-net').total[u]);
    }
  });
  it('MACJ : le CA net de vente seul', () => {
    expect(ligne(m, 'total-net').cellules.map((c) => c.m)).toEqual(ligne(m, 'cav-net').cellules.map((c) => c.m));
    expect(ligne(m, 'total-net').total).toEqual(ligne(m, 'cav-net').total);
  });
  it('FUSION : la somme des deux structures (CRITERIMMO + MACJ), HT et TTC, mois par mois et en total', () => {
    for (let k = 0; k < 12; k++) expect(ligne(f, 'total-net').cellules[k].m).toEqual({ htC: ligne(t, 'total-net').cellules[k].m.htC + ligne(m, 'total-net').cellules[k].m.htC,
      ttcC: ligne(t, 'total-net').cellules[k].m.ttcC + ligne(m, 'total-net').cellules[k].m.ttcC });
    expect(ligne(f, 'total-net').total.htC).toBe(ligne(t, 'total-net').total.htC + ligne(m, 'total-net').total.htC);
  });
  it('12 mois glissants : le même mois a la même valeur que dans l’année', () => {
    const g = tableauRecap(entrees({ mois: moisDeLaFenetre('glissant', JOUR, -1) }));
    expect(ligne(g, 'total-net').cellules.at(-1)!.m).toEqual(ligne(t, 'total-net').cellules[8].m); // septembre 2026
  });
  it('un mois négatif reste négatif', () => {
    const neg = tableauRecap(entrees({ e: { ...E_COUTS, saisis: [...(E_COUTS.saisis ?? []), { societe: 'criterimmo', famille: 'vente', poste: 'autres', annee: 2026, mois: 1, montantHt: 9_999_999, tva: false }] } }));
    expect(ligne(neg, 'total-net').cellules[0].m.htC).toBeLessThan(0);
  });
});

describe('provisoire et confidentiel', () => {
  it('provisoire dès qu’un des trois CA net l’est ; neutre quand aucun ne l’est', () => {
    for (let k = 0; k < 12; k++) {
      const un = ['cav-net', 'cal-net', 'ca-net'].some((c) => ligne(t, c).cellules[k].etat === 'provisoire');
      expect(ligne(t, 'total-net').cellules[k].etat).toBe(un ? 'provisoire' : 'neutre');
    }
    expect(ligne(t, 'total-net').cellules[9].etat).toBe('provisoire'); // octobre : à compléter
    expect(ligne(t, 'total-net').cellules[10].etat).toBe('neutre'); // le mois en cours
  });
  it('un CA net « confidentiel » (salaire masqué) rend le total confidentiel — ce mois-là et la colonne Total ; les autres mois restent exacts', () => {
    const c = tableauRecap(entrees({ e: { ...E_COUTS, saisis: [...(E_COUTS.saisis ?? []), { societe: 'criterimmo', famille: 'vente', poste: 'salaires', annee: 2026, mois: 10, montantHt: Number.NaN }] } }));
    expect(estConfidentiel(ligne(c, 'cav-net').cellules[9].m.htC)).toBe(true);
    expect(estConfidentiel(ligne(c, 'total-net').cellules[9].m.htC)).toBe(true);
    expect(estConfidentiel(ligne(c, 'total-net').cellules[9].m.ttcC)).toBe(true);
    expect(estConfidentiel(ligne(c, 'total-net').total.htC)).toBe(true);
    expect(ligne(c, 'total-net').cellules[2].m).toEqual(ligne(t, 'total-net').cellules[2].m);
  });
});
