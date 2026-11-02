import { describe, expect, it } from 'vitest';
import { espaceNegociateurs, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { totalCompromisEnCours } from '../transaction/compromisEnCours';
import { retrosDesAnnees, ventesDesAnnees } from '../transaction/periodeAnnees';
import { ventesPeriode } from '../transaction/periodeMois';
import { parApporteur, type DonneesSociete, type Vente } from '../transaction/modele';
import { resolveurDe } from '../transaction/statutLigne';
import { anneesAgence, apporteursAgence, compteursAgence, estAgence, negociateursAgence, statistiquesAgence, ventesDuChoix } from './agence';
import { totauxDuChoix, type ChoixStats } from './statistiques';

/**
 * 🔴 MON ESPACE, LOT 10 — le mode agence (pur) : CHAQUE chiffre = celui que l'écran du Suivi CA calcule sur les mêmes données, au centime, HT et
 * TTC, en Mois / Période / Année / Tout (la tuile « CA » = `resultatDesCartes` des ventes signées de la période ; compromis en cours =
 * `totalCompromisEnCours` ; par négociateur = `espaceNegociateurs` ; par apporteur = le bloc de « L'année »). Données fictives (centimes impairs).
 */
const JOUR = '2026-11-02';
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], double: null, ...o });
const ligne = (id: number, negociateur: string, montantTtc: number) => ({ id, negociateur, role: 'negociateur' as const, montantTtc, nature: 'vente' as const, compte: true, origine: 'import' as const,
  sourceFichier: null, sourceOnglet: negociateur, sourceLigne: id, note: null });
