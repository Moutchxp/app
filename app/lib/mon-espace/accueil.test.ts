import { describe, expect, it } from 'vitest';
import { caNetParMoisMode, caNetVente, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import { borneCumul, cumulA, listeADate, listeDesAnnees, moisADate, ventesDesAnnees } from '../transaction/periodeAnnees';
import { sommeDesMoisAffiches, totauxPeriode, unAnPlusTot, ventesPeriode } from '../transaction/periodeMois';
import { caHtParMoisMode, variation, type DonneesSociete, type Vente } from '../transaction/modele';
import { resolveurDe } from '../transaction/statutLigne';
import { moisDeLAccueil, sourceAnneesPerso, sourceMoisPerso, tuilesAgence, tuilesAnneesAgence, tuilesAnneesPerso, tuilesPerso, type ChoixAccueil } from './accueil';
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

describe('🔴 onglet « Année(s) » : « Mon espace » = « Mes statistiques », mode agence = « L’année » du Suivi CA', () => {
  const annee = (a: number) => totauxDuChoix(s, { mode: 'annee', annee: a, mois: 1, periode: [1] }, JOUR).n;
  it('« Mon espace », Année 2026 : CA et nombre = « Mes statistiques » (Année) ; N−1 = 2025 ; à date = janvier → novembre', () => {
    const t = tuilesAnneesPerso(s, [2026], false, JOUR);
    expect(t.ca.valeur).toEqual({ ht: annee(2026).ca.htC / 100, ttc: annee(2026).ca.ttcC / 100 });
    expect(t.ca.n1).toEqual({ ht: annee(2025).ca.htC / 100, ttc: annee(2025).ca.ttcC / 100 });
    expect([t.nb.valeur, t.nb.n1]).toEqual([annee(2026).nb, annee(2025).nb]);
    const x = s.annees.find((y) => y.annee === 2026)!;
    expect(t.aDate.valeur.ht).toBe(sommeC(x.ca.slice(0, moisADate(2026, JOUR))).htC / 100);
    expect(t.net).toBeUndefined();
  });
  it('« Mon espace », Période 2025 + 2026 : la somme des deux années ; Tout : sans N−1', () => {
    const t = tuilesAnneesPerso(s, [2025, 2026], false, JOUR);
    expect(t.ca.valeur.ht).toBe((annee(2025).ca.htC + annee(2026).ca.htC) / 100);
    expect(tuilesAnneesPerso(s, [2025, 2026], true, JOUR).ca.n1).toBeNull();
  });
  it.each([[[2026]], [[2025, 2026]]])('mode agence %j : chaque tuile = l’expression de « L’année » (mode Vendu)', (sel) => {
    const cartes = (vs: Vente[]) => resultatDesCartes(vs, d.societe, opts).ca;
    const sel1 = sel.map((a) => a - 1);
    const t = tuilesAnneesAgence(d, sel, false, JOUR);
    expect(t.ca.valeur).toEqual((() => { const c = cartes(ventesDesAnnees(d.ventes, sel)); return { ht: c.htC / 100, ttc: c.ttcC / 100 }; })());
    expect(t.nb.valeur).toBe(ventesDesAnnees(d.ventes, sel).length);
    const aDate = cartes(sel.flatMap((a) => listeADate(d.ventes, a, moisADate(a, JOUR), 'vendu', JOUR)));
    expect(t.aDate.valeur.ht).toBe(aDate.htC / 100);
    const net = sommeC(ventesDesAnnees(d.ventes, sel).map((v) => caNetVente(v, d.societe, opts)));
    expect(t.net!.valeur.ht).toBe(net.htC / 100);
    if (sel.length === 1) {
      const r1 = cartes(listeDesAnnees(d.ventes, sel1, 'vendu', JOUR));
      expect(t.ca.n1!.ht).toBe(r1.htC / 100);
      expect(t.ca.pct).toBe(variation(cartes(ventesDesAnnees(d.ventes, sel)).htC, r1.htC));
    } else expect(t.ca.n1).toBeNull(); // 2024 non importée : « non importé », comme le Suivi CA
  });
});

describe('🔴 les sources du graphique du Suivi CA sur mes chiffres', () => {
  const st = { annees: [
    { annee: 2025, ca: Array.from({ length: 12 }, (_, i) => (i === 2 ? { htC: 300000, ttcC: 360000 } : { htC: 0, ttcC: 0 })), nb: Array.from({ length: 12 }, (_, i) => (i === 2 ? 1 : 0)), aConfirmer: { htC: 0, ttcC: 0 }, aConfirmerNb: 0 },
    { annee: 2026, ca: Array.from({ length: 12 }, (_, i) => (i === 5 ? { htC: 500000, ttcC: 600000 } : { htC: 0, ttcC: 0 })), nb: Array.from({ length: 12 }, (_, i) => (i === 5 ? 1 : 0)),
      aConfirmer: { htC: 100000, ttcC: 120000 }, aConfirmerNb: 1,
      caComp: Array.from({ length: 12 }, (_, i) => (i === 10 ? { htC: 250000, ttcC: 300000 } : { htC: 0, ttcC: 0 })), nbComp: Array.from({ length: 12 }, (_, i) => (i === 10 ? 1 : 0)) }],
    reportes: 1 };
  it('« Mois par mois » : le vendu = « Mes statistiques » ; vendu + compromis au-dessus ; N−1 présent', () => {
    const src = sourceMoisPerso(st, 2026);
    expect(src.caVendu(2026)[5]).toBe(5000);
    expect(src.ca(2026)[10]).toBe(2500);
    expect(src.ca(2026)[5]).toBe(5000);
    expect([src.nb(2026)[10], src.nbVendu(2026)[10]]).toEqual([1, 0]);
    expect([src.sansN1, src.nbReportes, sourceMoisPerso(st, 2025).sansN1]).toEqual([false, 1, true]);
  });
  it('« Année par année » : vendu (12 mois + mois à confirmer) = « Mes statistiques » (Année) ; + compromis en « Vendu + compromis » ; HT et TTC exacts', () => {
    const src = sourceAnneesPerso(st);
    expect(src.valeur(2026, 'vendu', 'ca', 'ht')).toBe(totauxDuChoix(st, { mode: 'annee', annee: 2026, mois: 1, periode: [1] }, JOUR).n.ca.htC / 100);
    expect(src.valeur(2026, 'tous', 'ca', 'ttc')).toBe((600000 + 120000 + 300000) / 100);
    expect(src.valeur(2026, 'tous', 'nombre', 'ht')).toBe(3);
    expect(src.valeur(2024, 'tous', 'ca', 'ht')).toBe(0);
  });
});
