import { describe, expect, it } from 'vitest';
import { compromisEnCours, totalCompromisEnCours } from './compromisEnCours';
import { detailCa } from './detailCommissions';
import { venteDansSociete } from './interCabinet';
import type { Partie, Vente } from './modele';

/** 🔴 LOT CY (Arno) — « Compromis en cours » : une seule règle (toutes années, sans date comprise, inter-cabinet de l'onglet Compromis). */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Partie['societe'], pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' });
const v = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc: 6000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-10-02',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o } as Vente);
// 2026 daté ; 2019 importé sans date ; acte prévu en 2027 ; inter-cabinet CRITERIMMO → MACJ (50 %) ; un acte signé ; un annulé ; un double à attribuer
const heididon = v(38, { libelle: 'HEIDIDON', honorairesTtc: 4000, annee: 2019, dateCompromis: null,
  repartition: { retroApporteurTtc: 0, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] } });
const ventes = [v(1, {}), v(2, { annee: 2019, dateCompromis: null, origine: 'import' }), v(3, { annee: 2027 }), heididon, v(4, { statut: 'vendue', mois: 5 }), v(5, { statut: 'annulee' }),
  v(6, { double: { cle: 'd', attribution: 'a_attribuer' } })];

describe('🔴 LOT CY — compromisEnCours / totalCompromisEnCours', () => {
  it('tous les compromis non actés, non annulés, quelle que soit l’année, dates absentes comprises ; ni acte, ni annulé, ni double à attribuer', () => {
    expect(compromisEnCours(ventes, 'criterimmo').map((x) => x.id)).toEqual([1, 2, 3, 38]);
  });
  it('MACJ : sa ligne miroir (la part reçue en inter-cabinet) ; nos deux sociétés : chaque affaire une fois, l’inter-cabinet neutralisé', () => {
    const miroir = venteDansSociete(heididon, 'macj')!;
    expect(compromisEnCours([miroir], 'macj').map((x) => x.id)).toEqual([38]);
    expect(totalCompromisEnCours([miroir], 'macj').ttcC).toBe(200000); // sa part : 2 000 TTC
    const tous = totalCompromisEnCours(ventes, null);
    expect(tous.nb).toBe(4);
    expect(tous.ttcC).toBe(detailCa(compromisEnCours(ventes, null), null).totalTtcC);
  });
  it('le total = la tuile « Chiffre d’affaires » de l’onglet (detailCa), au centime, HT et TTC', () => {
    const t = totalCompromisEnCours(ventes, 'criterimmo');
    const d = detailCa(compromisEnCours(ventes, 'criterimmo'), 'criterimmo');
    expect([t.nb, t.htC, t.ttcC, t.ids]).toEqual([4, d.totalHtC, d.totalTtcC, [1, 2, 3, 38]]);
  });
});
