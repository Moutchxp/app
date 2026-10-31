import { describe, expect, it } from 'vitest';
import { caNetParMoisMode, caNetVente, ecartsCarte, lignesCarteAffaire, resultatDesCartes } from './carteAffaireLignes';
import type { Retrocession } from './modele';
import type { Partie, Vente } from './modele';
import { venteDansSociete } from './interCabinet';
/** 🔴 LOT DQ — « aujourd'hui » des épreuves (le placement des compromis en cours en « Vendu + compromis »). */
const JOUR_DQ = '2025-10-27';

/** 🔴 LOT CC (Arno, 31/10/2026) — les lignes de négociateur de la carte repliée : les cadres de la fiche ; honoraires + apporteur = la commission. */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Partie['societe'], pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' });
const vente = (o: Partial<Vente> = {}): Vente => ({ id: 37, societe: 'criterimmo', libelle: 'TEST TRANSACTION', honorairesTtc: 7500, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-10-28',
  apporteur: 'Gardien Dacquet', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
  repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50)] },
  dossier: { adresseBien: '2 Rue Mars et Roty', dateActePrevue: '2027-01-30', dateActe: null, entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 2, nom: 'Arnaud Jorel' }, apporteurId: null, personnes: [] },
  ...o } as Vente);

describe('🔴 LOT CC — lignesCarteAffaire', () => {
  it('deux négociateurs : entrée puis sortie ; honoraires nets 3 250 + 3 250, apporteur 1 000 une fois ; somme = la commission (HT et TTC)', () => {
    const l = lignesCarteAffaire(vente(), 'criterimmo');
    expect(l.lignes.map((x) => [x.nom, x.cote, x.honoraires.ttcC])).toEqual([['Cédric JULLIEN', 'entree', 325000], ['Arnaud Jorel', 'sortie', 325000]]);
    expect(l.apporteur?.ttcC).toBe(100000);
    for (const u of ['htC', 'ttcC'] as const) expect(l.lignes.reduce((t, x) => t + x.honoraires[u], 0) + l.apporteur![u]).toBe(u === 'ttcC' ? 750000 : Math.round(750000 / 1.2));
  });

  it('même négociateur des deux côtés, ou sortie inconnue : une ligne sans « entrée / sortie » ; un import : une ligne (la vente, sa paye, son reste)', () => {
    const meme = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 9, 'Cédric JULLIEN', 'criterimmo', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 9, nom: 'Cédric JULLIEN' }, apporteurId: null, personnes: [] } });
    expect(lignesCarteAffaire(meme, 'criterimmo').lignes.map((x) => [x.nom, x.cote, x.honoraires.ttcC])).toEqual([['Cédric JULLIEN', null, 750000]]);
    const imp = vente({ repartition: null, dossier: null, origine: 'import', lignes: [{ id: 1, negociateur: 'CATHERINE', role: 'negociateur', montantTtc: 4200, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }],
      honorairesTtc: 6000, statut: 'vendue' });
    const l = lignesCarteAffaire(imp, 'criterimmo', { statutDuLibelle: () => 'independant' }).lignes;
    expect(l.map((x) => [x.nom, x.cote, x.honoraires.ttcC, x.com.ttcC, x.comptabilisee, x.reste.ttcC])).toEqual([['CATHERINE', null, 600000, 420000, true, 180000]]);
  });

  it('inter-cabinet : chez la porteuse, la sortie « reversé à MACJ » ; la ligne miroir de MACJ : son seul côté', () => {
    const ic = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] }, honorairesTtc: 4000 });
    const l = lignesCarteAffaire(ic, 'criterimmo');
    expect(l.lignes[1].reverse).toEqual({ vers: 'MACJ', m: { htC: 166667, ttcC: 200000 } });
    expect(lignesCarteAffaire(venteDansSociete(ic, 'macj')!, 'macj').lignes.map((x) => x.nom)).toEqual(['Pierre Thevenin']);
  });

  // 🔴 LOT CF — « honoraires nets » = honoraires MOINS toutes les rétrocessions d'apporteurs (apporteur de la répartition ET rétrocessions du mois)
  const retro = (id: number, venteId: number, montantTtc: number): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 7, negociateur: 'CEDRIC', montantTtc,
    apporteur: null, venteId, libelle: null, origine: 'import', sourceOnglet: 'CEDRIC', sourceCellule: 'J3' });
  const imp = (id: number, honorairesTtc: number) => vente({ id, repartition: null, dossier: null, origine: 'import', lignes: [], honorairesTtc, statut: 'vendue', mois: 7, annee: 2026, sourceOnglet: 'CEDRIC' });

  it('🔴 LOT CF — rétrocession saisie au mois rattachée : ZEMMOR BERKER 36 667 € TTC (30 555,83 € HT), BASUYEAUX 10 500 € (8 750 € HT) ; contrôles nuls', () => {
    const z = imp(201, 40000); const b = imp(202, 11000);
    const rs = [retro(1, 201, 3333), retro(2, 202, 500)];
    const lz = lignesCarteAffaire(z, 'criterimmo', { retros: rs, statutDuLibelle: () => null });
    const lb = lignesCarteAffaire(b, 'criterimmo', { retros: rs, statutDuLibelle: () => null });
    expect([lz.lignes[0].honoraires, lz.lignes[0].reste]).toEqual([{ htC: 3055583, ttcC: 3666700 }, { htC: 3055583, ttcC: 3666700 }]);
    expect([lb.lignes[0].honoraires, lb.lignes[0].reste]).toEqual([{ htC: 875000, ttcC: 1050000 }, { htC: 875000, ttcC: 1050000 }]);
    expect([ecartsCarte(z, 'criterimmo', lz), ecartsCarte(b, 'criterimmo', lb)]).toEqual([[], []]);
  });

  it('🔴 LOT CF — sans rétrocession : inchangé (MILLECAMPS 29 423 € ; commission comptabilisée déduite du reste) ; apporteur de répartition : 3 250 € par côté (inchangé)', () => {
    const m = vente({ id: 200, repartition: null, dossier: null, origine: 'import', honorairesTtc: 29423, statut: 'vendue',
      lignes: [{ id: 9, negociateur: 'CATHERINE', role: 'negociateur', montantTtc: 23538, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }] });
    const lm = lignesCarteAffaire(m, 'criterimmo', { statutDuLibelle: () => 'independant' });
    expect([lm.lignes[0].honoraires.ttcC, lm.lignes[0].reste.ttcC]).toEqual([2942300, 588500]);
    expect(ecartsCarte(m, 'criterimmo', lm)).toEqual([]);
    const t = lignesCarteAffaire(vente(), 'criterimmo');
    expect(t.lignes.map((x) => x.honoraires.ttcC)).toEqual([325000, 325000]);
    expect(ecartsCarte(vente(), 'criterimmo', t)).toEqual([]);
  });

  it('🔴 LOT CF — deux négociateurs + rétrocession du mois : partagée comme l’apporteur (entrée l’écart) ; inter-cabinet : reversé compris ; contrôles nuls', () => {
    const v = vente({ id: 37, statut: 'vendue' });
    const l = lignesCarteAffaire(v, 'criterimmo', { retros: [retro(3, 37, 600.01)] });
    expect(l.lignes.map((x) => x.honoraires.ttcC)).toEqual([325000 - 30000, 325000 - 30001]); // 600,01 € : sortie 300,01 (arrondi), entrée le reste exact;
    expect(ecartsCarte(v, 'criterimmo', l)).toEqual([]);
    const ic = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] }, honorairesTtc: 4000 });
    const li = lignesCarteAffaire(ic, 'criterimmo', { retros: [retro(4, 37, 100)] });
    expect([ecartsCarte(ic, 'criterimmo', li), ecartsCarte(venteDansSociete(ic, 'macj')!, 'macj', lignesCarteAffaire(venteDansSociete(ic, 'macj')!, 'macj'))]).toEqual([[], []]);
  });
});

