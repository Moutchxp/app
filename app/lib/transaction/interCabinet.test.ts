import { describe, expect, it } from 'vitest';
import { bilanVente, caHt, celluleGlobal, previsionnel, societePorteuse, totaux, TVA, type LigneVente, type Partie, type Vente } from './modele';
import { remuneration, remunerationDuCote, tuilesCompromis } from './commissions';
import { ligneMiroir, miroirsAttendus, planRegistre, venteDansSociete, type EntreeRegistre } from './interCabinet';

/**
 * 🔴 LOT R (Arno, 28/10/2026) — L'INTER-CABINET : la société porteuse (négociateur d'entrée) encaisse tout et reverse la part de l'autre
 * société (et de l'extérieur) ; l'autre société a sa LIGNE MIROIR (sa seule part) ; le groupe compte chaque commission une fois.
 */

const ligne = (o: Partial<LigneVente>): LigneVente => ({ id: 1, negociateur: 'X', role: 'negociateur', montantTtc: null, nature: 'compromis', compte: false, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const partie = (o: Partial<Partie>): Partie => ({ sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, ...o });
const vente = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 4000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: null,
  apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });

// LA RECETTE : HEIDIDON, 4 000 € TTC ; entrée Arnaud Jorel (CRITERIMMO, associé) 50 % ; sortie Pierre Thevenin (MACJ, indépendant) 50 %,
// commission saisie 2 000 € TTC (comme Arnaud). « Location ? » (l'autre compromis, apporteur 1 000 € TTC) : tout CRITERIMMO.
const ARNAUD = partie({ statut: 'associe' });
const PIERRE = partie({ sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', statut: 'independant' });
const dossier = (entree: { id: number; nom: string } | null, sortie: { id: number; nom: string } | null) =>
  ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree, sortie, apporteurId: null, personnes: [] });
const heididon = vente({ id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, repartition: { retroApporteurTtc: 0, parties: [ARNAUD, PIERRE] },
  dossier: dossier({ id: 2, nom: 'Arnaud Jorel' }, { id: 8, nom: 'Pierre Thevenin' }),
  lignes: [ligne({ id: 443, negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 2000 }), ligne({ id: 444, negociateur: 'Pierre Thevenin', cote: 'sortie', montantTtc: 2000 })] });
const location = vente({ id: 37, libelle: 'Location ?', honorairesTtc: 7500, retroApporteur: { montant: 1000, unite: 'ttc' },
  repartition: { retroApporteurTtc: 1000, parties: [ARNAUD, partie({ sorte: 'sortie', compteId: 5, negociateur: 'Jean-Baptiste PONS', statut: 'salarie' })] },
  dossier: dossier({ id: 2, nom: 'Arnaud Jorel' }, { id: 5, nom: 'Jean-Baptiste PONS' }),
  lignes: [ligne({ id: 440, negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 3750 }), ligne({ id: 441, negociateur: 'Jean-Baptiste PONS', cote: 'sortie', montantTtc: 3750 })] });
const ttc = (ht: number): number => ht * TVA;

