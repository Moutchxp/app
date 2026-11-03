import { describe, expect, it } from 'vitest';
import { coutsGlobaux } from './coutsGlobal';
import { eclaterSalaires, lignesPourCoutsGlobaux, montantSaisi, partDuSalaire, salairesParMois, type CoutLigne } from './coutsSaisis';
import type { GestionMois } from './modele';
import type { VersionPrincipale } from '../admin/activitePrincipale';
import { profilsPourSalaire } from '../admin/fonctionsCompteModele';
import { E_COUTS } from '../mon-espace/__fixtures__/couts';

/**
 * 🔴 D35 (Arno, 03/11/2026, option C) — LE SALAIRE RATTACHÉ AU COLLABORATEUR : UNE ligne par mois (sans famille enregistrée), sa famille se calcule
 * (l'activité principale, au prorata le mois d'un changement). Les écrans qui lisent ces lignes — Les coûts, la Location, la Gestion, Coûts globaux,
 * le CA net, le graphique — voient la MÊME répartition, au centime, et la somme des parts = le salaire saisi.
 */
const brute = (o: Partial<Omit<CoutLigne, 'famille'>> & { famille?: CoutLigne['famille'] | null }) => ({ id: 1, societe: 'criterimmo' as const, famille: null, poste: 'salaires' as const,
  annee: 2027, mois: 11, montantHt: 3000, tva: false, compteId: 5, compteLibelle: 'Jean-Baptiste Pons', libelle: null, version: 7, ...o });
