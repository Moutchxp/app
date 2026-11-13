import { describe, expect, it } from 'vitest';
import { masquerSalaires, rehydraterSalairesMasques, estConfidentiel } from './confidentialiteSalaires';
import { coutsGlobaux } from './coutsGlobal';
import { moisGestion, totauxGestion } from './gestionVue';
import { eur, montantFr } from './format';
import { E_COUTS } from '../mon-espace/__fixtures__/couts';
import type { CoutLigne } from './coutsSaisis';
import type { GestionMois } from './modele';

/**
 * 🔴🔴 LA CONFIDENTIALITÉ DES SALAIRES (Arno, 13/11/2026, option 1) — un compte « Transaction » sans « Les coûts » : aucun salaire individuel, ni par
 * le détail, ni par soustraction ; « confidentiel » dès qu'un salaire seul serait retrouvable, exact dès que l'agrégat compte au moins deux salariés.
 */
const ligne = (id: number, compteId: number, famille: 'vente' | 'location' | 'gestion', mois: number, montantHt: number, societe: 'criterimmo' | 'macj' = 'criterimmo'): CoutLigne =>
  ({ id, societe, famille, poste: 'salaires', annee: 2026, mois, compteId, compteLibelle: `Salarié ${compteId}`, libelle: null, montantHt, version: 1 });
const g = (mois: number, x: Partial<GestionMois> = {}): GestionMois => ({ id: 202600 + mois, annee: 2026, mois, nbLots: null, honorairesHt: 10000, adhocHt: 1000, mongaHt: null,
  salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...x });
// septembre : DEUX salariés en vente (CRITERIMMO) — agrégat livré ; octobre : UN seul en vente — masqué ; gestion : un seul en septembre — masqué
const LIGNES = [ligne(1, 5, 'vente', 9, 2100.5), ligne(2, 8, 'vente', 9, 1900), ligne(3, 5, 'vente', 10, 2200), ligne(4, 4, 'gestion', 9, 1800)];
const BRUT = { coutsLignes: [...LIGNES, { ...ligne(9, 2, 'vente', 9, 5000), poste: 'remunerations' as const }],
  coutsSaisis: LIGNES.filter((l) => l.famille === 'vente').map(({ societe, famille, poste, annee, mois, montantHt }) => ({ societe, famille, poste, annee, mois, montantHt })),
  gestion: [g(9, { salarieHt: 1800, resteHt: 7200 }), g(10), g(8, { salarieHt: 1500, resteHt: 7500 })],
  locationCa: { lignes: [], retrocessions: [], salaires: [{ annee: 2026, mois: 9, salairesHt: 3000, note: null }], dus: [] } };

describe('🔴 le serveur : ce qu’un compte sans « Les coûts » reçoit', () => {
  const m = masquerSalaires(BRUT, BRUT.coutsLignes);
  const json = JSON.stringify(m);
  it('aucune ligne de salarié (ni rémunération d’associé) ; aucun nom de salarié', () => {
    expect(m.coutsLignes).toEqual([]);
    expect(json).not.toMatch(/Salarié \d/);
  });
  it('septembre, vente, deux salariés : l’AGRÉGAT seul (4 000,50 €) ; octobre, un seul salarié : RIEN (ni le montant, ni la ligne)', () => {
    expect(m.coutsSaisis).toEqual([{ societe: 'criterimmo', famille: 'vente', poste: 'salaires', annee: 2026, mois: 9, montantHt: 4000.5 }]);
    for (const x of ['2100.5', '1900', '2200']) expect(json).not.toContain(x);
  });
  it('les mois d’un seul salarié (ou d’un ancien montant mensuel) : masqués, et le « reste » du comptable aussi (il trahirait le salaire)', () => {
    expect(m.salairesMasques).toEqual(expect.arrayContaining([{ societe: 'criterimmo', famille: 'vente', annee: 2026, mois: 10 },
      { societe: 'criterimmo', famille: 'gestion', annee: 2026, mois: 9 }, { societe: 'criterimmo', famille: 'gestion', annee: 2026, mois: 8 },
      { societe: 'criterimmo', famille: 'location', annee: 2026, mois: 9 }]));
    expect(m.gestion!.find((x) => x.mois === 9)).toMatchObject({ salarieHt: null, resteHt: null });
    expect(m.locationCa!.salaires).toEqual([{ annee: 2026, mois: 9, salairesHt: null, note: null }]);
    for (const x of ['1800', '7200', '3000', '1500', '7500']) expect(json).not.toContain(`:${x}`);
  });
});

