import { describe, expect, it } from 'vitest';
import { affairesCompromisAgence, affairesCompromisPerso, apporteursDeLAffaire, cartesCompromis, tableauApporteursCompromis, verseAffaireAgence, verseAffairePerso } from './compromisCartes';
import { lignesCarteAffaire } from '../transaction/carteAffaireLignes';
import { totalCompromisEnCours } from '../transaction/compromisEnCours';
import { venteDansSociete } from '../transaction/interCabinet';
import type { LigneVente, Partie, Retrocession, Vente } from '../transaction/modele';
import { monCaNet, type Moi } from './mesAffaires';
import { apporteursPeriode, surVenteActee } from './accueil';

/**
 * 🔴 D27 / D28 (Arno, 03/11/2026) — l'onglet « Compromis » : 4 cartes et « Par apporteur d'affaires — compromis en cours ». Les cas d'Arno (données
 * fictives, mêmes formes qu'en base) : TEST TRANSACTION (entrée Cédric / sortie Arnaud, apporteur), MARMONIER (deux co-négociateurs sur une ligne
 * importée), LARSON (seul), HEIDIDON (inter-cabinet CRITERIMMO → sortie MACJ, apporteur), FABARRO (un négociateur indépendant commissionné).
 * Le contrôle : volume − reversé = net, au centime, en HT et en TTC — jamais forcé (chaque terme calculé pour lui-même).
 */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Partie['societe'], pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: compteId === 8 ? 'independant' : 'associe' });
const ligne = (id: number, negociateur: string, montantTtc: number): LigneVente => ({ id, negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true,
  origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: id, note: null } as LigneVente);
const base = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 0, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-10-28',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [], ...o } as Vente);
const dossier = (entree: [number, string], sortie: [number, string]) => ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: entree[0], nom: entree[1] },
  sortie: { id: sortie[0], nom: sortie[1] }, apporteurId: null, personnes: [] });
const TEST_TRANSACTION = base({ id: 37, libelle: 'TEST TRANSACTION', honorairesTtc: 7500, apporteur: 'Gardien Dacquet',
  repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50)] },
  dossier: dossier([9, 'Cédric JULLIEN'], [2, 'Arnaud Jorel']) });
const HEIDIDON = base({ id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, apporteur: 'Carlos Monteiro',
  repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] },
  dossier: dossier([2, 'Arnaud Jorel'], [8, 'Pierre Thevenin']) });
const MARMONIER = base({ id: 206, libelle: 'MARMONIER', honorairesTtc: 14000, origine: 'import', lignes: [ligne(1, 'CEDRIC', 0), ligne(2, 'ARNAUD', 0)] });
const LARSON = base({ id: 209, libelle: 'LARSON/ YE', honorairesTtc: 9000, origine: 'import', lignes: [ligne(3, 'ARNAUD', 0)] });
const FABARRO = base({ id: 260, libelle: 'FABARRO', societe: 'macj', honorairesTtc: 25000, origine: 'import', lignes: [ligne(4, 'PIERRE', 12500)] });
const ARNO: Moi = { compteId: 2, libelles: new Set(['Arnaud Jorel', 'ARNAUD']) };
const PIERRE: Moi = { compteId: 8, libelles: new Set(['Pierre Thevenin', 'PIERRE']) };
const statut = (l: string) => (l === 'PIERRE' || l === 'Pierre Thevenin' ? 'independant' as const : 'associe' as const);
const O = { retros: [] as Retrocession[], statutDuLibelle: statut };
const C = (htC: number, ttcC: number) => ({ htC, ttcC });
const moins = (a: { htC: number; ttcC: number }, b: { htC: number; ttcC: number }) => C(a.htC - b.htC, a.ttcC - b.ttcC);

