import { describe, expect, it } from 'vitest';
import { E_COUTS } from './__fixtures__/couts';
import { coutsDuPoint, lireGesteCout } from './couts';
import { postesSaisis } from './saisieMois';
import { moisDeLaFenetre, tableauRecap } from './recap';
import { coutsGlobaux } from '../transaction/coutsGlobal';
import { montantSaisi, type CoutSaisi } from '../transaction/coutsSaisis';
import { sansRemunerations } from '../transaction/donneesGlobal';
import type { EntreesCoutsGlobaux } from '../transaction/coutsGlobal';

/**
 * 🔴🔴 472 — « RÉMUNÉRATIONS ASSOCIÉS » (Arno, 13/11/2026) : un poste de la VENTE, juste au-dessus des salaires chargés ; une ligne par associé, sans
 * TVA (HT = TTC), sa case ✓ ; il entre dans le sous-total vente, le total des coûts du mois et de l'année, et « Coûts globaux » (une seule
 * comptabilité) ; FUSION = la somme des deux structures.
 */
const r = (societe: 'criterimmo' | 'macj', mois: number, montantHt: number): CoutSaisi => ({ societe, famille: 'vente', poste: 'remunerations', annee: 2026, mois, montantHt });
const E: EntreesCoutsGlobaux = { ...E_COUTS, saisis: [...(E_COUTS.saisis ?? []), r('criterimmo', 9, 3000), r('criterimmo', 9, 1500.5), r('macj', 9, 2000)] };

describe('la place du poste', () => {
  it('vente : « Rémunérations associés » juste au-dessus de « Salaires chargés » — CRITERIMMO et MACJ ; jamais en location ni en gestion', () => {
    for (const s of ['criterimmo', 'macj'] as const) {
      const p = postesSaisis(s, { adhocImporte: false, monga: true });
      expect(p.filter((x) => x.famille === 'vente').map((x) => x.libelle)).toEqual(['Rémunérations associés', 'Salaires chargés', 'Autres']);
      expect(p.filter((x) => x.poste === 'remunerations').map((x) => x.famille)).toEqual(['vente']);
    }
  });
});

describe('les montants : sans TVA, dans le sous-total vente et tous les totaux', () => {
  it('HT = TTC (aucune TVA) ; plusieurs lignes d’une structure s’additionnent', () => {
    expect(montantSaisi(E.saisis!, { famille: 'vente', poste: 'remunerations', ms: [{ annee: 2026, mois: 9 }], societe: 'criterimmo' })).toEqual({ htC: 450050, ttcC: 450050 });
  });
  it('le sous-total vente et le total du mois les comptent ; FUSION = CRITERIMMO + MACJ ; l’année aussi', () => {
    const sans = { ...E, saisis: E_COUTS.saisis };
    for (const s of ['criterimmo', 'macj', 'tous'] as const) {
      const avec = coutsDuPoint(E, s, 2026, 9); const ref = coutsDuPoint(sans, s, 2026, 9);
      const attendu = s === 'criterimmo' ? 450050 : s === 'macj' ? 200000 : 650050;
      expect(avec.vente.remunerations).toEqual({ htC: attendu, ttcC: attendu });
      expect(avec.vente.total.htC - ref.vente.total.htC).toBe(attendu);
      expect(avec.total.htC - ref.total.htC).toBe(attendu);
      expect(avec.total.ttcC - ref.total.ttcC).toBe(attendu); // sans TVA
    }
    expect(coutsDuPoint(E, 'tous', 2026, null).total.htC - coutsDuPoint({ ...E, saisis: E_COUTS.saisis }, 'tous', 2026, null).total.htC).toBe(650050);
  });
  it('« Coûts globaux » du Suivi CA (une seule comptabilité) : la même somme dans le total ; rien quand la lecture les a retirées (compte sans « Les coûts »)', () => {
    const c = coutsGlobaux(E, 2026, 9, true);
    expect(c.saisis.venteRemunerations).toEqual({ htC: 650050, ttcC: 650050 });
    expect(c.total.htC - coutsGlobaux({ ...E, saisis: E_COUTS.saisis }, 2026, 9, true).total.htC).toBe(650050);
    const filtre = coutsGlobaux({ ...E, saisis: sansRemunerations(E.saisis!) }, 2026, 9, true);
    expect(filtre.saisis.venteRemunerations).toEqual({ htC: 0, ttcC: 0 });
    expect(filtre.total).toEqual(coutsGlobaux({ ...E, saisis: E_COUTS.saisis }, 2026, 9, true).total);
  });
});

describe('la saisie : le geste accepté par la route', () => {
  const base = { action: 'ligne-ajouter', ligne: { societe: 'macj', famille: 'vente', poste: 'remunerations', annee: 2026, mois: 10, compteId: 2, montantHt: 2500 } };
  it('une ligne : vente, un associé, sans TVA', () => {
    expect(lireGesteCout(base)).toEqual({ ok: true, geste: { action: 'ligne-ajouter', ligne: { societe: 'macj', famille: 'vente', poste: 'remunerations', annee: 2026, mois: 10,
      compteId: 2, libelle: null, montantHt: 2500, tva: false } } });
  });
  it('refusés : en location ou en gestion, sans associé, avec TVA', () => {
    for (const x of [{ famille: 'location', societe: 'criterimmo' }, { famille: 'gestion', societe: 'criterimmo' }, { compteId: undefined }, { tva: true }])
      expect(lireGesteCout({ ...base, ligne: { ...base.ligne, ...x } }).ok).toBe(false);
  });
  it('la case ✓ du poste (famille vente)', () => {
    expect(lireGesteCout({ action: 'valider', validation: { societe: 'criterimmo', famille: 'vente', poste: 'remunerations', annee: 2026, mois: 10 }, valide: true }).ok).toBe(true);
    expect(lireGesteCout({ action: 'valider', validation: { societe: 'criterimmo', famille: 'location', poste: 'remunerations', annee: 2026, mois: 10 }, valide: true }).ok).toBe(false);
  });
});

describe('le récapitulatif', () => {
  const t = (agence: 'criterimmo' | 'macj' | 'tous') => tableauRecap({ e: E, agence, mois: moisDeLaFenetre('annee', '2026-11-13'), jour: '2026-11-13', validations: [],
    versionsGestion: {}, monga: true, caGestion: true });
  it('la ligne au-dessus des salaires ; un clic ouvre la saisie du mois ; à compléter tant que non cochée ; FUSION en lecture (la somme)', () => {
    const c = t('criterimmo');
    const cles = c.lignes.map((l) => l.cle);
    expect(cles.indexOf('vente-remunerations')).toBe(cles.indexOf('vente-salaires') - 1);
    const l = c.lignes.find((x) => x.cle === 'vente-remunerations')!;
    expect([l.cellules[8].m, l.cellules[8].modifiable, l.cellules[8].etat]).toEqual([{ htC: 450050, ttcC: 450050 }, 'saisie-du-mois', 'a-completer']);
    expect(t('macj').lignes.find((x) => x.cle === 'vente-remunerations')!.cellules[8].m.htC).toBe(200000);
    const f = t('tous').lignes.find((x) => x.cle === 'vente-remunerations')!;
    expect([f.cellules[8].m.htC, f.cellules[8].modifiable]).toEqual([650050, 'non']);
  });
});
