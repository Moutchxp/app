import { describe, expect, it } from 'vitest';
import { autreUnite, commissionDuCote, enHt, enTtc, fractionSociete, montantDeLigne, partDuCote, societeDeLigne, tuilesCompromis } from './commissions';
import { caHt, payeTtcDe, type LigneVente, type Partie, type Vente } from './modele';

/** TUILE « TRANSACTION », LOT I — commissions versées en HT ou en TTC, et les 4 tuiles de l'onglet « Compromis ». */

const ligne = (o: Partial<LigneVente>): LigneVente => ({ id: 1, negociateur: 'JB', role: 'negociateur', montantTtc: null, nature: 'compromis', compte: false, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const partie = (o: Partial<Partie>): Partie => ({ sorte: 'entree', compteId: 5, negociateur: 'JB', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, ...o });
const vente = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });

describe('conversion HT ↔ TTC (taux de la tuile : TTC = HT × 1,2), sans arrondi', () => {
  it('une commission saisie en HT, une en TTC, et leur équivalent', () => {
    expect(enTtc({ montant: 1000, unite: 'ht' })).toBe(1200);
    expect(enHt({ montant: 1200, unite: 'ttc' })).toBe(1000);
    expect(enHt({ montant: 1000, unite: 'ht' })).toBe(1000);
    expect(autreUnite({ montant: 1000, unite: 'ht' })).toEqual({ montant: 1200, unite: 'ttc' });
    expect(autreUnite({ montant: 1000, unite: 'ttc' })).toEqual({ montant: 1000 / 1.2, unite: 'ht' });
  });
  it('une ligne garde SON unité : HT si `montantHt`, sinon TTC (les lignes d’avant, imports compris)', () => {
    expect(montantDeLigne(ligne({ montantTtc: 1200, montantHt: 1000 }))).toEqual({ montant: 1000, unite: 'ht' });
    expect(montantDeLigne(ligne({ montantTtc: 3215 }))).toEqual({ montant: 3215, unite: 'ttc' });
    expect(montantDeLigne(ligne({ montantTtc: null }))).toBeNull();
  });
  it('le MÊME négociateur : en HT sur une vente, en TTC sur une autre — chaque commission lue dans son unité', () => {
    const a = vente({ id: 1, lignes: [ligne({ cote: 'entree', montantHt: 1000, montantTtc: 1200 })] });
    const b = vente({ id: 2, lignes: [ligne({ cote: 'entree', montantTtc: 1200 })] });
    expect(commissionDuCote(a, 'entree')).toEqual({ negociateur: 'JB', montant: { montant: 1000, unite: 'ht' } });
    expect(commissionDuCote(b, 'entree')).toEqual({ negociateur: 'JB', montant: { montant: 1200, unite: 'ttc' } });
    expect(commissionDuCote(a, 'sortie')).toBeNull();
    // Les deux pèsent la même chose : 1 000 HT.
    expect(tuilesCompromis([a, b], 'criterimmo').negociateursHt).toBe(2000);
  });
  it('les montants existants ne changent pas : paye d’avant, CA d’une vente historique', () => {
    const v = vente({ statut: 'vendue', lignes: [ligne({ montantTtc: 3215 })] });
    expect(payeTtcDe(v)).toBe(3215);
    expect(caHt(v, 'criterimmo')).toBe(10000);
  });
});

