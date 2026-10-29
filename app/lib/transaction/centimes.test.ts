import { describe, expect, it } from 'vitest';
import { auCentime, centimesRepartition } from './repartition';
import { bilanVente, societePorteuse, type Partie, type Societe, type Vente } from './modele';
import { tuilesCompromis } from './commissions';
import { venteDansSociete } from './interCabinet';

/**
 * 🔴 LOT AH (Arno, 29/10/2026) — UN MÊME MONTANT IDENTIQUE AU CENTIME PARTOUT : la partie de l'autre société = sa part = le reversement = la
 * tuile = la ligne miroir ; la porteuse (le reste) absorbe l'écart ; reste + reversements + apporteur = commission de la vente au centime.
 */
const partie = (sorte: Partie['sorte'], societe: Societe | null, pct: number, nom: string | null = null): Partie =>
  ({ sorte, compteId: sorte === 'exterieure' ? null : sorte === 'entree' ? 2 : 8, negociateur: sorte === 'exterieure' ? null : sorte === 'entree' ? 'Arnaud' : 'Pierre', societe, nom, coordonnees: null, pourcentage: pct, montantHt: null });
const vente = (honorairesTtc: number, retro: number, parties: Partie[]): Vente => ({ id: 37, societe: 'criterimmo', libelle: 'Location ?', honorairesTtc, statut: 'compromis', annee: 2026, mois: null,
  dateCompromis: null, apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [], dossier: null,
  repartition: { retroApporteurTtc: retro, parties } });
const cents = (v: Vente, unite: 'ht' | 'ttc' = 'ht') => centimesRepartition(v.repartition!.parties, v.honorairesTtc, v.repartition!.retroApporteurTtc, societePorteuse(v), unite)!;
const somme = (c: ReturnType<typeof cents>) => auCentime(c.resteHt + Object.values(c.reverse).reduce((t, x) => t + x, 0) + c.exterieurs.reduce((t, e) => t + e.ht, 0) + c.apporteurHt);

describe('🔴 LOT AH — la règle unique des centimes', () => {
  it('« Location ? » 7 500 TTC, apporteur 1 000 : Arnaud (CRITERIMMO) 50 % / Pierre (MACJ) 50 % — 2 708,34 / 2 708,33, Part MACJ = reversé = 2 708,33', () => {
    const v = vente(7500, 1000, [partie('entree', 'criterimmo', 50), partie('sortie', 'macj', 50)]);
    const c = cents(v);
    expect([c.commissionHt, c.apporteurHt, c.baseHt]).toEqual([6250, 833.33, 5416.67]);
    expect(c.parts).toEqual([2708.34, 2708.33]);
    expect([c.parSociete.criterimmo, c.parSociete.macj, c.reverse.macj, c.resteHt]).toEqual([2708.34, 2708.33, 2708.33, 2708.34]);
    expect(somme(c)).toBe(c.commissionHt);
    const t = cents(v, 'ttc');
    expect([t.commissionHt, t.apporteurHt, t.baseHt, ...t.parts]).toEqual([7500, 1000, 6500, 3250, 3250]);
  });
  it('le reversé = la tuile « Inter-cabinet vers MACJ » = la ligne miroir de MACJ, au centime', () => {
    const v = vente(7500, 1000, [partie('entree', 'criterimmo', 50), partie('sortie', 'macj', 50)]);
    expect(auCentime(tuilesCompromis([v], 'criterimmo').interCabinetHt.macj)).toBe(cents(v).reverse.macj);
    expect(auCentime(venteDansSociete(v, 'macj')!.miroir!.partHt)).toBe(cents(v).reverse.macj);
    expect(auCentime(bilanVente(v, 'criterimmo').verseHt.macj)).toBe(cents(v).parts[1]);
  });
  it('sans apporteur, même société : la base = la commission, rien de reversé, le reste = tout', () => {
    const c = cents(vente(4000, 0, [partie('entree', 'criterimmo', 50), partie('sortie', 'criterimmo', 50)]));
    expect([c.apporteurHt, c.baseHt, c.reverse.macj, c.resteHt]).toEqual([0, 3333.33, 0, 3333.33]);
    expect(c.parts).toEqual([1666.67, 1666.66]);
  });
  it('partie extérieure (40 / 40 / 20) : le reversé à l’agence au centime ; tout tombe juste', () => {
    const c = cents(vente(12000, 2400, [partie('entree', 'criterimmo', 40), partie('sortie', 'macj', 40), partie('exterieure', null, 20, 'Agence du Parc')]));
    expect(c.exterieurs).toEqual([{ index: 2, nom: 'Agence du Parc', ht: 1600 }]);
    expect([c.reverse.macj, c.resteHt]).toEqual([3200, 3200]);
    expect(somme(c)).toBe(c.commissionHt);
  });
  it('balayage : pour de nombreux montants et parts, la partie MACJ = l’arrondi de sa part exacte, et reste + reversements + apporteur = commission', () => {
    for (const honoraires of [4000, 7500, 9999.99, 12345.67, 3333.33, 101]) for (const retro of [0, 1000, 333.33]) for (const p of [50, 33.3333, 66.6667, 12.5, 87.5, 1, 99]) {
      if (retro >= honoraires) continue;
      const v = vente(honoraires, retro, [partie('entree', 'criterimmo', 100 - p), partie('sortie', 'macj', p)]);
      const c = cents(v);
      expect(c.parSociete.macj).toBe(auCentime(bilanVente(v, 'criterimmo').verseHt.macj));
      expect(somme(c)).toBe(c.commissionHt);
      const t = cents(v, 'ttc');
      expect(auCentime(t.resteHt + t.reverse.macj + t.apporteurHt)).toBe(auCentime(honoraires));
    }
  });
  it('une répartition qui ne fait pas 100 % : rien (l’écran garde la règle du lot U)', () => {
    expect(centimesRepartition([partie('entree', 'criterimmo', 50), partie('sortie', 'macj', 60)], 4000, 0, 'criterimmo')).toBeNull();
  });
});