describe('🔴 HEIDIDON — l’exemple d’Arno, au centime', () => {
  it('CRITERIMMO porte : CA 4 000 TTC ; versé 2 000 TTC (inter-cabinet vers MACJ) ; Arnaud non déduit ; solde 2 000 TTC', () => {
    expect(societePorteuse(heididon)).toBe('criterimmo');
    const t = tuilesCompromis([heididon], 'criterimmo');
    expect(t.caTtc).toBeCloseTo(4000, 9);
    expect(ttc(t.interCabinetHt.macj)).toBeCloseTo(2000, 9);
    expect(t.commissionsTtc).toBeCloseTo(2000, 9);
    expect(t.internesHt).toBeCloseTo(2000 / TVA, 9); // Arnaud, associé : affiché, non déduit ; Pierre n'est pas CRITERIMMO
    expect(t.independantsHt).toBe(0);
    expect(t.soldeTtc).toBeCloseTo(2000, 9);
  });
  it('la tuile « Commissions versées » de l’onglet CRITERIMMO : 1 000 (apporteur de « Location ? ») + 2 000 (inter-cabinet) = 3 000 TTC', () => {
    const t = tuilesCompromis([heididon, location], 'criterimmo');
    expect(t.commissionsTtc).toBeCloseTo(3000, 9);
    expect(t.caTtc).toBeCloseTo(11500, 9);
    expect(t.soldeTtc).toBeCloseTo(8500, 9);
  });
  it('MACJ : la ligne miroir « HEIDIDON — inter-cabinet reçu de CRITERIMMO », CA 2 000 TTC (1 666,67 HT) ; jamais 4 000', () => {
    const m = venteDansSociete(heididon, 'macj')!;
    expect(m.libelle).toBe('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
    expect(m.honorairesTtc).toBeCloseTo(2000, 9);
    expect(m.miroir).toMatchObject({ origineId: 38, porteuse: 'criterimmo', etat: 'active', pourcentage: 50 });
    expect(m.miroir!.partHt).toBeCloseTo(1666.6666666666667, 9);
    expect(m.prixVente).toBeNull();
    expect(m.repartition).toBeNull();
    // seule la commission de Pierre (MACJ) y est, avec son statut figé ; celle d'Arnaud reste chez CRITERIMMO
    expect(m.lignes.filter((l) => l.role === 'negociateur').map((l) => [l.negociateur, l.statut])).toEqual([['Pierre Thevenin', 'independant']]);
  });
  it('MACJ : valeur saisie de Pierre (2 000) gardée → solde 0 ; calcul proposé 1 000 (50 % × 2 000) ; appliqué → solde 1 000 TTC', () => {
    const m = venteDansSociete(heididon, 'macj')!;
    const avant = tuilesCompromis([m], 'macj');
    expect(avant.caTtc).toBeCloseTo(2000, 9);
    expect(avant.commissionsTtc).toBeCloseTo(2000, 9);
    expect(avant.soldeTtc).toBeCloseTo(0, 9);
    const r = remunerationDuCote(heididon, 'sortie')!;
    expect([r.baseTtc, r.taux, r.calculTtc, r.ecart]).toEqual([2000, 50, 1000, true]);
    expect(r.saisie).toEqual({ montant: 2000, unite: 'ttc' });
    const applique = { ...heididon, lignes: [heididon.lignes[0], { ...heididon.lignes[1], montantTtc: 1000, taux: 50 }] };
    const apres = tuilesCompromis([venteDansSociete(applique, 'macj')!], 'macj');
    expect(apres.commissionsTtc).toBeCloseTo(1000, 9);
    expect(apres.soldeTtc).toBeCloseTo(1000, 9);
    expect(remunerationDuCote(applique, 'sortie')!.ecart).toBe(false);
  });
  it('CA global : 4 000 TTC une seule fois ; 2 000 TTC d’inter-cabinet neutralisé ; le solde = la somme des deux sociétés', () => {
    const g = tuilesCompromis([heididon], null);
    expect(g.caTtc).toBeCloseTo(4000, 9);
    expect(ttc(g.neutraliseHt)).toBeCloseTo(2000, 9);
    expect(ttc(g.caSocieteHt.criterimmo + g.caSocieteHt.macj - g.neutraliseHt)).toBeCloseTo(4000, 9);
    const c = tuilesCompromis([heididon], 'criterimmo');
    const m = tuilesCompromis([venteDansSociete(heididon, 'macj')!], 'macj');
    expect(g.soldeHt).toBeCloseTo(c.soldeHt + m.soldeHt, 9);
    expect(previsionnel({ ventes: [heididon] }, 2026).totalHt).toBeCloseTo(4000 / TVA, 9);
  });
});

describe('🔴 la règle, cas par cas', () => {
  const v6040 = vente({ honorairesTtc: 12000, repartition: { retroApporteurTtc: 0, parties: [partie({ pourcentage: 60, statut: 'associe' }), { ...PIERRE, pourcentage: 40 }] },
    dossier: dossier({ id: 2, nom: 'Arnaud Jorel' }, { id: 8, nom: 'Pierre Thevenin' }) });
  it('60/40 : CRITERIMMO 10 000 HT de CA, reverse 4 000 HT à MACJ ; MACJ reçoit 4 000 HT ; le groupe 10 000 HT', () => {
    expect(bilanVente(v6040, 'criterimmo')).toMatchObject({ caHt: 10000, verseHt: { criterimmo: 0, macj: 4000 }, recuHt: 0 });
    expect(bilanVente(v6040, 'macj')).toMatchObject({ caHt: 4000, recuHt: 4000, apporteurHt: 0 });
    expect(bilanVente(v6040, null)).toMatchObject({ caHt: 10000, neutraliseHt: 4000 });
    expect(miroirsAttendus(v6040)).toEqual([{ societe: 'macj', porteuse: 'criterimmo', partHt: 4000, pourcentage: 40 }]);
  });
  it('taux de rémunération 60 % : 60 % × la part de chaque côté (entrée 7 200, sortie 4 800 TTC)', () => {
    const avecTaux = { ...v6040, lignes: [ligne({ negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 4320, taux: 60 }), ligne({ id: 2, negociateur: 'Pierre Thevenin', cote: 'sortie', montantTtc: 2880, taux: 60 })] };
    expect(remunerationDuCote(avecTaux, 'entree')).toMatchObject({ baseTtc: 7200, taux: 60, calculTtc: 4320, ecart: false });
    expect(remunerationDuCote(avecTaux, 'sortie')).toMatchObject({ baseTtc: 4800, taux: 60, calculTtc: 2880, ecart: false });
    expect(remuneration(4800, null)).toMatchObject({ taux: 50, calculTtc: 2400, saisie: null, ecart: false });
  });
  it('associé / salarié / indépendant de chaque côté : seuls les indépendants sont déduits, chacun dans SA société', () => {
    for (const [sE, sS] of [['associe', 'independant'], ['independant', 'salarie'], ['salarie', 'associe'], ['independant', 'independant']] as const) {
      const v = { ...v6040, repartition: { retroApporteurTtc: 0, parties: [partie({ pourcentage: 60, statut: sE }), { ...PIERRE, pourcentage: 40, statut: sS }] },
        lignes: [ligne({ negociateur: 'Arnaud Jorel', cote: 'entree', montantHt: 1000, montantTtc: 1200 }), ligne({ id: 2, negociateur: 'Pierre Thevenin', cote: 'sortie', montantHt: 500, montantTtc: 600 })] };
      const c = tuilesCompromis([v], 'criterimmo');
      const m = tuilesCompromis([venteDansSociete(v, 'macj')!], 'macj');
      expect(c.independantsHt).toBe(sE === 'independant' ? 1000 : 0);
      expect(c.internesHt).toBe(sE === 'independant' ? 0 : 1000);
      expect(m.independantsHt).toBe(sS === 'independant' ? 500 : 0);
      expect(m.internesHt).toBe(sS === 'independant' ? 0 : 500);
      expect(c.soldeHt).toBe(6000 - (sE === 'independant' ? 1000 : 0));
      expect(m.soldeHt).toBe(4000 - (sS === 'independant' ? 500 : 0));
    }
  });
  it('part extérieure : la porteuse encaisse tout et reverse l’extérieur (« Inter-cabinet extérieur ») ; au global, versée aussi', () => {
    const v = vente({ honorairesTtc: 12000, repartition: { retroApporteurTtc: 2400, parties: [partie({ pourcentage: 40 }), { ...PIERRE, pourcentage: 40 },
      partie({ sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', pourcentage: 20 })] } });
    const c = tuilesCompromis([v], 'criterimmo');
    expect([c.caHt, c.apporteursHt, c.interCabinetHt.macj, c.exterieurHt, c.soldeHt]).toEqual([10000, 2000, 3200, 1600, 3200]);
    const g = tuilesCompromis([v], null);
    expect([g.caHt, g.exterieurHt, g.neutraliseHt, g.commissionsHt]).toEqual([10000, 1600, 3200, 3600]);
    expect(totaux([{ ...v, statut: 'vendue', mois: 3 }], [], 'criterimmo')).toMatchObject({ caHt: 10000, retroHt: 2000, interCabinetHt: 3200, exterieurHt: 1600, resteHt: 3200 });
  });
  it('même société des deux côtés : pas d’inter-cabinet, une seule ligne, CA = la commission totale', () => {
    expect(miroirsAttendus(location)).toEqual([]);
    expect(venteDansSociete(location, 'macj')).toBeNull();
    expect(bilanVente(location, 'criterimmo')).toMatchObject({ caHt: 7500 / TVA, verseHt: { criterimmo: 0, macj: 0 }, exterieurHt: 0 });
    expect(bilanVente(location, null).neutraliseHt).toBe(0);
  });
  it('sans négociateur d’entrée : la porteuse est la société où la vente est saisie', () => {
    const v = vente({ societe: 'criterimmo', repartition: { retroApporteurTtc: 0, parties: [{ ...PIERRE, pourcentage: 100 }] } });
    expect(societePorteuse(v)).toBe('criterimmo');
    expect(caHt(v, 'criterimmo')).toBeCloseTo(4000 / TVA, 9);
    expect(caHt(v, 'macj')).toBeCloseTo(4000 / TVA, 9);
    expect(bilanVente(v, null).neutraliseHt).toBeCloseTo(4000 / TVA, 9);
  });
  it('avec un apporteur : la part de l’autre société se calcule APRÈS lui (coût partagé) ; la porteuse le paie', () => {
    const v = vente({ honorairesTtc: 7500, repartition: { retroApporteurTtc: 1000, parties: [ARNAUD, PIERRE] } });
    expect(bilanVente(v, 'criterimmo')).toMatchObject({ caHt: 6250, apporteurHt: 1000 / TVA });
    expect(bilanVente(v, 'macj').recuHt).toBeCloseTo(6500 / TVA / 2, 9); // 2 708,33 HT
    expect(tuilesCompromis([v], 'criterimmo').soldeHt).toBeCloseTo(6500 / TVA / 2, 9);
  });
  it('l’HISTORIQUE importé est inchangé : pas de ligne miroir, toute la commission à sa société, aux mêmes nombres', () => {
    const h = vente({ honorairesTtc: 11025, repartition: null });
    expect(venteDansSociete(h, 'criterimmo')).toBe(h);
    expect(venteDansSociete(h, 'macj')).toBeNull();
    expect(miroirsAttendus(h)).toEqual([]);
    expect(totaux([{ ...h, statut: 'vendue', mois: 2 }], [], 'criterimmo').resteHt).toBe(11025 / 1.2);
  });
});

describe('🔴 la ligne miroir suit la vente d’origine', () => {
  it('acte signé des deux côtés : la ligne miroir est une vente encaissée au même mois, dans le CA de MACJ ; le global ne compte qu’une fois', () => {
    const signe = { ...heididon, statut: 'vendue' as const, annee: 2026, mois: 11 };
    const m = venteDansSociete(signe, 'macj')!;
    expect([m.statut, m.annee, m.mois]).toEqual(['vendue', 2026, 11]);
    expect(totaux([m], [], 'macj').caHt).toBeCloseTo(2000 / TVA, 9);
    expect(totaux([signe], [], 'criterimmo').caHt).toBeCloseTo(4000 / TVA, 9);
    const c = celluleGlobal({ ventes: [signe], location: {}, gestion: [] }, 2026, 11);
    expect(c.venteCriterimmoHt).toBeCloseTo(4000 / TVA, 9);
    expect(c.venteMacjHt).toBeCloseTo(2000 / TVA, 9);
    expect(c.interCabinetHt).toBeCloseTo(2000 / TVA, 9);
    expect(c.totalHt).toBeCloseTo(4000 / TVA, 9);
  });
  it('annulation de la vente : la ligne miroir est annulée avec son motif ; rétablie : de nouveau en cours', () => {
    const annulee = { ...heididon, statut: 'annulee' as const, annulation: { date: '2026-10-28', motif: 'Défaut de crédit', note: null } };
    expect(venteDansSociete(annulee, 'macj')).toMatchObject({ statut: 'annulee', annulation: { motif: 'Défaut de crédit' } });
    expect(venteDansSociete(heididon, 'macj')!.statut).toBe('compromis');
  });
  it('le registre : créée, mise à jour (60/40), annulée quand MACJ ne reçoit plus rien (jamais supprimée), rétablie', () => {
    const reg = (o: Partial<EntreeRegistre>): EntreeRegistre => ({ societe: 'macj', porteuse: 'criterimmo', partHt: 2000 / TVA, pourcentage: 50, etat: 'active', modifieLe: null, ...o });
    expect(planRegistre(miroirsAttendus(heididon), [])).toEqual([{ sorte: 'creer', societe: 'macj', porteuse: 'criterimmo', partHt: expect.closeTo(2000 / TVA, 9), pourcentage: 50 }]);
    expect(planRegistre(miroirsAttendus(heididon), [reg({})])).toEqual([]);
    const v6040 = { ...heididon, repartition: { retroApporteurTtc: 0, parties: [{ ...ARNAUD, pourcentage: 60 }, { ...PIERRE, pourcentage: 40 }] } };
    expect(planRegistre(miroirsAttendus(v6040), [reg({})])).toMatchObject([{ sorte: 'maj', societe: 'macj', pourcentage: 40 }]);
    // Pierre remplacé par JB (CRITERIMMO) : MACJ ne reçoit plus rien → annulée ; la ligne miroir reste lisible, « annulée »
    const sansMacj = { ...heididon, repartition: { retroApporteurTtc: 0, parties: [ARNAUD, partie({ sorte: 'sortie', compteId: 5, negociateur: 'Jean-Baptiste PONS' })] } };
    expect(planRegistre(miroirsAttendus(sansMacj), [reg({})])).toMatchObject([{ sorte: 'annuler', societe: 'macj' }]);
    const lue = venteDansSociete(sansMacj, 'macj', reg({ etat: 'annulee', modifieLe: '2026-10-28' }))!;
    expect(lue).toMatchObject({ statut: 'annulee', miroir: { etat: 'annulee' }, annulation: { date: '2026-10-28', motif: 'Plus de part inter-cabinet pour MACJ sur cette vente' } });
    expect(lue.honorairesTtc).toBeCloseTo(2000, 9); // la dernière part connue, montrée telle quelle
    expect(tuilesCompromis([lue], 'macj').nb).toBe(0);
    // Pierre revient : rétablie (jamais un doublon)
    expect(planRegistre(miroirsAttendus(heididon), [reg({ etat: 'annulee' })])).toMatchObject([{ sorte: 'retablir', societe: 'macj' }]);
  });
  it('la porteuse change (MACJ à l’entrée) : CRITERIMMO a sa ligne miroir, MACJ porte ; jamais les deux pour la même société', () => {
    const inverse = { ...heididon, repartition: { retroApporteurTtc: 0, parties: [{ ...PIERRE, sorte: 'entree' as const }, { ...ARNAUD, sorte: 'sortie' as const }] } };
    expect(venteDansSociete(inverse, 'macj')).toBe(inverse);
    expect(venteDansSociete(inverse, 'criterimmo')!.libelle).toBe('HEIDIDON — inter-cabinet reçu de MACJ');
    expect(ligneMiroir(inverse, 'criterimmo', 1000, 50, 'active').honorairesTtc).toBe(1200);
  });
});
