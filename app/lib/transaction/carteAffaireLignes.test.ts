import { describe, expect, it } from 'vitest';
import { lignesCarteAffaire } from './carteAffaireLignes';
import type { Partie, Vente } from './modele';
import { venteDansSociete } from './interCabinet';

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
});