describe('🔴 le navigateur : « confidentiel » partout où un salaire seul serait retrouvable — exact ailleurs, au centime', () => {
  const e = (d: { coutsSaisis?: typeof BRUT.coutsSaisis; gestion?: GestionMois[] }) => ({ ...E_COUTS, saisis: d.coutsSaisis ?? [], gestion: d.gestion ?? [] });
  const vu = rehydraterSalairesMasques(masquerSalaires(BRUT, BRUT.coutsLignes));
  const complet = e(BRUT); const masque = e(vu);
  it('septembre (deux salariés en vente) : salaires de la vente exacts ; octobre (un seul) : inconnus, et le total des coûts d’octobre aussi', () => {
    expect(coutsGlobaux(masque, 2026, 9, true).saisis.venteSalaires).toEqual(coutsGlobaux(complet, 2026, 9, true).saisis.venteSalaires);
    expect(estConfidentiel(coutsGlobaux(masque, 2026, 10, true).saisis.venteSalaires.htC)).toBe(true);
    expect(estConfidentiel(coutsGlobaux(masque, 2026, 10, true).total.htC)).toBe(true);
    expect(estConfidentiel(coutsGlobaux(masque, 2026, 10, true).total.ttcC)).toBe(true);
  });
  it('un mois sans salaire masqué : son total EXACT (le même qu’un compte « Les coûts ») ; l’année qui contient un mois masqué : confidentielle', () => {
    expect(coutsGlobaux(masque, 2026, 3, true).total).toEqual(coutsGlobaux(complet, 2026, 3, true).total);
    expect(estConfidentiel(coutsGlobaux(masque, 2026, null, true).total.htC)).toBe(true);
  });
  it('« Sans salaires » : rien de masqué n’y entre — les totaux exacts', () => {
    expect(coutsGlobaux(masque, 2026, 10, false).total).toEqual(coutsGlobaux(complet, 2026, 10, false).total);
  });
  it('la gestion : le salarié, le reste, le CA net du mois masqué sont inconnus ; les honoraires, ADHOC restent exacts ; le mois sans salaire : exact', () => {
    const s = moisGestion(vu.gestion!, 2026, 9);
    expect([estConfidentiel(s.salariesC), estConfidentiel(s.netC), s.honorairesC, s.adhocC]).toEqual([true, true, 1000000, 100000]);
    expect(estConfidentiel(vu.gestion!.find((x) => x.mois === 9)!.resteHt)).toBe(true);
    expect(moisGestion(vu.gestion!, 2026, 10)).toEqual(moisGestion(BRUT.gestion, 2026, 10));
    expect(estConfidentiel(totauxGestion(vu.gestion!, [{ annee: 2026, mois: 9 }, { annee: 2026, mois: 10 }]).netC)).toBe(true);
    expect(totauxGestion(vu.gestion!, [{ annee: 2026, mois: 9 }], false).netC).toBe(totauxGestion(BRUT.gestion, [{ annee: 2026, mois: 9 }], false).netC); // hors salaires
  });
  it('l’affichage : « confidentiel », jamais « 0 € » ni « NaN »', () => {
    expect([eur(Number.NaN), montantFr(Number.NaN), eur(12.5)]).toEqual(['confidentiel', 'confidentiel', '12,50 €']);
  });
  it('un compte « Les coûts » : aucun masque, les données telles quelles', () => {
    expect(rehydraterSalairesMasques(BRUT)).toBe(BRUT);
  });
});