const d: Pick<DonneesSociete, 'ventes' | 'retrocessions' | 'societe' | 'statutsNegociateurs'> = {
  societe: 'macj', statutsNegociateurs: { MYLENE: 'independant', CEDRIC: 'salarie' },
  ventes: [
    vente(1, { honorairesTtc: 11025.01, lignes: [ligne(1, 'MYLENE', 3215.33)] }),
    vente(2, { honorairesTtc: 16275.07, mois: 9, sourceOnglet: 'CEDRIC', lignes: [ligne(2, 'CEDRIC', 1000.01)] }),
    vente(3, { honorairesTtc: 5000.01, mois: 1 }),
    vente(4, { honorairesTtc: 7000.03, annee: 2025, mois: 7 }),
    vente(5, { honorairesTtc: 9000.01, statut: 'compromis', mois: null, dateCompromis: '2026-09-20' }),
    vente(6, { honorairesTtc: 3000.03, statut: 'compromis', mois: null, dateCompromis: '2025-07-02' }),
    vente(7, { honorairesTtc: 7500.07, mois: null }), // mois à confirmer 2026
    vente(8, { honorairesTtc: 2400.01, annee: 2025, mois: null }),
    vente(9, { honorairesTtc: 6000, mois: 3, dateCompromis: '2025-12-01' }),
    vente(10, { honorairesTtc: 1000, statut: 'annulee', mois: 4 }),
    vente(11, { honorairesTtc: 4444.44, mois: 5, double: { cle: 'x', attribution: 'a_attribuer' } as Vente['double'] }), // notée deux fois, à attribuer : hors CA
  ],
  retrocessions: [
    { id: 9, societe: 'macj', annee: 2026, mois: 7, negociateur: 'MYLENE', montantTtc: 1200.01, apporteur: 'DEBLOIS', venteId: 1, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D3' },
    { id: 10, societe: 'macj', annee: 2025, mois: 9, negociateur: 'MYLENE', montantTtc: 333.33, apporteur: 'DUPONT', venteId: 4, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D5' },
    { id: 11, societe: 'macj', annee: 2026, mois: 2, negociateur: 'CEDRIC', montantTtc: 99.99, apporteur: 'SEUL', venteId: null, libelle: null, origine: 'import', sourceOnglet: 'CEDRIC', sourceCellule: 'D7' },
  ],
};
const opts = { retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
const cartes = (vs: readonly Vente[]) => resultatDesCartes(vs, d.societe, opts).ca;
const s = statistiquesAgence(d, JOUR);
const choix = (o: Partial<ChoixStats>): ChoixStats => ({ mode: 'annee', annee: 2026, mois: 7, periode: [1, 11], ...o });

describe('🔴 mode agence : les chiffres du Suivi CA, au centime', () => {
  it('les structures : criterimmo, macj, tous ; rien d’autre', () => {
    expect(['criterimmo', 'macj', 'tous'].every(estAgence)).toBe(true);
    expect(estAgence('fusion')).toBe(false);
  });
  it('Année : CA et nombre = la tuile « CA » de « L’année » (somme des cartes des 12 mois + mois à confirmer), N−1 aussi', () => {
    const t = totauxDuChoix(s, choix({}), JOUR);
    expect(t.n.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2026])));
    expect(t.n.nb).toBe(ventesDesAnnees(d.ventes, [2026]).length);
    expect(t.n1!.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2025])));
  });
  it.each([
    ['Mois', choix({ mode: 'mois', mois: 7 }), [{ annee: 2026, mois: 7 }]],
    ['Période', choix({ mode: 'periode', periode: [2, 3, 4, 5, 6, 7, 8, 9] }), [2, 3, 4, 5, 6, 7, 8, 9].map((mois) => ({ annee: 2026, mois }))],
  ])('%s : CA = la tuile « CA » de « Le mois » (somme des cartes des ventes de la période)', (_, c, ms) => {
    expect(totauxDuChoix(s, c, JOUR).n.ca).toEqual(cartes(ventesPeriode(d.ventes, ms)));
    expect(ventesDuChoix(d, c, JOUR).map((v) => v.id)).toEqual(ventesPeriode(d.ventes, ms).map((v) => v.id));
  });
  it('Tout : toutes les années (somme des cartes de toutes les ventes signées comptées)', () => {
    expect(totauxDuChoix(s, choix({ mode: 'tout' }), JOUR).n.ca).toEqual(cartes(ventesDesAnnees(d.ventes, anneesAgence(d, JOUR))));
  });
  it('une vente notée deux fois et à attribuer, une annulée, un compromis : hors du CA acté', () => {
    const vues = ventesDuChoix(d, choix({ mode: 'tout' }), JOUR).map((v) => v.id);
    expect(vues).not.toContain(11);
    expect(vues).not.toContain(10);
    expect(vues).not.toContain(5);
  });
  it('compteurs : compromis en cours = `totalCompromisEnCours` ; ventes de l’année et par année = la somme des cartes', () => {
    const c = compteursAgence(d, JOUR);
    const cec = totalCompromisEnCours(d.ventes, d.societe, opts.statutDuLibelle);
    expect(c.compromis).toEqual({ nb: cec.nb, ids: cec.ids, ca: { htC: cec.htC, ttcC: cec.ttcC } });
    expect(c.actees.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2026])));
    expect(c.parAnnee!.map((a) => a.annee)).toEqual([2026, 2025]);
    expect(c.parAnnee![1].ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2025])));
  });
  it('par négociateur = `espaceNegociateurs` des ventes du choix ; par apporteur = le bloc de « L’année »', () => {
    expect(negociateursAgence(d, choix({}), JOUR)).toEqual(espaceNegociateurs(ventesDesAnnees(d.ventes, [2026]), d.societe, opts));
    const ids = new Set(ventesDesAnnees(d.ventes, [2026]).map((v) => v.id));
    const saisies = retrosDesAnnees(d.retrocessions, [2026]);
    const attendu = parApporteur([...saisies, ...d.retrocessions.filter((r) => r.venteId !== null && ids.has(r.venteId) && !saisies.some((x) => x.id === r.id))], d.ventes);
    expect(apporteursAgence(d, choix({}), JOUR)).toEqual(attendu);
    expect(apporteursAgence(d, choix({}), JOUR).map((a) => a.apporteur).sort()).toEqual(['DEBLOIS', 'SEUL']);
  });
  it('la somme des mois de chaque année + son « mois à confirmer » = l’année (la somme des cartes est additive)', () => {
    for (const a of s.annees) {
      const somme = [...a.ca, a.aConfirmer].reduce((t, m) => ({ htC: t.htC + m.htC, ttcC: t.ttcC + m.ttcC }), { htC: 0, ttcC: 0 });
      expect(somme).toEqual(cartes(ventesDesAnnees(d.ventes, [a.annee])));
    }
  });
});