describe('🔴 D27 — « Mon espace » : ce que chacun de mes compromis verse à d’autres (sur la vente entière)', () => {
  it('TEST TRANSACTION (partage entrée / sortie) : collègues = le côté de Cédric, apporteurs = 1 000 € TTC ; net = ma part nette', () => {
    const v = verseAffairePerso(TEST_TRANSACTION, ARNO, O);
    expect(v.ca).toEqual(C(625000, 750000));
    expect(v.collegues).toEqual(lignesCarteAffaire(TEST_TRANSACTION, null, O).lignes[0].honoraires);
    expect(v.apporteurs.ttcC).toBe(100000);
    expect(v.negociateurs).toEqual(C(0, 0));
    expect(moins(moins(moins(v.ca, v.collegues), v.negociateurs), v.apporteurs)).toEqual(monCaNet([TEST_TRANSACTION], ARNO, O));
    expect(v.parApporteur).toEqual([{ nom: 'Gardien Dacquet', m: v.apporteurs }]);
  });
  it('MARMONIER (co-négociateurs du même côté, ligne importée) : la part de Cédric part aux collègues ; LARSON (seul) : rien n’est reversé', () => {
    const m = verseAffairePerso(MARMONIER, ARNO, O);
    expect(m.collegues.htC).toBeGreaterThan(0);
    expect(moins(m.ca, m.collegues)).toEqual(monCaNet([MARMONIER], ARNO, O));
    const l = verseAffairePerso(LARSON, ARNO, O);
    expect([l.collegues, l.negociateurs, l.apporteurs]).toEqual([C(0, 0), C(0, 0), C(0, 0)]);
    expect(monCaNet([LARSON], ARNO, O)).toEqual(l.ca);
  });
  it('HEIDIDON (inter-cabinet) : le côté de l’autre structure compte dans « collègues » ; l’apporteur dans « apporteurs »', () => {
    const h = verseAffairePerso(HEIDIDON, ARNO, O);
    expect(h.collegues).toEqual(lignesCarteAffaire(HEIDIDON, null, O).lignes[1].honoraires);
    expect(h.apporteurs.ttcC).toBe(100000);
    expect(moins(moins(h.ca, h.collegues), h.apporteurs)).toEqual(monCaNet([HEIDIDON], ARNO, O));
  });
  it('décision A — un négociateur commissionné : SA commission dans « dont négociateurs » (vue de Pierre) ; net = sa part nette', () => {
    const f = verseAffairePerso(FABARRO, PIERRE, O);
    expect(f.negociateurs.ttcC).toBe(1250000);
    expect(moins(f.ca, f.negociateurs)).toEqual(monCaNet([FABARRO], PIERRE, O));
  });
  it('confidentialité (décision 2) : pour Arno, la commission de Pierre n’est nulle part (seulement la part d’honoraires de son côté)', () => {
    const avec = { ...HEIDIDON, lignes: [{ ...ligne(9, 'Pierre Thevenin', 900), cote: 'sortie' as const }] };
    const v = verseAffairePerso(avec, ARNO, O);
    expect(v.negociateurs).toEqual(C(0, 0));
    expect(Object.keys(v).sort()).toEqual(['apporteurs', 'ca', 'collegues', 'negociateurs', 'parApporteur']);
    expect(JSON.stringify(v)).not.toContain('90000');
    expect(JSON.stringify(v)).not.toContain('75000');
  });
  it('les 4 cartes : volume − reversé = la somme des « ma part nette », au centime (HT et TTC) ; nombre = les lignes', () => {
    const vs = [TEST_TRANSACTION, MARMONIER, LARSON, HEIDIDON].map((v) => ({ ...v, verse: verseAffairePerso(v, ARNO, O), maPart: { net: monCaNet([v], ARNO, O) } }));
    const c = cartesCompromis(affairesCompromisPerso(vs));
    expect(c.nb).toBe(4);
    expect(moins(c.volume, c.reverse)).toEqual(c.net);
    expect(c.net).toEqual(monCaNet([TEST_TRANSACTION, MARMONIER, LARSON, HEIDIDON], ARNO, O));
    expect(c.reverse).toEqual(C(c.collegues.htC + c.negociateurs.htC + c.apporteurs.htC, c.collegues.ttcC + c.negociateurs.ttcC + c.apporteurs.ttcC));
  });
});

