import { describe, expect, it } from 'vitest';
import type { Apporteur } from '../location/suivi/suivi';
import { totauxPeriode, type ActiviteCalcul, type ContexteCalcul } from '../location/suivi/tableauBord';
import { coutsLocation, dusLocationParMois } from './locationCa';
import { coutsGlobaux } from './coutsGlobal';
import { lignesPourCoutsGlobaux, montantSaisi, salairesParMois, type CoutSaisi } from './coutsSaisis';
import { lireGesteCout } from '../mon-espace/couts';
import { profilsPourSalaire } from '../admin/fonctionsCompteModele';
import { E_COUTS } from '../mon-espace/__fixtures__/couts';

/**
 * 🔴 « LES COÛTS », LOT 2 (Arno, 03/11/2026) — UNE SEULE COMPTABILITÉ, CE QUI SE SAISIT ET CE QUI SE CALCULE :
 *   · les dus du module Location (C19 option A) = son Résumé de la période (`totauxPeriode`), au centime ; ils entrent dans les coûts de la Location ;
 *   · un coût saisi se compte UNE fois (salaires location / gestion par leur page, le reste par « Coûts globaux ») et déplace le résultat net du
 *     même montant, au bon mois, à la bonne structure, à la bonne année ;
 *   · la saisie acceptée par la route (C7 : location et gestion sur CRITERIMMO ; FUSION ne se saisit pas) ; l'ordre des profils (C9).
 */
const ligne = (o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400, primeSaisie: null,
  mandatGestion: true, categoriePrime: 'logement', apporteurId: 7, apporteurNom: 'DUPONT Léa', apporteurTaux: null, commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB',
  avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100, assurance: null, parking: false, vacanceJours: null,
  rattachement: 'rattache', origineContact: 'apporteur', tauxGestionBien: 5, finGestion: null, ...o,
});
const remu = { depuis: '2026-01-01', remunere: true, mode: 'recurrent' as const, taux: 0.05, tauxGestion: 0.1, dureeAnnees: 1 };
const apporteur: Apporteur = { id: 7, nom: 'Léa Dupont', type: 'partenaire', archive: false, compteId: null,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.2, dureeAnnees: 2 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }], remunerations: [remu] };

describe('🔴 C19 option A — la part de gestion récurrente et les collègues = le Résumé de la période du module Location', () => {
  const activites = [ligne(), ligne({ id: 2, dateSignature: '2026-05-04', honoProprietaireHt: 300.33 })];
  const ctx: ContexteCalcul = { regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [apporteur], retrocessions: [], aujourdhui: '2026-10-24' };
  const dus = dusLocationParMois(activites, [apporteur], '2026-10-24');
  it.each([3, 4, 5, 6, 9, 10])('2026-%s : part de gestion = apporteursRecurrents, collègues = collegues', (mois) => {
    const t = totauxPeriode(activites, ctx, { annee: 2026, mois });
    const d = dus.find((x) => x.annee === 2026 && x.mois === mois) ?? { partGestionHt: 0, colleguesHt: 0 };
    expect(d.partGestionHt).toBeCloseTo(t.apporteursRecurrents, 9);
    expect(d.colleguesHt).toBeCloseTo(t.collegues, 9);
  });
  it('rien après le mois en cours ; des montants réels (sinon l’égalité ne prouverait rien)', () => {
    expect(dus.every((x) => x.annee * 100 + x.mois <= 202610)).toBe(true);
    expect(dus.find((x) => x.mois === 3)!.colleguesHt).toBeGreaterThan(0);
    expect(dus.find((x) => x.mois === 7)!.partGestionHt).toBeGreaterThan(0);
  });
  it('ils entrent dans les coûts de la Location (sans TVA) et baissent son CA net du même montant ; absents : les coûts d’avant', () => {
    const d = [{ annee: 2026, mois: 9, partGestionHt: 12.34, colleguesHt: 5.01 }];
    const sans = coutsLocation([], [{ annee: 2026, mois: 9 }], [], null);
    const avec = coutsLocation([], [{ annee: 2026, mois: 9 }], [], null, true, d);
    expect([avec.partGestion, avec.collegues]).toEqual([{ htC: 1234, ttcC: 1234 }, { htC: 501, ttcC: 501 }]);
    expect(avec.couts.htC - sans.couts.htC).toBe(1735);
    expect(sans.net.htC - avec.net.htC).toBe(1735);
    expect([sans.partGestion.htC, sans.collegues.htC]).toEqual([0, 0]);
  });
});