describe('🔴 LOT CW — le CA net d’une vente (ce qu’elle rapporte réellement à l’agence)', () => {
  const lg = (negociateur: string, montantTtc: number) => ({ id: Math.random(), negociateur, role: 'negociateur' as const, montantTtc, nature: 'vente' as const, compte: true,
    origine: 'saisie' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
  const retro = (montantTtc: number, venteId = 37): Retrocession => ({ id: 5, societe: 'criterimmo', annee: 2026, mois: 7, negociateur: 'CATHERINE', montantTtc, apporteur: null, venteId,
    libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null });
  it('un import : honoraires − commissions de TOUS (l’indépendante ET le salarié commissionné, non déduit du reste) − rétrocession rattachée (HT et TTC)', () => {
    const v = vente({ repartition: null, dossier: null, origine: 'import', statut: 'vendue', annee: 2026, mois: 7, honorairesTtc: 6000, lignes: [lg('CATHERINE', 1200), lg('JULIEN', 600)] });
    const o = { retros: [retro(500)], statutDuLibelle: (l: string) => (l === 'CATHERINE' ? 'independant' as const : 'salarie' as const) };
    const l = lignesCarteAffaire(v, 'criterimmo', o).lignes[0];
    expect([l.reste.ttcC, caNetVente(v, 'criterimmo', o).ttcC]).toEqual([430000, 370000]); // 6 000 − 500 − 1 200 = 4 300 ; − 600 (salarié) = 3 700
    expect(caNetVente(v, 'criterimmo', o).htC).toBe(308333); // 5 000 − 416,67 − 1 500 (toutes les commissions, HT)
  });
  it('une vente répartie avec apporteur et inter-cabinet : CA − apporteur − reversé − commissions = le CA net (= la somme des « reste », toutes ses commissions étant déduites)', () => {
    const v = vente({ statut: 'vendue', annee: 2026, mois: 7, repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: '2026-07-10', entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] } });
    const R = resultatDesCartes([v], 'criterimmo');
    expect([R.retro.ttcC > 0, R.interCabinet.ttcC > 0]).toEqual([true, true]);
    for (const u of ['htC', 'ttcC'] as const) {
      expect(caNetVente(v, 'criterimmo')[u]).toBe(R.ca[u] - R.retro[u] - R.interCabinet[u] - R.exterieur[u] - R.com[u]);
      expect(caNetVente(v, 'criterimmo')[u]).toBe(R.reste[u]);
    }
  });
  it('par mois : la somme des 12 mois = la somme des ventes de l’année placées dans un mois (le cumul) ; selon le mode', () => {
    const v1 = vente({ id: 1, repartition: null, dossier: null, statut: 'vendue', annee: 2026, mois: 3, honorairesTtc: 1200, lignes: [lg('CATHERINE', 120)] });
    const v2 = vente({ id: 2, repartition: null, dossier: null, statut: 'vendue', annee: 2026, mois: 7, honorairesTtc: 2400, lignes: [] });
    const c = vente({ id: 3, repartition: null, dossier: null, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-09-02', honorairesTtc: 600, lignes: [] });
    const o = { statutDuLibelle: () => 'independant' as const };
    const vendu = caNetParMoisMode([v1, v2, c], 2026, 'criterimmo', 'vendu', JOUR_DQ, o);
    expect(vendu.map((m) => m.ttcC)).toEqual([0, 0, 108000, 0, 0, 0, 240000, 0, 0, 0, 0, 0]);
    expect(vendu.reduce((t, m) => t + m.ttcC, 0)).toBe(caNetVente(v1, 'criterimmo', o).ttcC + caNetVente(v2, 'criterimmo', o).ttcC);
    expect(caNetParMoisMode([v1, v2, c], 2026, 'criterimmo', 'tous', JOUR_DQ, o)[8].ttcC).toBe(60000);
  });
});
