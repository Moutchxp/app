import { describe, expect, it } from 'vitest';
import { compromisDuMode, MODES_MOIS, totauxMoisMode, ventesDuMois, type DonneesSociete, type ModeMois, type Vente } from './modele';
import { resultatDesCartes } from './carteAffaireLignes';
import { aConfirmerDesAnnees, anneesInitiales, borneCumul, cumulA, basculerAnnee, ecrireAnnees, lireAnnees, listeADate, listeDesAnnees, moisADate, moisDesAnnees, retrosDesAnnees, totauxDesAnnees, ventesDesAnnees } from './periodeAnnees';
/** 🔴 LOT DQ — « aujourd'hui » des épreuves (le placement des compromis en cours en « Vendu + compromis »). */
const JOUR_DQ = '2025-10-27';

/** 🔴 LOT DG (Arno) — « L'année » : la somme exacte de ses 12 mois de « Le mois », plus ses ventes « mois à confirmer ». */
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], double: null, ...o });
const d: Pick<DonneesSociete, 'ventes' | 'retrocessions' | 'societe' | 'statutsNegociateurs'> = {
  societe: 'macj', statutsNegociateurs: { MYLENE: 'independant' },
  ventes: [
    vente(1, { honorairesTtc: 11025.01, lignes: [{ id: 1, negociateur: 'MYLENE', role: 'negociateur', montantTtc: 3215.33, nature: 'vente', compte: true, origine: 'import', sourceFichier: null, sourceOnglet: 'MYLENE', sourceLigne: 1, note: null }] }),
    vente(2, { honorairesTtc: 16275.07, mois: 9 }),
    vente(3, { honorairesTtc: 5000.01, mois: 1 }),
    vente(4, { honorairesTtc: 7000.03, annee: 2025, mois: 7 }),
    vente(5, { honorairesTtc: 9000, statut: 'compromis', mois: null, dateCompromis: '2026-09-20' }),
    vente(6, { honorairesTtc: 3000, statut: 'compromis', mois: null, dateCompromis: '2025-07-02' }),
    vente(7, { honorairesTtc: 7500.07, mois: null }), // mois à confirmer 2026
    vente(8, { honorairesTtc: 2400, annee: 2025, mois: null }), // mois à confirmer 2025
    vente(9, { honorairesTtc: 6000, mois: 3, dateCompromis: '2025-12-01' }), // compromis 2025, acte 2026
    vente(10, { honorairesTtc: 1000, statut: 'annulee', mois: 4 }),
  ],
  retrocessions: [
    { id: 9, societe: 'macj', annee: 2026, mois: 7, negociateur: 'MYLENE', montantTtc: 1200.01, apporteur: null, venteId: null, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D3' },
    { id: 10, societe: 'macj', annee: 2025, mois: 9, negociateur: 'MYLENE', montantTtc: 333.33, apporteur: null, venteId: 4, libelle: null, origine: 'import', sourceOnglet: 'MYLENE', sourceCellule: 'D5' },
  ],
};
const ids = (vs: readonly Vente[]) => vs.map((v) => v.id);
const cartes = (vs: readonly Vente[]) => resultatDesCartes(vs, 'macj', { retros: d.retrocessions });
/** La liste du mois de « Le mois » selon le mode (vendu, compromis, ou les deux). */
const duMois = (a: number, k: number, mode: ModeMois): Vente[] => [...(mode === 'compromis' ? [] : ventesDuMois(d.ventes, a, k)), ...compromisDuMode(d.ventes, a, k, mode, JOUR_DQ)];

describe('🔴 LOT DG — « L’année » = la somme de ses 12 mois + ses ventes « mois à confirmer »', () => {
  it('les listes : ventes (12 mois puis « mois à confirmer »), compromis à leur date, les deux ; une annulée jamais', () => {
    expect(ids(ventesDesAnnees(d.ventes, [2026]))).toEqual([3, 9, 1, 2, 7]);
    expect(ids(listeDesAnnees(d.ventes, [2026], 'compromis', JOUR_DQ))).toEqual([5]);
    expect(ids(listeDesAnnees(d.ventes, [2025], 'compromis', JOUR_DQ))).toEqual([6, 9]);
    expect(ids(listeDesAnnees(d.ventes, [2026], 'tous', JOUR_DQ))).toEqual([3, 9, 1, 2, 7, 5]);
    expect(ids(listeDesAnnees(d.ventes, [2025, 2026], 'vendu', JOUR_DQ))).toEqual([4, 8, 3, 9, 1, 2, 7]);
    expect([ids(aConfirmerDesAnnees(d.ventes, [2026, 2025])), ids(aConfirmerDesAnnees(d.ventes, [2026], 'compromis'))]).toEqual([[8, 7], []]);
    expect(moisDesAnnees([2026, 2025]).slice(11, 13)).toEqual([{ annee: 2025, mois: 12 }, { annee: 2026, mois: 1 }]);
    expect(retrosDesAnnees(d.retrocessions, [2025]).map((r) => r.id)).toEqual([10]);
  });

  it('contrôle 6 : le CA de l’année (somme des cartes) − la somme de ses 12 mois = EXACTEMENT ses « mois à confirmer », au centime, HT et TTC, les trois modes', () => {
    for (const a of [2025, 2026]) for (const mode of MODES_MOIS) {
      const annee = cartes(listeDesAnnees(d.ventes, [a], mode, JOUR_DQ)).ca;
      const mois = Array.from({ length: 12 }, (_, i) => cartes(duMois(a, i + 1, mode)).ca).reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });
      const aConfirmer = cartes(aConfirmerDesAnnees(d.ventes, [a], mode)).ca;
      expect([a, mode, annee.htC - mois.htC, annee.ttcC - mois.ttcC]).toEqual([a, mode, aConfirmer.htC, aConfirmer.ttcC]);
    }
    // l'écart n'est pas nul : 2026 en vendu, 7 500,07 TTC
    expect(cartes(aConfirmerDesAnnees(d.ventes, [2026])).ca.ttcC).toBe(750007);
  });

  it('Période = la somme des années ; les totaux = les 12 mois (`totauxMoisMode`) + les « mois à confirmer »', () => {
    for (const mode of MODES_MOIS) {
      const deux = cartes(listeDesAnnees(d.ventes, [2025, 2026], mode, JOUR_DQ)).ca;
      const [x, y] = [cartes(listeDesAnnees(d.ventes, [2025], mode, JOUR_DQ)).ca, cartes(listeDesAnnees(d.ventes, [2026], mode, JOUR_DQ)).ca];
      expect([mode, deux.htC, deux.ttcC]).toEqual([mode, x.htC + y.htC, x.ttcC + y.ttcC]);
      const t = totauxDesAnnees(d, [2026], mode, JOUR_DQ);
      const somme = Array.from({ length: 12 }, (_, i) => totauxMoisMode(d, 2026, i + 1, mode, JOUR_DQ).nbVentes).reduce((p, q) => p + q, 0);
      expect([mode, t.nbVentes]).toEqual([mode, somme + (mode === 'compromis' ? 0 : 1)]);
    }
  });

  it('« à date » : année en cours jusqu’au mois d’aujourd’hui (sans « mois à confirmer »), année passée complète ; N−1 sur les mêmes mois', () => {
    expect([moisADate(2026, '2026-07-15'), moisADate(2025, '2026-07-15'), moisADate(2027, '2026-07-15')]).toEqual([7, 12, 0]);
    expect(ids(listeADate(d.ventes, 2026, 7, 'vendu', JOUR_DQ))).toEqual([3, 9, 1]);
    expect(ids(listeADate(d.ventes, 2025, 7, 'vendu', JOUR_DQ))).toEqual([4]);
    expect(ids(listeADate(d.ventes, 2025, 12, 'vendu', JOUR_DQ))).toEqual([4, 8]);
    expect(ids(listeADate(d.ventes, 2026, 0, 'tous', JOUR_DQ))).toEqual([]);
  });

  it('l’adresse : années lues / écrites ; cocher, décocher (la dernière reste) ; Année, Période, Tout ; anciens liens Début / Fin', () => {
    const dispo = [2023, 2024, 2025, 2026];
    expect([lireAnnees('2026,2024,2024,x,1999', dispo), lireAnnees('', dispo), lireAnnees(null, dispo), ecrireAnnees([2026, 2024])]).toEqual([[2024, 2026], null, null, '2024,2026']);
    expect([basculerAnnee([2026], 2024), basculerAnnee([2024, 2026], 2026), basculerAnnee([2026], 2026)])
      .toEqual([{ annees: [2024, 2026], refus: false }, { annees: [2024], refus: false }, { annees: [2026], refus: true }]);
    const p = (o: Partial<Record<'vueAnnee' | 'annees' | 'annee' | 'debut' | 'fin', string>>) => anneesInitiales({ vueAnnee: null, annees: null, annee: null, debut: null, fin: null, ...o }, dispo, '2026-10-31');
    expect(p({})).toEqual({ decoupage: 'annee', annees: [2026], annee: 2026 });
    expect(p({ annee: '2024' })).toEqual({ decoupage: 'annee', annees: [2024], annee: 2024 });
    expect(p({ vueAnnee: 'periode', annees: '2024,2025' })).toEqual({ decoupage: 'periode', annees: [2024, 2025], annee: 2025 });
    expect(p({ vueAnnee: 'tout' })).toEqual({ decoupage: 'tout', annees: dispo, annee: 2026 });
    // anciens liens « Début / Fin »
    expect(p({ debut: '2025', fin: '2025' })).toEqual({ decoupage: 'annee', annees: [2025], annee: 2025 });
    expect(p({ debut: '2024', fin: '2026' })).toEqual({ decoupage: 'periode', annees: [2024, 2025, 2026], annee: 2026 });
    expect(p({ debut: '2025' })).toEqual({ decoupage: 'periode', annees: [2025, 2026], annee: 2026 });
  });
});

describe('🔴 LOT DN — borneCumul : la borne unique de fin du cumul', () => {
  it('Mois : le mois choisi (même une année terminée) ; Période : le dernier mois choisi ; Année : complète (terminée), le mois en cours, rien (future)', () => {
    const j = '2026-10-31';
    expect(borneCumul('mois', 2025, 8, null, j)).toEqual({ fin: 8, mot: 'à fin août' });
    expect(borneCumul('periode', 2025, 3, [3, 10, 7], j)).toEqual({ fin: 10, mot: 'à fin octobre' });
    expect(borneCumul('annee', 2025, 8, null, j)).toEqual({ fin: 12, mot: 'année complète' }); // le mois de l'adresse n'est pas une borne
    expect(borneCumul('annee', 2026, 2, null, j)).toEqual({ fin: 10, mot: 'à fin octobre' });
    expect(borneCumul('annee', 2027, 2, null, j)).toEqual({ fin: 0, mot: 'rien encore' });
    expect([cumulA([1, 3, 6], 0), cumulA([1, 3, 6], 2), cumulA([1, 3, 6], 3)]).toEqual([0, 3, 6]);
  });
});
