import { describe, expect, it } from 'vitest';
import { espaceNegociateurs } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import type { Retrocession, Vente } from '../transaction/modele';
import type { Moi } from './mesAffaires';
import { mesApporteurs, moisDuChoix, statistiquesMonEspace, totauxDuChoix, variation, type ChoixStats } from './statistiques';

/**
 * 🔴 MON ESPACE, LOT 8 — « Mes statistiques » (PUR). Léa (5) et Marc (7) ; données fictives, aujourd'hui le 2 novembre 2026.
 *   · 2026 : mars, vente partagée Léa 60 % / Marc 40 % (12 000 € TTC) ; juin, vente de Léa seule (6 000 € TTC, apporteur « DEBLOIS ») ;
 *     une vente sans mois (2 400 € TTC) ; un compromis en cours (jamais dans le CA acté) ;
 *   · 2025 : mars, vente de Léa seule (3 600 € TTC) ; une vente « à attribuer » (notée chez les deux sociétés) : comptée nulle part.
 */
const base = (o: Partial<Vente>): Vente => ({ id: 0, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 3, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const seule = (o: Partial<Vente>): Vente => base({ repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree_sortie', compteId: 5, negociateur: 'Léa', societe: 'criterimmo',
  nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] }, dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa' },
  sortie: { id: 5, nom: 'Léa' }, apporteurId: null, personnes: [] }, ...o });
