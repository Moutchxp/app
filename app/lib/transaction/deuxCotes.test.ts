import { describe, expect, it } from 'vitest';
import { fusionDeuxCotes, memeNegociateurDeuxCotes } from './deuxCotes';
import { ventilationVente } from './partAgence';
import type { LigneVente, Vente } from './modele';

/**
 * 🔴 Arno (06/11/2026) — une affaire tenue des DEUX côtés par le même négociateur, présentée une fois : les montants de la carte se recoupent au
 * centime avec la vente (12 000 € TTC), aucune com négo sur des honoraires non attribués, jamais de montant négatif. Données fictives.
 */
type Partie = NonNullable<Vente['repartition']>['parties'][number];
const P = (sorte: Partie['sorte'], compteId: number, negociateur: string, pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage, montantHt: null });
const L = (cote: 'entree' | 'sortie', montantTtc: number, mode: 'calculee' | 'manuelle' = 'calculee'): LigneVente =>
  ({ id: cote === 'entree' ? 1 : 2, negociateur: 'Léa MARTIN', role: 'negociateur', cote, montantTtc, taux: 50, mode, nature: 'vente', compte: true, origine: 'saisie',
    sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null } as LigneVente);
const vente = (parties: Partie[], lignes: LigneVente[], sortie = { id: 5, nom: 'Léa MARTIN' }): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000,
  statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-11-06', apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null,
  double: null, repartition: { retroApporteurTtc: 0, parties }, lignes,
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie, apporteurId: null, personnes: [] } });
const f = (v: Vente) => fusionDeuxCotes(v, ventilationVente(v, null));
const TOUT = { htC: 1000000, ttcC: 1200000 };

describe('fusionDeuxCotes', () => {
  it('la forme enregistrée par « Les deux côtés » (entrée 100 %, sortie à 0) : l’affaire entière, com négo 6 000, part de l’agence 6 000', () => {
    const r = f(vente([P('entree', 5, 'Léa MARTIN', 100)], [L('entree', 6000), L('sortie', 0)]))!;
    expect(r.x.base).toEqual(TOUT);
    expect(r.commissions.map((c) => [c.cote, c.m.ttcC, c.source])).toEqual([['entree', 600000, 'calcul']]);
    expect(r.x.agence).toEqual({ htC: 500000, ttcC: 600000 });
    expect(r.alerte).toBe(false);
  });
  it('60 / 40 au même négociateur : les deux commissions additionnées ; honoraires = commissions + part de l’agence, au centime', () => {
    const r = f(vente([P('entree', 5, 'Léa MARTIN', 60), P('sortie', 5, 'Léa MARTIN', 40)], [L('entree', 3600), L('sortie', 2400)]))!;
    expect(r.total.ttcC).toBe(600000);
    expect(r.x.agence.ttcC + r.total.ttcC).toBe(r.x.base.ttcC);
    expect(r.x.agence.htC + r.total.htC).toBe(r.x.base.htC);
  });
  it('une commission saisie à la main sur le côté à 0 % : comptée une fois dans l’affaire entière, jamais de part négative', () => {
    const r = f(vente([P('entree', 5, 'Léa MARTIN', 100)], [L('entree', 6000), L('sortie', 1500, 'manuelle')]))!;
    expect(r.commissions.map((c) => [c.cote, c.m.ttcC, c.source])).toEqual([['entree', 600000, 'calcul'], ['sortie', 150000, 'enregistree']]);
    expect(r.x.agence.ttcC).toBe(450000);
    expect(r.x.agence.ttcC).toBeGreaterThanOrEqual(0);
  });
  it('« entrée et sortie » sans commission enregistrée : la com négo n’est calculée QUE sur les honoraires attribués (pas deux fois)', () => {
    const r = f(vente([P('entree_sortie', 5, 'Léa MARTIN', 100)], []))!;
    expect(r.total.ttcC).toBe(600000);
    expect(r.x.agence.ttcC).toBe(600000);
  });
  it('des commissions supérieures aux honoraires : part de l’agence NON affichée (0), alerte', () => {
    const r = f(vente([P('entree', 5, 'Léa MARTIN', 100)], [L('entree', 9000, 'manuelle'), L('sortie', 5000, 'manuelle')]))!;
    expect(r.alerte).toBe(true);
    expect(r.x.agence).toEqual({ htC: 0, ttcC: 0 });
  });
  it('un seul côté, ou un collègue de l’autre côté : rien (la carte d’avant)', () => {
    expect(f(vente([P('entree', 5, 'Léa MARTIN', 100)], [], null as never))).toBeNull();
    expect(f(vente([P('entree', 5, 'Léa MARTIN', 50), P('sortie', 7, 'Marc DURAND', 50)], [], { id: 7, nom: 'Marc DURAND' }))).toBeNull();
    expect(memeNegociateurDeuxCotes({ dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'A' }, sortie: { id: 7, nom: 'B' }, apporteurId: null, personnes: [] } })).toBe(false);
  });
});