describe('les 4 tuiles de l’onglet « Compromis »', () => {
  // 12 000 TTC = 10 000 HT ; apporteur 1 200 TTC (1 000 HT) ; négociateur d'entrée 2 000 HT ; tout CRITERIMMO (historique).
  const simple = vente({ retroApporteur: { montant: 1200, unite: 'ttc' }, lignes: [ligne({ cote: 'entree', montantHt: 2000, montantTtc: 2400 })] });
  it('nombre, CA (TTC / HT), commissions versées (négociateurs + apporteurs), solde net', () => {
    const t = tuilesCompromis([simple], 'criterimmo');
    expect(t.nb).toBe(1);
    expect(t.caHt).toBe(10000);
    expect(t.caTtc).toBe(12000);
    expect(t.negociateursHt).toBe(2000);
    expect(t.apporteursHt).toBe(1000);
    expect(t.commissionsHt).toBe(3000);
    expect(t.commissionsTtc).toBe(3600);
    expect(t.soldeHt).toBe(7000);
    expect(t.soldeTtc).toBe(8400);
  });
  it('un solde NÉGATIF reste tel quel (le signe moins)', () => {
    const t = tuilesCompromis([vente({ honorairesTtc: 1200, lignes: [ligne({ cote: 'entree', montantTtc: 2400 })] })], 'criterimmo');
    expect(t.soldeHt).toBe(-1000);
    expect(t.soldeTtc).toBe(-1200);
  });
  it('les compromis annulés (et les ventes signées) sont exclus', () => {
    const t = tuilesCompromis([simple, vente({ id: 2, statut: 'annulee', annulation: { date: '2026-10-01', motif: 'Défaut de crédit', note: null } }),
      vente({ id: 3, statut: 'vendue' })], 'criterimmo');
    expect(t.nb).toBe(1);
    expect(t.caHt).toBe(10000);
  });

  // RÉPARTIE : 12 000 TTC, apporteur 2 400 TTC (2 000 HT), net 8 000 HT : JB (CRITERIMMO) 50 % entrée, Mylène (MACJ) 30 % sortie, Agence du Parc 20 %.
  const repartie = vente({ repartition: { retroApporteurTtc: 2400, parties: [partie({}), partie({ sorte: 'sortie', compteId: 7, negociateur: 'Mylène', societe: 'macj', pourcentage: 30 }),
    partie({ sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', pourcentage: 20 })] },
  retroApporteur: { montant: 2400, unite: 'ttc' },
  lignes: [ligne({ cote: 'entree', montantHt: 1000, montantTtc: 1200 }), ligne({ id: 2, negociateur: 'Mylène', cote: 'sortie', montantTtc: 600 })] });

  it('la répartition par société est respectée : CA = part de la commission entière ; chaque négociateur à SA société ; l’apporteur au prorata', () => {
    expect(fractionSociete(repartie, 'criterimmo')).toBe(0.5);
    expect(fractionSociete(repartie, 'macj')).toBeCloseTo(0.3, 12);
    expect(societeDeLigne(repartie, repartie.lignes[1])).toBe('macj');
    const c = tuilesCompromis([repartie], 'criterimmo');
    expect(c.caHt).toBe(5000);
    expect(c.negociateursHt).toBe(1000); // JB seul (Mylène est MACJ)
    expect(c.apporteursHt).toBe(1000); // 50 % de 2 000 HT
    // Le solde redonne la part nette de la répartition (4 000) moins la commission de JB.
    expect(c.soldeHt).toBe(caHt(repartie, 'criterimmo') - 1000);
    const m = tuilesCompromis([repartie], 'macj');
    expect(m.caHt).toBeCloseTo(3000, 9);
    expect(m.negociateursHt).toBe(500);
    expect(m.apporteursHt).toBeCloseTo(600, 9);
    // Le CA global = la somme des deux sociétés (la part extérieure, hors CA, n'y entre pas) ; rien n'est compté deux fois.
    const g = tuilesCompromis([repartie], null);
    expect(g.caHt).toBeCloseTo(c.caHt + m.caHt, 9);
    expect(g.commissionsHt).toBeCloseTo(c.commissionsHt + m.commissionsHt, 9);
    expect(g.soldeHt).toBeCloseTo(c.soldeHt + m.soldeHt, 9);
    expect(g.partHt.criterimmo).toBe(5000);
    expect(g.exterieurHt).toBe(1600);
  });
  it('une rétrocession saisie en HT pèse son montant HT (rien n’est converti en base)', () => {
    const v = vente({ retroApporteur: { montant: 1000, unite: 'ht' } });
    expect(tuilesCompromis([v], 'criterimmo').apporteursHt).toBe(1000);
  });
});

describe('🔴 LOT J — la part de la vente du négociateur d’un côté', () => {
  const pa = (sorte: Partie['sorte'], id: number | null, pct: number | null, montantHt: number | null = null) => partie({ sorte, compteId: id, pourcentage: pct, montantHt });
  const v = (parties: Partie[], entree: number | null, sortie: number | null) => vente({ repartition: { retroApporteurTtc: 0, parties },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: entree === null ? null : { id: entree, nom: 'E' }, sortie: sortie === null ? null : { id: sortie, nom: 'S' }, apporteurId: null, personnes: [] } });
  it('50/50, 60/40, 100 %, une part en € HT ramenée en %, le même négociateur des deux côtés', () => {
    expect([partDuCote(v([pa('entree', 5, 50), pa('sortie', 7, 50)], 5, 7), 'entree'), partDuCote(v([pa('entree', 5, 50), pa('sortie', 7, 50)], 5, 7), 'sortie')]).toEqual([50, 50]);
    expect(partDuCote(v([pa('entree', 5, 60), pa('sortie', 7, 40)], 5, 7), 'sortie')).toBe(40);
    expect(partDuCote(v([pa('entree', 5, 100)], 5, null), 'entree')).toBe(100);
    expect(partDuCote(v([pa('entree', 5, null, 2500), pa('sortie', 7, null, 7500)], 5, 7), 'entree')).toBe(25); // net 10 000 HT
    expect([partDuCote(v([pa('entree', 5, 100)], 5, 5), 'entree'), partDuCote(v([pa('entree', 5, 100)], 5, 5), 'sortie')]).toEqual([100, 0]);
  });
  it('sans répartition (historique, import) ou sans négociateur : null, rien d’inventé', () => {
    expect(partDuCote(vente({ dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'E' }, sortie: null, apporteurId: null, personnes: [] } }), 'entree')).toBeNull();
    expect(partDuCote(v([pa('entree', 5, 100)], 5, null), 'sortie')).toBeNull();
  });
});

describe('🔴 LOT K — le CA va à la société choisie sur la vente', () => {
  it('la partie d’un collaborateur des deux sociétés porte la société de la vente : CA, commission et solde y vont', () => {
    const v = vente({ repartition: { retroApporteurTtc: 0, parties: [partie({ negociateur: 'Cédric', compteId: 9, societe: 'macj', pourcentage: 100 })] },
      lignes: [ligne({ negociateur: 'Cédric', cote: 'entree', montantHt: 1000, montantTtc: 1200 })] });
    expect(tuilesCompromis([v], 'macj')).toMatchObject({ caHt: 10000, negociateursHt: 1000, soldeHt: 9000 });
    expect(tuilesCompromis([v], 'criterimmo')).toMatchObject({ caHt: 0, negociateursHt: 0 });
  });
});
