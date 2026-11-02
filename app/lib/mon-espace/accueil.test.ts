import { describe, expect, it } from 'vitest';
import { caNetParMoisMode, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import { borneCumul, cumulA } from '../transaction/periodeAnnees';
import { sommeDesMoisAffiches, totauxPeriode, unAnPlusTot, ventesPeriode } from '../transaction/periodeMois';
import { caHtParMoisMode, variation, type DonneesSociete, type Vente } from '../transaction/modele';
import { resolveurDe } from '../transaction/statutLigne';
import { moisDeLAccueil, tuilesAgence, tuilesPerso, type ChoixAccueil } from './accueil';
import { statistiquesAgence } from './agence';
import { sommeC, totauxDuChoix } from './statistiques';

/**
 * 🔴 MON ESPACE — l'accueil au format « Le mois » (pur) : en « Mon espace », les tuiles = « Mes statistiques » sur le même choix, au centime ; en
 * mode agence, chaque tuile = l'expression de « Le mois » du Suivi CA (mode « Vendu ») sur les mêmes données. Données fictives (centimes impairs).
 */
const JOUR = '2026-11-02';
const ligne = (id: number, negociateur: string, montantTtc: number) => ({ id, negociateur, role: 'negociateur' as const, montantTtc, nature: 'vente' as const, compte: true,
  origine: 'import' as const, sourceFichier: null, sourceOnglet: negociateur, sourceLigne: id, note: null });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], double: null, ...o });
const d: Pick<DonneesSociete, 'ventes' | 'retrocessions' | 'societe' | 'statutsNegociateurs'> = {
  societe: 'macj', statutsNegociateurs: { MYLENE: 'independant' },
  ventes: [
    vente(1, { honorairesTtc: 11025.01, lignes: [ligne(1, 'MYLENE', 3215.33)] }),
    vente(2, { honorairesTtc: 16275.07, mois: 9 }),
    vente(3, { honorairesTtc: 5000.01, mois: 1 }),
    vente(4, { honorairesTtc: 7000.03, annee: 2025, mois: 7 }),
    vente(5, { honorairesTtc: 3333.33, annee: 2025, mois: 2 }),
    vente(6, { honorairesTtc: 9000.01, statut: 'compromis', mois: null, dateCompromis: '2026-09-20' }),
    vente(7, { honorairesTtc: 7500.07, mois: null }),
  ],
  retrocessions: [{ id: 9, societe: 'macj', annee: 2026, mois: 7, negociateur: 'MYLENE', montantTtc: 1200.01, apporteur: 'X', venteId: 1, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D3' }],
};
const opts = { retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
const s = statistiquesAgence(d, JOUR);
const CHOIX: [string, ChoixAccueil][] = [
  ['Année (défaut)', { decoupage: 'annee', annee: 2026, mois: 11, moisPeriode: [] }],
  ['Mois', { decoupage: 'mois', annee: 2026, mois: 7, moisPeriode: [] }],
  ['Période', { decoupage: 'periode', annee: 2026, mois: 9, moisPeriode: [1, 2, 3, 7, 9] }],
];

describe('🔴 accueil « Mon espace » : les chiffres de « Mes statistiques »', () => {
  it.each(CHOIX)('%s : CA et nombre = « Mes statistiques » ; N−1 et % aussi', (_, c) => {
    const t = tuilesPerso(s, c, JOUR);
    const st = totauxDuChoix(s, { mode: c.decoupage, annee: c.annee, mois: c.mois, periode: c.decoupage === 'periode' ? c.moisPeriode : [c.mois] }, JOUR);
    expect(t.ca.valeur).toEqual({ ht: st.n.ca.htC / 100, ttc: st.n.ca.ttcC / 100 });
    expect(t.ca.n1).toEqual({ ht: st.n1!.ca.htC / 100, ttc: st.n1!.ca.ttcC / 100 });
    expect(t.ca.pct).toBe(variation(st.n.ca.htC, st.n1!.ca.htC));
    expect([t.nb.valeur, t.nb.n1]).toEqual([st.n.nb, st.n1!.nb]);
  });
  it('le cumul : mes mois de janvier à la borne du Suivi CA (Année en cours : à fin novembre)', () => {
    const t = tuilesPerso(s, CHOIX[0][1], JOUR);
    expect([t.cumul.fin, t.cumul.mot]).toEqual([11, 'à fin novembre']);
    const attendu = sommeC(s.annees.find((x) => x.annee === 2026)!.ca.slice(0, 11));
    expect(t.cumul.valeur).toEqual({ ht: attendu.htC / 100, ttc: attendu.ttcC / 100 });
    expect(t.net).toBeUndefined();
  });
});

describe('🔴 accueil en mode agence : les tuiles de « Le mois » du Suivi CA', () => {
  it.each(CHOIX)('%s : chaque tuile = l’expression de « Le mois » (mode Vendu)', (_, c) => {
    const ms = moisDeLAccueil(c).map((mois) => ({ annee: c.annee, mois }));
    const enPeriode = c.decoupage !== 'mois';
    const T = totauxPeriode(d, ms, 'vendu', JOUR);
    const T1 = totauxPeriode(d, unAnPlusTot(ms), 'vendu', JOUR);
    const rc = resultatDesCartes(ventesPeriode(d.ventes, ms), d.societe, opts).ca;
    const t = tuilesAgence(d, c, JOUR);
    expect(t.ca.valeur).toEqual({ ht: rc.htC / 100, ttc: rc.ttcC / 100 });
    expect(t.ca.n1!.ht).toBe(enPeriode ? sommeDesMoisAffiches(unAnPlusTot(ms).map((m) => totauxPeriode(d, [m], 'vendu', JOUR).caHt)).ht : T1.caHt);
    expect(t.ca.pct).toBe(variation(T.caHt, T1.caHt));
    expect([t.nb.valeur, t.nb.n1]).toEqual([T.nbVentes, T1.nbVentes]);
    const fin = borneCumul(c.decoupage, c.annee, c.mois, c.decoupage === 'periode' ? c.moisPeriode : null, JOUR).fin;
    expect(t.cumul.valeur.ht).toBe(cumulA(cumuler(caHtParMoisMode(d.ventes, 2026, d.societe, 'vendu', JOUR)), fin));
    expect(t.net!.valeur).toEqual((() => { const n = sommeC(caNetParMoisMode(d.ventes, 2026, d.societe, 'vendu', JOUR, opts).slice(0, fin)); return { ht: n.htC / 100, ttc: n.ttcC / 100 }; })());
  });
  it('« Année » = les 12 mois (sans les ventes « mois à confirmer », comme « Le mois ») ; « Mois » : le mois', () => {
    expect(moisDeLAccueil(CHOIX[0][1])).toHaveLength(12);
    expect(tuilesAgence(d, CHOIX[0][1], JOUR).nb.valeur).toBe(3);
    expect(moisDeLAccueil(CHOIX[1][1])).toEqual([7]);
  });
  it('sans année précédente importée : N−1 « non importé » (null), comme le Suivi CA', () => {
    const t = tuilesAgence({ ...d, ventes: d.ventes.filter((v) => v.annee === 2026) }, CHOIX[0][1], JOUR);
    expect([t.ca.n1, t.nb.n1, t.cumul.n1, t.net!.n1]).toEqual([null, null, null, null]);
  });
});