const LOC_GESTION_16: VersionPrincipale[] = [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2027-11-16' }];

describe('eclaterSalaires — une ligne par activité du mois', () => {
  it('Location → Gestion le 16 (30 jours), 3 000 € : 1 500 en location, 1 500 en gestion, « prorata 15/30 j », le montant saisi gardé', () => {
    const ls = eclaterSalaires([brute({})], new Map([[5, LOC_GESTION_16]]));
    expect(ls.map((l) => [l.famille, l.montantHt, l.montantSaisiHt, l.prorata])).toEqual([
      ['location', 1500, 3000, { jours: 15, joursMois: 30, derniere: false }], ['gestion', 1500, 3000, { jours: 15, joursMois: 30, derniere: true }]]);
    expect(ls.every((l) => l.id === 1 && l.version === 7 && l.compteId === 5)).toBe(true);
  });
  it('mois de 31 jours : 15/31 et 16/31, la somme au centime = le salaire saisi', () => {
    const ls = eclaterSalaires([brute({ mois: 12, montantHt: 2345.67 })], new Map([[5, [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2027-12-16' }]]]));
    expect(ls.map((l) => l.prorata?.jours)).toEqual([15, 16]);
    expect(Math.round(ls[0]!.montantHt * 100) + Math.round(ls[1]!.montantHt * 100)).toBe(234567);
  });
  it('le mois d’après : 100 % gestion ; le mois d’avant : 100 % location (inchangé) ; sans mention', () => {
    const p = new Map([[5, LOC_GESTION_16]]);
    expect(eclaterSalaires([brute({ mois: 12 })], p).map((l) => [l.famille, l.montantHt, l.prorata])).toEqual([['gestion', 3000, undefined]]);
    expect(eclaterSalaires([brute({ mois: 10 })], p).map((l) => [l.famille, l.montantHt, l.prorata])).toEqual([['location', 3000, undefined]]);
  });
  it('une ligne qui garde sa famille (avant la 453, « Autres ») : telle quelle', () => {
    const autre = { ...brute({ poste: 'autres', compteId: null, libelle: 'Loyer', tva: true }), famille: 'vente' as const };
    expect(eclaterSalaires([autre, { ...brute({}), famille: 'gestion' as const }], new Map())).toEqual([autre, { ...brute({}), famille: 'gestion' }]);
  });
  it('un salaire sans activité principale (impossible à saisir) : compté en vente, signalé', () => {
    expect(eclaterSalaires([brute({ compteId: 99 })], new Map()).map((l) => [l.famille, l.montantHt, l.sansPrincipale])).toEqual([['vente', 3000, true]]);
  });
  it('Jean-Baptiste PONS (Location depuis toujours) : tous ses salaires en location', () => {
    const p = new Map<number, VersionPrincipale[]>([[5, [{ activite: 'location', depuis: null }]]]);
    for (const m of [1, 2, 11]) expect(eclaterSalaires([brute({ mois: m, montantHt: 2850.42 })], p).map((l) => [l.famille, l.montantHt])).toEqual([['location', 2850.42]]);
  });
});

describe('les mêmes parts partout, au centime', () => {
  const ls = eclaterSalaires([brute({}), brute({ id: 2, compteId: 2, compteLibelle: 'Arnaud Jorel', montantHt: 4100.01 })],
    new Map<number, VersionPrincipale[]>([[5, LOC_GESTION_16], [2, [{ activite: 'vente', depuis: null }, { activite: 'location', depuis: '2027-11-11' }]]]));
  const ms = [{ annee: 2027, mois: 11 }];
  it('Les coûts (montantSaisi) = les pages Location / Gestion (salairesParMois) ; vente + location + gestion = les salaires saisis', () => {
    const vente = montantSaisi(ls, { famille: 'vente', poste: 'salaires', ms }).htC;
    const location = montantSaisi(ls, { famille: 'location', poste: 'salaires', ms }).htC;
    const gestion = montantSaisi(ls, { famille: 'gestion', poste: 'salaires', ms }).htC;
    expect(Math.round(salairesParMois(ls, 'location').get('2027-11')! * 100)).toBe(location);
    expect(Math.round(salairesParMois(ls, 'gestion').get('2027-11')! * 100)).toBe(gestion);
    expect(vente).toBe(Math.round((410001 * 10) / 30)); // 10 jours de vente, le reste en location
    expect(vente + location + gestion).toBe(300000 + 410001);
  });
  it('Coûts globaux (le CA net en découle) : le mois augmente EXACTEMENT du salaire saisi, réparti entre ses activités', () => {
    const gestion: GestionMois[] = [...E_COUTS.gestion, { id: -1, annee: 2027, mois: 11, nbLots: null, honorairesHt: null, adhocHt: null, mongaHt: null,
      salarieHt: salairesParMois(ls, 'gestion').get('2027-11')!, resteHt: null, note: null, origine: 'saisie' }];
    const e2 = { ...E_COUTS, gestion, saisis: [...(E_COUTS.saisis ?? []), ...lignesPourCoutsGlobaux(ls)],
      location: { ...E_COUTS.location!, salaires: [...(E_COUTS.location!.salaires ?? []), { annee: 2027, mois: 11, salairesHt: salairesParMois(ls, 'location').get('2027-11')!, note: null }] } };
    const avant = coutsGlobaux(E_COUTS, 2027, 11); const apres = coutsGlobaux(e2, 2027, 11);
    expect(apres.total.htC - avant.total.htC).toBe(300000 + 410001);
    expect(apres.saisis.venteSalaires.htC).toBe(montantSaisi(ls, { famille: 'vente', poste: 'salaires', ms }).htC);
    expect(apres.location!.salaires.htC).toBe(montantSaisi(ls, { famille: 'location', poste: 'salaires', ms }).htC);
    expect(apres.gestion.salaires.htC).toBe(montantSaisi(ls, { famille: 'gestion', poste: 'salaires', ms }).htC);
    // le mois d'avant ne bouge pas
    expect(coutsGlobaux(e2, 2027, 10).total).toEqual(coutsGlobaux(E_COUTS, 2027, 10).total);
  });
  it('le sous-total de la saisie (partDuSalaire) = la part des tableaux', () => {
    expect(partDuSalaire(LOC_GESTION_16, 2027, 11, 3000, 'location')).toBe(1500);
    expect(partDuSalaire(LOC_GESTION_16, 2027, 11, 3000, 'vente')).toBe(0);
    expect(partDuSalaire(undefined, 2027, 11, 3000, 'vente')).toBe(3000);
  });
});

describe('les profils proposés suivent les fonctions EN VIGUEUR le mois saisi', () => {
  const p = [{ id: 5, libelle: 'Jean-Baptiste Pons', fonctions: ['gestion' as const],
    periodes: [{ fonction: 'location' as const, depuis: null, jusqua: '2027-11-16' }, { fonction: 'gestion' as const, depuis: '2027-11-16', jusqua: null }] },
    { id: 2, libelle: 'Arnaud Jorel', fonctions: ['vente' as const] }];
  it('octobre : Location (groupe 1 en location) ; décembre : Gestion seulement', () => {
    expect(profilsPourSalaire('location', p, { annee: 2027, mois: 10 }).map((x) => [x.profil.id, x.groupe])).toEqual([[5, 1], [2, 3]]);
    expect(profilsPourSalaire('location', p, { annee: 2027, mois: 12 }).map((x) => [x.profil.id, x.groupe])).toEqual([[5, 2], [2, 3]]);
    expect(profilsPourSalaire('gestion', p, { annee: 2027, mois: 11 }).map((x) => [x.profil.id, x.groupe])).toEqual([[5, 1], [2, 3]]);
  });
});
