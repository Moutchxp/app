import { describe, expect, it } from 'vitest';
import { parApporteur, type Retrocession, type Vente } from '../transaction/modele';
import { espaceNegociateurs } from '../transaction/carteAffaireLignes';
import { resolveurDe } from '../transaction/statutLigne';
import { dateDeCarte } from '../transaction/listeCartes';
import { affairesAgence, affairesPerso, apporteursPeriode, dansPeriode, negociateursPeriode, periodeAnnees, periodeMois, tuilesAgence, tuilesAnneesAgence, tuilesAnneesPerso, tuilesPerso, type ChoixAccueil } from './accueil';
import { monCa, type Moi } from './mesAffaires';
import { statistiquesMonEspace } from './statistiques';

/**
 * 🔴 MON ESPACE (Arno, 02/11/2026) — LA LISTE SOUS LE GRAPHIQUE = LES CARTES, AU CENTIME (le test principal) : pour Mois, Période, Année, plusieurs
 * années, Tout ; en « Mon espace » (ma part, `maPart` = `monCa` de la vente entière, comme le serveur) et en mode agence (FUSION) ; HT et TTC. Le
 * total des « Vendus » = la carte « CA », leur nombre = la carte « Ventes » ; « Compromis » : les compromis en cours placés comme le graphique.
 * Données fictives (montants impairs, une vente partagée, une vente « mois à confirmer », un compromis en cours, une vente d'un autre).
 */
