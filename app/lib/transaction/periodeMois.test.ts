import { describe, expect, it } from 'vitest';
import { additionnerTotaux, totauxMoisMode, type DonneesSociete, type Vente } from './modele';
import { basculerMois, sommeDesMoisAffiches, compromisPeriode, contigus, ecrirePeriode, estChoisi, libellePeriode, lirePeriode, retrosPeriode, totauxPeriode, unAnPlusTot, ventesPeriode } from './periodeMois';
/** 🔴 LOT DQ — « aujourd'hui » des épreuves (le placement des compromis en cours en « Vendu + compromis »). */
const JOUR_DQ = '2025-10-27';

/** 🔴 LOT CP (Arno) — « Le mois » en Période : la somme exacte des mois choisis, par les fonctions du mois. */
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], double: null, ...o });
const d: Pick<DonneesSociete, 'ventes' | 'retrocessions' | 'societe' | 'statutsNegociateurs'> = {
  societe: 'macj', statutsNegociateurs: { MYLENE: 'independant' },
  ventes: [
    vente(1, { honorairesTtc: 11025.01, lignes: [{ id: 1, negociateur: 'MYLENE', role: 'negociateur', montantTtc: 3215.33, nature: 'vente', compte: true, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: 1, note: null }] }),
    vente(2, { honorairesTtc: 16275.07, mois: 9 }),
    vente(3, { honorairesTtc: 5000, mois: 8 }),
    vente(4, { honorairesTtc: 7000.03, annee: 2025, mois: 7 }),
    vente(5, { honorairesTtc: 9000, statut: 'compromis', mois: null, dateCompromis: '2026-09-20' }),
    vente(6, { honorairesTtc: 3000, statut: 'compromis', mois: null, dateCompromis: '2026-07-02' }),
  ],
  retrocessions: [
    { id: 9, societe: 'macj', annee: 2026, mois: 7, negociateur: 'MYLENE', montantTtc: 1200.01, apporteur: null, venteId: null, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D3' },
    { id: 10, societe: 'macj', annee: 2026, mois: 9, negociateur: 'MYLENE', montantTtc: 333.33, apporteur: null, venteId: 2, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D5' },
  ],
};
const jul = { annee: 2026, mois: 7 }; const aou = { annee: 2026, mois: 8 }; const sep = { annee: 2026, mois: 9 };

describe('🔴 LOT CP — la période de « Le mois »', () => {
  it('l’adresse : lue (triée, sans doublon, valeurs fausses écartées), écrite ; rien de valable → null', () => {
    expect(lirePeriode('2026-09,2026-07,2026-07,abc,2026-13')).toEqual([jul, sep]);
    expect(ecrirePeriode([sep, jul])).toBe('2026-07,2026-09');
    expect([lirePeriode(null), lirePeriode(''), lirePeriode('x,2026-00')]).toEqual([null, null, null]);
  });
  it('sélection / désélection ; le dernier mois ne se retire pas', () => {
    const a = basculerMois([jul], sep);
    expect(a).toEqual({ mois: [jul, sep], refus: false });
    expect(basculerMois(a.mois, jul)).toEqual({ mois: [sep], refus: false });
    expect(basculerMois([sep], sep)).toEqual({ mois: [sep], refus: true });
    expect([estChoisi([jul, sep], sep), estChoisi([jul, sep], aou)]).toEqual([true, false]);
  });
  it('le nom : un mois, des mois qui se suivent (même sur deux années), des mois séparés', () => {
    expect(libellePeriode([jul])).toBe('juillet 2026');
    expect([contigus([jul, aou, sep]), contigus([jul, sep])]).toEqual([true, false]);
    expect(libellePeriode([sep, jul, aou])).toBe('juillet → septembre 2026');
    expect(libellePeriode([jul, sep])).toBe('juillet, septembre 2026 (2 mois)');
    expect(libellePeriode([{ annee: 2025, mois: 12 }, { annee: 2026, mois: 1 }])).toBe('décembre 2025 → janvier 2026');
    expect(libellePeriode([{ annee: 2025, mois: 11 }, { annee: 2026, mois: 2 }, { annee: 2026, mois: 3 }])).toBe('novembre 2025, février, mars 2026 (3 mois)');
  });
  it('les totaux de la période = la somme des totaux de chaque mois, dans tous les modes ; N−1 = les mêmes mois, un an plus tôt', () => {
    for (const mode of ['vendu', 'compromis', 'tous'] as const) {
      const p = totauxPeriode(d, [sep, jul], mode, JOUR_DQ);
      const somme = additionnerTotaux(totauxMoisMode(d, 2026, 7, mode, JOUR_DQ), totauxMoisMode(d, 2026, 9, mode, JOUR_DQ));
      expect([mode, p]).toEqual([mode, somme]);
    }
    expect(unAnPlusTot([jul, sep])).toEqual([{ annee: 2025, mois: 7 }, { annee: 2025, mois: 9 }]);
    expect(totauxPeriode(d, unAnPlusTot([jul, sep]), 'vendu', JOUR_DQ).ids).toEqual([4]);
  });
  it('un montant décimal : la somme de ce que chaque mois AFFICHE (arrondi au centime), en HT et en TTC', () => {
    // 0,004 + 0,004 : chaque mois affiche 0,00 (TTC 0,0048 → 0,00) → la période 0,00, et non 0,01 ; TTC : 1,2 × 10,005 = 12,006 → 12,01 chaque mois
    expect(sommeDesMoisAffiches([0.004, 0.004])).toEqual({ ht: 0, ttc: 0 });
    expect(sommeDesMoisAffiches([10.005, 10.005]).ttc).toBe(24.02);
    expect(sommeDesMoisAffiches([])).toEqual({ ht: 0, ttc: 0 });
  });
  it('les listes : ventes mois après mois, compromis triés par date du compromis, rétrocessions des mois choisis', () => {
    expect(ventesPeriode(d.ventes, [sep, jul]).map((v) => v.id)).toEqual([1, 2]);
    expect(compromisPeriode(d.ventes, [jul, sep], 'compromis', JOUR_DQ).map((v) => v.id)).toEqual([6, 5]);
    expect(retrosPeriode(d.retrocessions, [jul, sep]).map((r) => r.id)).toEqual([9, 10]);
    expect(retrosPeriode(d.retrocessions, [aou])).toEqual([]);
  });
});