describe('🔴 un coût saisi se compte une fois et déplace le résultat net du même montant (bon mois, bonne structure, bonne année)', () => {
  const ajout: CoutSaisi = { societe: 'macj', famille: 'vente', poste: 'autres', annee: 2026, mois: 3, montantHt: 123.45 };
  it('« Coûts globaux » de mars 2026 : +12 345 centimes ; avril, mars 2025 : inchangés', () => {
    const e2 = { ...E_COUTS, saisis: [...(E_COUTS.saisis ?? []), ajout] };
    expect(coutsGlobaux(e2, 2026, 3).total.htC - coutsGlobaux(E_COUTS, 2026, 3).total.htC).toBe(12345);
    expect(coutsGlobaux(e2, 2026, 4).total).toEqual(coutsGlobaux(E_COUTS, 2026, 4).total);
    expect(coutsGlobaux(e2, 2025, 3).total).toEqual(coutsGlobaux(E_COUTS, 2025, 3).total);
    expect(coutsGlobaux(e2, 2026, null).total.htC - coutsGlobaux(E_COUTS, 2026, null).total.htC).toBe(12345);
  });
  it('la bonne structure : MACJ seulement', () => {
    const ms = [{ annee: 2026, mois: 3 }];
    expect(montantSaisi([ajout], { famille: 'vente', poste: 'autres', ms, societe: 'macj' }).htC).toBe(12345);
    expect(montantSaisi([ajout], { famille: 'vente', poste: 'autres', ms, societe: 'criterimmo' }).htC).toBe(0);
  });
  it('les salaires de la Location et de la Gestion ne passent PAS par « Coûts globaux » (leur page les additionne) : jamais deux fois', () => {
    const l: CoutSaisi[] = [{ societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 3, montantHt: 1000 },
      { societe: 'criterimmo', famille: 'vente', poste: 'salaires', annee: 2026, mois: 3, montantHt: 2000 }];
    expect(lignesPourCoutsGlobaux(l)).toEqual([l[1]]);
    expect([...salairesParMois(l, 'gestion')]).toEqual([['2026-03', 1000]]);
    expect([...salairesParMois(l, 'location')]).toEqual([]);
  });
  it('plusieurs salariés d’un mois : leur somme, au centime', () => {
    const l: CoutSaisi[] = [0.1, 0.2, 1234.56].map((m) => ({ societe: 'criterimmo', famille: 'location', poste: 'salaires', annee: 2026, mois: 9, montantHt: m }));
    expect(salairesParMois(l, 'location').get('2026-09')).toBe(1234.86);
  });
});

describe('🔴 la saisie que la route accepte', () => {
  const ligneOk = { societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10, compteId: 5, montantHt: 2500.5 };
  it('un salaire de la gestion sur CRITERIMMO : accepté', () => {
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: ligneOk }).ok).toBe(true);
  });
  it('C7 — la location et la gestion sur MACJ : refusées ; FUSION ne se saisit pas', () => {
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, societe: 'macj' } })).toEqual({ ok: false, motif: 'La location et la gestion sont à CRITERIMMO : saisissez-les sur CRITERIMMO.' });
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, societe: 'tous' } }).ok).toBe(false);
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, famille: 'vente', societe: 'macj' } }).ok).toBe(true);
  });
  it('montants : positifs, deux décimales au plus ; un salaire a un salarié ; « Autres » un libellé', () => {
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, montantHt: -1 } }).ok).toBe(false);
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, montantHt: 1.234 } }).ok).toBe(false);
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, compteId: null } }).ok).toBe(false);
    expect(lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, poste: 'autres', compteId: null, libelle: '  ' } }).ok).toBe(false);
    const autres = lireGesteCout({ action: 'ligne-ajouter', ligne: { ...ligneOk, poste: 'autres', compteId: 9, libelle: ' Loyer ' } });
    expect(autres.ok && autres.geste.action === 'ligne-ajouter' ? [autres.geste.ligne.compteId, autres.geste.ligne.libelle] : null).toEqual([null, 'Loyer']);
  });
  it('modifier / retirer : une ligne et sa version ; ADHOC / MONGA : un mois, un montant ou vide, une version', () => {
    expect(lireGesteCout({ action: 'ligne-retirer', id: 3, version: 12 })).toEqual({ ok: true, geste: { action: 'ligne-retirer', id: 3, version: 12 } });
    expect(lireGesteCout({ action: 'ligne-modifier', id: 3 }).ok).toBe(false);
    expect(lireGesteCout({ action: 'gestion-poste', annee: 2026, mois: 10, poste: 'monga', montantHt: null, version: 0 }).ok).toBe(true);
    expect(lireGesteCout({ action: 'gestion-poste', annee: 2026, mois: 13, poste: 'monga', montantHt: 1, version: 0 }).ok).toBe(false);
    expect(lireGesteCout({ action: 'effacer' }).ok).toBe(false);
  });
});