const partagee = base({ id: 1, repartition: { retroApporteurTtc: 0, parties: [
  { sorte: 'entree', compteId: 5, negociateur: 'Léa', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
  { sorte: 'sortie', compteId: 7, negociateur: 'Marc', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 40, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa' }, sortie: { id: 7, nom: 'Marc' }, apporteurId: null, personnes: [] } });
const juin = seule({ id: 2, mois: 6, honorairesTtc: 6000, apporteur: 'DEBLOIS' });
const sansMois = seule({ id: 3, mois: null, honorairesTtc: 2400 });
const compromis = seule({ id: 4, statut: 'compromis', mois: null, honorairesTtc: 9000 });
const an2025 = seule({ id: 5, annee: 2025, mois: 3, honorairesTtc: 3600 });
// Une vente notée chez les deux sociétés est une vente IMPORTÉE (sans répartition), rattachée par le libellé de l'onglet des fichiers.
const aAttribuer = base({ id: 6, annee: 2025, mois: 3, origine: 'import', double: { cle: 'd', attribution: 'a_attribuer' },
  lignes: [{ id: 60, negociateur: 'Léa', role: 'vendeur', montantTtc: null, nature: 'vente', compte: true, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] });
const VENTES = [partagee, juin, sansMois, compromis, an2025, aAttribuer];
const LEA: Moi = { compteId: 5, libelles: new Set(['Léa']) };
const MARC: Moi = { compteId: 7, libelles: new Set(['Marc']) };
const JOUR = '2026-11-02';
const choix = (o: Partial<ChoixStats> = {}): ChoixStats => ({ mode: 'annee', annee: 2026, mois: 11, periode: [1, 11], ...o });
const s = statistiquesMonEspace(VENTES, LEA, JOUR);
const mois = (a: number) => s.annees.find((x) => x.annee === a)!;

describe('🔴 mon CA = la somme de MES lignes (décision 1)', () => {
  it('mars 2026 : 60 % de la vente partagée = la ligne de Léa dans l’Espace par négociateur (6 000 € HT) ; juin : 5 000 € HT ; le compromis, jamais', () => {
    const ligneLea = espaceNegociateurs([partagee], null).find((l) => l.negociateur === 'Léa')!.ca;
    expect(mois(2026).ca[2]).toEqual(ligneLea);
    expect([mois(2026).ca[2].htC, mois(2026).ca[5].htC, mois(2026).nb[2], mois(2026).nb[5]]).toEqual([600000, 500000, 1, 1]);
    expect([mois(2026).aConfirmer.htC, mois(2026).aConfirmerNb]).toEqual([200000, 1]);
    expect(mois(2026).ca.reduce((t, m) => t + m.htC, 0) + mois(2026).aConfirmer.htC).toBe(600000 + 500000 + 200000);
  });
  it('les années présentes : l’année en cours et la précédente toujours ; la vente « à attribuer » n’est comptée nulle part', () => {
    expect(s.annees.map((x) => x.annee)).toEqual([2025, 2026]);
    expect([mois(2025).ca[2].htC, mois(2025).nb[2]]).toEqual([300000, 1]);
  });
  it('aucun double compte : Léa + Marc = la vente partagée, au centime', () => {
    const m = statistiquesMonEspace(VENTES, MARC, JOUR).annees.find((x) => x.annee === 2026)!;
    expect(mois(2026).ca[2].htC + m.ca[2].htC).toBe(1000000);
    expect(mois(2026).ca[2].ttcC + m.ca[2].ttcC).toBe(1200000);
  });
});

describe('🔴 le choix et le N−1 sur la MÊME période', () => {
  it('Année 2026 (jusqu’à novembre) : les ventes du mois à confirmer comptent dans l’année ; N−1 : les mêmes mois de 2025', () => {
    const t = totauxDuChoix(s, choix(), JOUR);
    expect([t.n.ca.htC, t.n.nb, t.n1?.ca.htC, t.n1?.nb]).toEqual([1300000, 3, 300000, 1]);
    expect(variation(t.n.ca.htC, t.n1!.ca.htC)).toBeCloseTo(10 / 3, 10);
  });
  it('Mois (mars) et Période (février → juin) : dans aucun mois pour la vente sans mois', () => {
    expect(totauxDuChoix(s, choix({ mode: 'mois', mois: 3 }), JOUR).n.ca.htC).toBe(600000);
    const p = totauxDuChoix(s, choix({ mode: 'periode', periode: [2, 3, 4, 5, 6] }), JOUR);
    expect([p.n.ca.htC, p.n1?.ca.htC]).toEqual([1100000, 300000]);
    expect(moisDuChoix(choix({ mode: 'periode', periode: [2, 3, 4, 5, 6] }), JOUR)).toEqual([2, 3, 4, 5, 6]);
  });
  it('Tout : toutes les années, sans N−1', () => {
    const t = totauxDuChoix(s, choix({ mode: 'tout' }), JOUR);
    expect([t.n.ca.htC, t.n.nb, t.n1]).toEqual([1600000, 4, null]);
  });
  it('le cumul du graphique = la fonction partagée sur mes mois', () => {
    expect(cumuler(mois(2026).ca.map((m) => m.htC)).slice(0, 7)).toEqual([0, 0, 600000, 600000, 600000, 1100000, 1100000]);
  });
});

describe('🔴 par apporteur : parApporteur du Suivi CA, sur mes ventes de la période', () => {
  const retros: Retrocession[] = [
    { id: 1, societe: 'criterimmo', annee: 2026, mois: 6, negociateur: 'Léa', montantTtc: 600, apporteur: 'DEBLOIS', venteId: 2 } as Retrocession,
    { id: 2, societe: 'criterimmo', annee: 2025, mois: 3, negociateur: 'Léa', montantTtc: 120, apporteur: 'AUTRE', venteId: 5 } as Retrocession];
  it('2026 : DEBLOIS — une vente, son CA, sa rétrocession ; 2025 n’y est pas', () => {
    expect(mesApporteurs(retros, VENTES, choix(), JOUR).map((a) => [a.apporteur, a.ventesIds, a.caApporteHt, a.retroHt])).toEqual([['DEBLOIS', [2], 5000, 500]]);
    expect(mesApporteurs(retros, VENTES, choix({ mode: 'tout' }), JOUR).map((a) => a.apporteur).sort()).toEqual(['AUTRE', 'DEBLOIS']);
  });
});

describe('🔴 le graphique de l’accueil : mes compromis en cours mois par mois (ma part, décision 6), placés par la règle du Suivi CA', () => {
  const compPartage = base({ ...partagee, id: 8, statut: 'compromis', mois: null, annee: 2027, dateCompromis: '2026-09-15', honorairesTtc: 9000 });
  const st = statistiquesMonEspace([...VENTES, compPartage], LEA, JOUR);
  it('le compromis non daté de Léa : au mois en cours (novembre), une mention « reporté » ; le compromis daté de septembre : en septembre, SA part (60 %)', () => {
    const a = st.annees.find((x) => x.annee === 2026)!;
    expect(a.nbComp![10]).toBe(1);
    expect(a.caComp![10].htC).toBe(750000); // 9 000 € TTC, Léa seule
    expect(a.nbComp![8]).toBe(1);
    expect(a.caComp![8].htC).toBe(450000); // 60 % de 7 500 € HT
    expect(st.reportes).toBe(1);
  });
  it('jamais la part de Marc : son espace a la sienne (40 %), et la somme des deux = le compromis entier', () => {
    const marc = statistiquesMonEspace([...VENTES, compPartage], MARC, JOUR).annees.find((x) => x.annee === 2026)!;
    expect(marc.caComp![8].htC).toBe(300000);
    expect(marc.caComp![10].htC).toBe(0);
  });
  it('le CA acté (« Mes statistiques ») ne change pas', () => {
    expect(st.annees.find((x) => x.annee === 2026)!.ca).toEqual(s.annees.find((x) => x.annee === 2026)!.ca);
  });
});

describe('🔴 décision 13 — mon CA net = la colonne « CA net » de MA ligne de l’Espace par négociateur (au centime, mois par mois, par année)', () => {
  const statuts = { 'Léa': 'independant' as const, 'Marc': 'independant' as const };
  const opts = { retros: [{ id: 1, societe: 'criterimmo' as const, annee: 2026, mois: 6, negociateur: 'Léa', montantTtc: 600, apporteur: 'DEBLOIS', venteId: 2, libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null } as Retrocession],
    statutDuLibelle: (l: string) => statuts[l as 'Léa'] ?? null };
  const commission = (v: Vente, nego: string, ttc: number): Vente => ({ ...v, lignes: [...v.lignes, { id: 900 + v.id, negociateur: nego, role: 'negociateur', montantTtc: ttc, nature: 'vente', compte: true,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, cote: 'entree' } as Vente['lignes'][number]] });
  const ventes = [commission(partagee, 'Léa', 1234.56), commission(juin, 'Léa', 777.77), sansMois, compromis, an2025];
  const st = statistiquesMonEspace(ventes, LEA, JOUR, opts as never);
  const maLigne = (vs: Vente[]) => espaceNegociateurs(vs, null, opts as never).filter((l) => l.negociateur === 'Léa').reduce((t, l) => ({ htC: t.htC + l.net.htC, ttcC: t.ttcC + l.net.ttcC }), { htC: 0, ttcC: 0 });
  it('mars et juin 2026 : chaque mois = ma ligne de l’Espace par négociateur sur les ventes du mois', () => {
    const a = st.annees.find((x) => x.annee === 2026)!;
    expect(a.net![2]).toEqual(maLigne([ventes[0]]));
    expect(a.net![5]).toEqual(maLigne([ventes[1]]));
    expect(a.net![5].htC).toBeLessThan(a.ca[5].htC); // ma commission et la rétrocession de mon côté déduites
    expect(a.netAConfirmer).toEqual(maLigne([sansMois]));
  });
  it('l’année = la somme de ses mois + « mois à confirmer » = ma ligne sur toutes mes ventes actées de l’année', () => {
    const a = st.annees.find((x) => x.annee === 2026)!;
    const somme = [...a.net!, a.netAConfirmer!].reduce((t, m) => ({ htC: t.htC + m.htC, ttcC: t.ttcC + m.ttcC }), { htC: 0, ttcC: 0 });
    expect(somme).toEqual(maLigne([ventes[0], ventes[1], sansMois]));
  });
  it('jamais la ligne de Marc : le CA net de Léa ne dépend pas de la commission de Marc', () => {
    const avecMarc = statistiquesMonEspace([commission(ventes[0], 'Marc', 999.99), ...ventes.slice(1)], LEA, JOUR, opts as never).annees.find((x) => x.annee === 2026)!;
    expect(avecMarc.net![2]).toEqual(st.annees.find((x) => x.annee === 2026)!.net![2]);
  });
});