const JOUR = '2026-11-02';
const base = (o: Partial<Vente>): Vente => ({ id: 0, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 3, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const partie = (sorte: string, compteId: number, negociateur: string, pourcentage: number) => ({ sorte, compteId, negociateur, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage, montantHt: null });
const dossier = (e: [number, string], s: [number, string]) => ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: e[0], nom: e[1] }, sortie: { id: s[0], nom: s[1] }, apporteurId: null, personnes: [] });
const seule = (o: Partial<Vente>) => base({ repartition: { retroApporteurTtc: 0, parties: [partie('entree_sortie', 5, 'Léa', 100)] } as Vente['repartition'], dossier: dossier([5, 'Léa'], [5, 'Léa']), ...o });
const VENTES: Vente[] = [
  base({ id: 1, honorairesTtc: 12345.67, mois: 3, repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Léa', 60), partie('sortie', 7, 'Marc', 40)] } as Vente['repartition'], dossier: dossier([5, 'Léa'], [7, 'Marc']) }),
  seule({ id: 2, honorairesTtc: 6000.01, mois: 6 }),
  seule({ id: 3, honorairesTtc: 2400.03, mois: null }), // mois à confirmer 2026
  seule({ id: 4, honorairesTtc: 3600.07, annee: 2025, mois: 9 }),
  seule({ id: 5, honorairesTtc: 9000.09, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-09-15' }),
  seule({ id: 6, honorairesTtc: 4500.11, statut: 'compromis', annee: 2027, mois: null, dateCompromis: null }), // reporté au mois en cours
  base({ id: 7, honorairesTtc: 7777.77, mois: 6, repartition: { retroApporteurTtc: 0, parties: [partie('entree_sortie', 7, 'Marc', 100)] } as Vente['repartition'], dossier: dossier([7, 'Marc'], [7, 'Marc']) }),
];
const LEA: Moi = { compteId: 5, libelles: new Set(['Léa']) };
const s = statistiquesMonEspace(VENTES, LEA, JOUR);
// Ce que le serveur renvoie à Léa : ses affaires marquées, chacune avec SA part calculée sur la vente entière.
const pourLea = VENTES.map((v) => { const a = monCa([v], LEA); return { ...v, mesCotes: a.htC > 0 ? ['entree'] : [], maPart: { ca: a, net: a } }; });
const d = { societe: null, ventes: VENTES, retrocessions: [], statutsNegociateurs: {} };
const c = (o: Partial<ChoixAccueil>): ChoixAccueil => ({ decoupage: 'annee', annee: 2026, mois: 11, moisPeriode: [], ...o });
const CHOIX: [string, ChoixAccueil][] = [['Année', c({})], ['Mois (juin)', c({ decoupage: 'mois', mois: 6 })], ['Période (mars → septembre)', c({ decoupage: 'periode', mois: 9, moisPeriode: [3, 4, 5, 6, 7, 8, 9] })]];
const egal = (m: { htC: number; ttcC: number }, t: { ht: number; ttc: number }) => { expect(m.htC / 100).toBe(t.ht); expect(m.ttcC / 100).toBe(t.ttc); };

describe('🔴 « Mois » : le total des Vendus = la carte « CA », leur nombre = la carte « Ventes » (HT et TTC)', () => {
  it.each(CHOIX)('Mon espace — %s', (_, ch) => {
    const t = tuilesPerso(s, ch, JOUR);
    const l = affairesPerso(pourLea, periodeMois(ch, true, JOUR), JOUR);
    egal(l.totalVendus, t.ca.valeur);
    expect(l.vendus.length).toBe(t.nb.valeur);
    expect(l.vendus.map((x) => x.v.id)).not.toContain(7); // jamais la vente d'un autre
  });
  it.each(CHOIX)('FUSION — %s', (_, ch) => {
    const t = tuilesAgence(d, ch, JOUR);
    const l = affairesAgence(d, periodeMois(ch, false, JOUR), JOUR);
    egal(l.totalVendus, t.ca.valeur);
    expect(l.vendus.length).toBe(t.nb.valeur);
  });
  it('Année, Mon espace : la vente « mois à confirmer » est dans la liste (comme dans la carte) ; FUSION : non (comme « Le mois »)', () => {
    expect(affairesPerso(pourLea, periodeMois(c({}), true, JOUR), JOUR).vendus.map((x) => x.v.id)).toContain(3);
    expect(affairesAgence(d, periodeMois(c({}), false, JOUR), JOUR).vendus.map((x) => x.v.id)).not.toContain(3);
  });
  it('les compromis : placés comme dans le graphique (septembre ; le non daté au mois en cours) ; MA part ; tri par date décroissante', () => {
    const l = affairesPerso(pourLea, periodeMois(c({}), true, JOUR), JOUR);
    expect(l.compromis.map((x) => x.v.id).sort()).toEqual([5, 6]);
    expect(l.totalCompromis.htC).toBe(monCa([VENTES[4], VENTES[5]], LEA).htC);
    expect(affairesPerso(pourLea, periodeMois(c({ decoupage: 'mois', mois: 9 }), true, JOUR), JOUR).compromis.map((x) => x.v.id)).toEqual([5]);
    const dates = l.vendus.map((x) => dateDeCarte(x.v)).filter((x): x is string => x !== null);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});

describe('🔴 « Année(s) » : le total des Vendus = la carte « CA », le nombre = « Ventes » — une année, plusieurs, toutes', () => {
  it.each([[[2026]], [[2025, 2026]], [[2025, 2026], true]] as [number[], boolean?][])('%j (Tout : %s)', (sel, tout = false) => {
    const tp = tuilesAnneesPerso(s, sel, tout, JOUR);
    const lp = affairesPerso(pourLea, periodeAnnees(sel, true, JOUR), JOUR);
    egal(lp.totalVendus, tp.ca.valeur);
    expect(lp.vendus.length).toBe(tp.nb.valeur);
    const ta = tuilesAnneesAgence(d, sel, tout, JOUR);
    const la = affairesAgence(d, periodeAnnees(sel, false, JOUR), JOUR);
    egal(la.totalVendus, ta.ca.valeur);
    expect(la.vendus.length).toBe(ta.nb.valeur);
  });
  it('période vide : aucune affaire', () => {
    const l = affairesPerso(pourLea, periodeAnnees([2019], true, JOUR), JOUR);
    expect([l.vendus.length, l.compromis.length]).toEqual([0, 0]);
  });
});

describe('🔴 décision 14 — les tableaux sous le graphique, sur la sélection de la liste', () => {
  const retros = [
    { id: 1, societe: 'criterimmo' as const, annee: 2026, mois: 6, negociateur: 'Léa', montantTtc: 600.06, apporteur: 'DEBLOIS', venteId: 2, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null },
    { id: 2, societe: 'criterimmo' as const, annee: 2026, mois: 2, negociateur: 'Léa', montantTtc: 120.12, apporteur: 'SEUL', venteId: null, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null },
    { id: 3, societe: 'criterimmo' as const, annee: 2026, mois: 11, negociateur: 'Léa', montantTtc: 300, apporteur: 'TARDIF', venteId: 1, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null },
  ] as unknown as Retrocession[];
  it('par apporteur : saisies de la période + liées aux ventes listées (la règle de « L’année ») = parApporteur du Suivi CA', () => {
    const p = periodeMois(c({ decoupage: 'mois', mois: 6 }), false, JOUR);
    const vendus = affairesAgence(d, p, JOUR).vendus.map((x) => x.v);
    expect(apporteursPeriode(retros, vendus, VENTES, p)).toEqual(parApporteur([retros[0]], VENTES));
    const annee = periodeMois(c({}), false, JOUR);
    const tous = apporteursPeriode(retros, affairesAgence(d, annee, JOUR).vendus.map((x) => x.v), VENTES, annee);
    expect(tous.map((l) => l.apporteur).sort()).toEqual(['DEBLOIS', 'SEUL', 'TARDIF']);
  });
  it('par négociateur (agence) : `espaceNegociateurs` et `parNegociateur` sur les ventes listées — l’Espace par négociateur du Suivi CA', () => {
    const p = periodeMois(c({}), false, JOUR);
    const vendus = affairesAgence(d, p, JOUR).vendus.map((x) => x.v);
    const n = negociateursPeriode({ societe: null, retrocessions: retros }, vendus);
    expect(n.espace).toEqual(espaceNegociateurs(vendus, null, { retros, statutDuLibelle: resolveurDe(undefined) }));
    expect(n.lignes.map((l) => l.negociateur).sort()).toEqual(['Léa', 'Marc']);
  });
  it('dansPeriode : un mois choisi, le « mois à confirmer » seulement si la sélection le compte', () => {
    expect(dansPeriode(periodeMois(c({}), true, JOUR), 2026, null)).toBe(true);
    expect(dansPeriode(periodeMois(c({}), false, JOUR), 2026, null)).toBe(false);
    expect(dansPeriode(periodeMois(c({ decoupage: 'mois', mois: 6 }), true, JOUR), 2026, 7)).toBe(false);
  });
});