describe('🔴 D27 — le mode agence : la structure, ce qui en sort ; carte 4 = la somme des « reste »', () => {
  const ventes = [TEST_TRANSACTION, MARMONIER, LARSON, HEIDIDON, FABARRO];
  it('FUSION : l’inter-cabinet entre nos sociétés n’est pas reversé ; volume = Suivi CA ; net = Σ « reste » ; les commissions dans « négociateurs »', () => {
    const c = cartesCompromis(affairesCompromisAgence(ventes, null, O));
    const t = totalCompromisEnCours(ventes, null, statut);
    expect([c.volume, c.nb]).toEqual([C(t.htC, t.ttcC), t.nb]);
    const reste = ventes.flatMap((v) => lignesCarteAffaire(v, null, O).lignes.map((x) => x.reste)).reduce((a, b) => C(a.htC + b.htC, a.ttcC + b.ttcC), C(0, 0));
    expect(c.net).toEqual(reste);
    expect(moins(c.volume, c.reverse)).toEqual(c.net);
    expect(c.collegues).toEqual(C(0, 0));
    // FABARRO (12 500 € TTC) et la sortie de Pierre sur HEIDIDON : les commissions déduites des lignes
    expect(c.negociateurs).toEqual(ventes.flatMap((v) => lignesCarteAffaire(v, null, O).lignes.map((x) => x.comDeduite)).reduce((a, b) => C(a.htC + b.htC, a.ttcC + b.ttcC), C(0, 0)));
    expect(c.negociateurs.ttcC).toBeGreaterThan(1250000);
    expect(c.apporteurs.ttcC).toBe(200000);
  });
  it('CRITERIMMO : la sortie MACJ de HEIDIDON part (« dont collègues ») ; MACJ : sa ligne miroir, rien de reversé', () => {
    const cr = verseAffaireAgence(HEIDIDON, 'criterimmo', O);
    expect(cr.collegues).toEqual(lignesCarteAffaire(HEIDIDON, 'criterimmo', O).lignes[1].reverse!.m);
    const miroir = venteDansSociete(HEIDIDON, 'macj')!;
    const mj = verseAffaireAgence(miroir, 'macj', O);
    expect([mj.collegues, mj.apporteurs]).toEqual([C(0, 0), C(0, 0)]);
    for (const vue of ['criterimmo', 'macj'] as const) {
      const vs = vue === 'criterimmo' ? [TEST_TRANSACTION, MARMONIER, LARSON, HEIDIDON] : [miroir, FABARRO];
      const c = cartesCompromis(affairesCompromisAgence(vs, vue, O));
      const t = totalCompromisEnCours(vs, vue, statut);
      expect([c.volume, moins(c.volume, c.reverse)]).toEqual([C(t.htC, t.ttcC), c.net]);
    }
  });
});

describe('🔴 D28 — « Par apporteur d’affaires »', () => {
  const retro = (id: number, venteId: number | null, montantTtc: number, apporteur: string | null = null): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 7,
    negociateur: 'ARNAUD', montantTtc, apporteur, venteId, libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null } as Retrocession);
  it('compromis en cours : apporteur de la répartition + rétrocessions rattachées (groupées par nom) ; total = « dont apporteurs », au centime', () => {
    const rs = [retro(1, 209, 600.01, 'Paul DURAND'), retro(2, 209, 300), retro(3, 37, 100, 'Gardien Dacquet')];
    const o = { ...O, retros: rs };
    expect(apporteursDeLAffaire(LARSON, null, o).map((a) => a.nom)).toEqual(['Paul DURAND', 'Apporteur non nommé']);
    const xs = affairesCompromisPerso([TEST_TRANSACTION, LARSON, HEIDIDON].map((v) => ({ ...v, verse: verseAffairePerso(v, ARNO, o), maPart: { net: monCaNet([v], ARNO, o) } })));
    const t = tableauApporteursCompromis(xs);
    const c = cartesCompromis(xs);
    expect(Math.round(t.reduce((s, x) => s + x.verse.ht * 100, 0))).toBe(c.apporteurs.htC);
    expect(Math.round(t.reduce((s, x) => s + x.verse.ttc * 100, 0))).toBe(c.apporteurs.ttcC);
    const gd = t.find((x) => x.apporteur === 'Gardien Dacquet')!;
    expect([gd.ids, gd.verse.ttc]).toEqual([[37], 1100]);
    expect(gd.ca.ttc).toBe(7500);
  });
  it('« Mois » / « Année(s) » : une rétrocession rattachée à un compromis (ou une affaire annulée) n’y figure jamais ; « à répartir » et ventes actées restent', () => {
    const vendue = base({ id: 500, statut: 'vendue', annee: 2026, mois: 7, honorairesTtc: 6000 });
    const annulee = base({ id: 501, statut: 'annulee', honorairesTtc: 6000 });
    const ventes = [vendue, annulee, LARSON];
    const rs = [retro(1, 500, 600, 'A'), retro(2, 209, 300, 'B'), retro(3, 501, 200, 'C'), retro(4, null, 100, 'D')];
    expect(rs.map((r) => surVenteActee(r, ventes))).toEqual([true, false, false, true]);
    const p = { annees: [{ annee: 2026, moisVendus: [7], moisCompromis: [7], aConfirmer: true }] };
    expect(apporteursPeriode(rs, [vendue], ventes, p).map((l) => l.apporteur).sort()).toEqual(['A', 'D']);
  });
});