describe('🔴 C9 — les profils proposés pour un salaire : la fonction de la famille d’abord, puis location / gestion, puis les autres', () => {
  it('ordre et groupes', () => {
    const p = [{ id: 1, libelle: 'Zoé', fonctions: ['vente' as const] }, { id: 2, libelle: 'Amélie', fonctions: [] }, { id: 3, libelle: 'Bruno', fonctions: ['gestion' as const] },
      { id: 4, libelle: 'Chloé', fonctions: ['location' as const, 'vente' as const] }];
    expect(profilsPourSalaire('vente', p).map((x) => [x.profil.libelle, x.groupe])).toEqual([['Chloé', 1], ['Zoé', 1], ['Bruno', 2], ['Amélie', 3]]);
    expect(profilsPourSalaire('gestion', p).map((x) => [x.profil.libelle, x.groupe])).toEqual([['Bruno', 1], ['Chloé', 2], ['Amélie', 3], ['Zoé', 3]]);
  });
});

describe('🔴 R2 — la TVA par ligne', () => {
  const l = (montantHt: number, tva?: boolean, poste: 'autres' | 'salaires' = 'autres'): CoutSaisi => ({ societe: 'criterimmo', famille: 'gestion', poste, annee: 2026, mois: 10, montantHt, tva });
  const ms = [{ annee: 2026, mois: 10 }];
  it('« sans TVA » : TTC = HT ; « TVA 20 % » : TTC = HT × 1,20 au centime (la règle d’ADHOC) ; un salaire : jamais de TVA, même marqué', () => {
    expect(montantSaisi([l(100.01, false)], { famille: 'gestion', poste: 'autres', ms })).toEqual({ htC: 10001, ttcC: 10001 });
    expect(montantSaisi([l(100.01, true)], { famille: 'gestion', poste: 'autres', ms })).toEqual({ htC: 10001, ttcC: Math.round(10001 * 1.2) });
    expect(montantSaisi([l(100.01, true), l(33.33, false)], { famille: 'gestion', poste: 'autres', ms })).toEqual({ htC: 13334, ttcC: 12001 + 3333 });
    expect(montantSaisi([l(2000, true, 'salaires')], { famille: 'gestion', poste: 'salaires', ms })).toEqual({ htC: 200000, ttcC: 200000 });
  });
  it('« Coûts globaux » : le TTC de « Autres » = la somme des lignes, chacune à sa TVA, au centime', () => {
    const e = { ...E_COUTS, saisis: [{ societe: 'criterimmo' as const, famille: 'location' as const, poste: 'autres' as const, annee: 2026, mois: 10, montantHt: 10.05, tva: true },
      { societe: 'criterimmo' as const, famille: 'location' as const, poste: 'autres' as const, annee: 2026, mois: 10, montantHt: 7, tva: false }] };
    const c = coutsGlobaux(e, 2026, 10);
    expect(c.saisis.locationAutres).toEqual({ htC: 1705, ttcC: Math.round(1005 * 1.2) + 700 });
    expect(c.total.ttcC - coutsGlobaux({ ...e, saisis: [] }, 2026, 10).total.ttcC).toBe(Math.round(1005 * 1.2) + 700);
  });
});
