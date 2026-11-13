import { describe, expect, it } from 'vitest';
import { E_COUTS } from './__fixtures__/couts';
import { caGestionDuPoint, coutsDuPoint } from './couts';
import { libelleFenetre, lienRecap, lienSaisieDuMois, lienSuiviCaGestion, moisDeLaFenetre, moisRevolu, tableauRecap, type EntreesRecap } from './recap';
import type { Validation } from './saisieMois';
import { moisGestion } from '../transaction/gestionVue';
import type { EntreesCoutsGlobaux } from '../transaction/coutsGlobal';
import type { GestionMois } from '../transaction/modele';

/**
 * 🔴🔴 « COÛTS ET CA » — LE TABLEAU RÉCAPITULATIF (Arno, 13/11/2026), règles pures : la fenêtre (année en cours / 12 mois glissants, ‹ ›), les
 * montants = ceux de « Coûts et CA » et du Suivi CA (aucun calcul propre : une seule comptabilité), les sous-totaux et totaux, l'état des cellules,
 * la lecture seule (totaux, CA global, imports, FUSION), MACJ sans CA gestion.
 */
const JOUR = '2026-11-13';
const g = (annee: number, mois: number, x: Partial<GestionMois> = {}): GestionMois => ({ id: annee * 100 + mois, annee, mois, nbLots: null, honorairesHt: 1000, adhocHt: 200,
  mongaHt: 50, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...x });
const E: EntreesCoutsGlobaux = { ...E_COUTS, gestion: [g(2026, 9, { origine: 'import', honorairesHt: 18000 }), g(2026, 10, { gliHt: 300, gliTvaTaux: 10 })] };
const entrees = (x: Partial<EntreesRecap> = {}): EntreesRecap => ({ e: E, agence: 'criterimmo', mois: moisDeLaFenetre('annee', JOUR), jour: JOUR, validations: [],
  versionsGestion: { '2026-09': { version: 3, origine: 'import' }, '2026-10': { version: 9, origine: 'saisie' } }, monga: true, caGestion: true, ...x });
const ligne = (t: ReturnType<typeof tableauRecap>, cle: string) => t.lignes.find((l) => l.cle === cle)!;
const i = (mois: number) => mois - 1; // fenêtre janv.–déc. 2026

describe('la période : année en cours (par défaut) ou 12 derniers mois glissants ; ‹ › d’un cran', () => {
  it('année : janv.–déc. 2026 ; ‹ : 2025 ; › : 2027', () => {
    expect(moisDeLaFenetre('annee', JOUR).map((m) => `${m.annee}-${m.mois}`)).toEqual(Array.from({ length: 12 }, (_, k) => `2026-${k + 1}`));
    expect(moisDeLaFenetre('annee', JOUR, -1)[0]).toEqual({ annee: 2025, mois: 1 });
    expect(moisDeLaFenetre('annee', JOUR, 1)[11]).toEqual({ annee: 2027, mois: 12 });
    expect(libelleFenetre('annee', moisDeLaFenetre('annee', JOUR))).toBe('Année 2026 (janv.–déc.)');
  });
  it('glissant : les 12 mois qui finissent au dernier mois écoulé (nov. 2025 → oct. 2026) ; ‹ › décalent d’un mois, à cheval sur les années', () => {
    const f = moisDeLaFenetre('glissant', JOUR);
    expect([f[0], f[11], f.length]).toEqual([{ annee: 2025, mois: 11 }, { annee: 2026, mois: 10 }, 12]);
    expect([moisDeLaFenetre('glissant', JOUR, -1)[0], moisDeLaFenetre('glissant', JOUR, -1)[11]]).toEqual([{ annee: 2025, mois: 10 }, { annee: 2026, mois: 9 }]);
    expect(moisDeLaFenetre('glissant', '2026-01-05')[11]).toEqual({ annee: 2025, mois: 12 });
    expect(libelleFenetre('glissant', f)).toBe('12 derniers mois (nov. 2025 – oct. 2026)');
  });
});

describe('les montants : ceux de « Coûts et CA » et du Suivi CA, au centime ; sous-totaux, total des coûts, total de ligne', () => {
  const t = tableauRecap(entrees());
  it('chaque cellule = `coutsDuPoint` / `caGestionDuPoint` du mois (une seule comptabilité) ; le CA d’octobre = le CA de la page Gestion du Suivi CA', () => {
    for (const mois of [1, 9, 10]) {
      const p = coutsDuPoint(E, 'criterimmo', 2026, mois); const ca = caGestionDuPoint(E.gestion, 'criterimmo', 2026, mois)!;
      expect([ligne(t, 'vente-total').cellules[i(mois)].m, ligne(t, 'location-total').cellules[i(mois)].m, ligne(t, 'gestion-adhoc').cellules[i(mois)].m, ligne(t, 'couts-total').cellules[i(mois)].m])
        .toEqual([p.vente.total, p.location!.total, p.gestion!.adhoc, p.total]);
      expect([ligne(t, 'ca-honoraires').cellules[i(mois)].m, ligne(t, 'ca-gli').cellules[i(mois)].m, ligne(t, 'ca-total').cellules[i(mois)].m]).toEqual([ca.honoraires, ca.gli, ca.total]);
    }
    expect(ligne(t, 'ca-total').cellules[i(10)].m.htC).toBe(moisGestion(E.gestion, 2026, 10).honorairesC); // 1 000 + 300 = 1 300 €
    expect(ligne(t, 'ca-total').cellules[i(10)].m).toEqual({ htC: 130000, ttcC: 120000 + 33000 });
  });
  it('le sous-total d’une famille = la somme de ses postes comptés (hors « pour information ») ; le total des coûts = la somme des sous-totaux', () => {
    for (const k of [i(9), i(10)]) {
      const s = (cles: string[]) => cles.reduce((x, c) => x + ligne(t, c).cellules[k].m.htC, 0);
      expect(s(['gestion-salaires', 'gestion-adhoc', 'gestion-monga', 'gestion-autres'])).toBe(ligne(t, 'gestion-total').cellules[k].m.htC);
      expect(s(['vente-commissions', 'vente-apporteurs', 'vente-exterieures', 'vente-salaires', 'vente-autres'])).toBe(ligne(t, 'vente-total').cellules[k].m.htC);
      expect(s(['vente-total', 'location-total', 'gestion-total'])).toBe(ligne(t, 'couts-total').cellules[k].m.htC);
    }
  });
  it('la colonne Total = la somme des 12 mois affichés (HT et TTC)', () => {
    for (const l of t.lignes) expect(l.total).toEqual(l.cellules.reduce((x, c) => ({ htC: x.htC + c.m.htC, ttcC: x.ttcC + c.m.ttcC }), { htC: 0, ttcC: 0 }));
    expect(ligne(t, 'ca-honoraires').total.htC).toBe(1800000 + 100000);
  });
});

describe('l’état des cellules et la modification', () => {
  const v = (famille: Validation['famille'], poste: Validation['poste'], mois: number): Validation => ({ societe: 'criterimmo', famille, poste, annee: 2026, mois });
  it('mois écoulé : coché → complet, sinon à compléter ; le mois en cours et les suivants : neutres ; un mois incomplet est signalé', () => {
    const t = tableauRecap(entrees({ validations: [v('gestion', 'monga', 10), v('gestion', 'gli', 10)] }));
    expect([ligne(t, 'gestion-monga').cellules[i(10)].etat, ligne(t, 'ca-gli').cellules[i(10)].etat, ligne(t, 'gestion-adhoc').cellules[i(10)].etat]).toEqual(['complet', 'complet', 'a-completer']);
    expect([ligne(t, 'gestion-adhoc').cellules[i(11)].etat, ligne(t, 'gestion-adhoc').cellules[i(12)].etat, ligne(t, 'vente-commissions').cellules[i(10)].etat]).toEqual(['neutre', 'neutre', 'neutre']);
    expect([t.moisIncomplets[i(10)], t.moisIncomplets[i(11)]]).toEqual([true, false]);
    expect([moisRevolu({ annee: 2026, mois: 10 }, JOUR), moisRevolu({ annee: 2026, mois: 11 }, JOUR)]).toEqual([true, false]);
  });
  it('sur place : ADHOC, MONGA, honoraires, GLI ; salaires et « Autres » : la saisie du mois ; jamais : totaux, CA global, postes calculés', () => {
    const t = tableauRecap(entrees());
    expect(['gestion-adhoc', 'gestion-monga', 'ca-honoraires', 'ca-gli'].map((c) => ligne(t, c).cellules[i(10)].modifiable)).toEqual(['sur-place', 'sur-place', 'sur-place', 'sur-place']);
    expect(['vente-salaires', 'location-autres', 'gestion-salaires'].map((c) => ligne(t, c).cellules[i(10)].modifiable)).toEqual(['saisie-du-mois', 'saisie-du-mois', 'saisie-du-mois']);
    expect(['vente-total', 'couts-total', 'ca-total', 'vente-commissions', 'location-primes'].map((c) => ligne(t, c).cellules[i(10)].modifiable)).toEqual(['non', 'non', 'non', 'non', 'non']);
  });
  it('🔴 un mois repris d’un import (septembre 2026) : honoraires et ADHOC en LECTURE (« corriger dans Suivi CA › Gestion ») ; la GLI y reste modifiable', () => {
    const t = tableauRecap(entrees());
    expect([ligne(t, 'ca-honoraires').cellules[i(9)].modifiable, ligne(t, 'gestion-adhoc').cellules[i(9)].modifiable, ligne(t, 'ca-gli').cellules[i(9)].modifiable]).toEqual(['importe', 'importe', 'sur-place']);
    expect(lienSuiviCaGestion({ annee: 2026, mois: 9 })).toBe('/admin/transaction/gestion?vue=mois&annee=2026&mois=9');
  });
  it('FUSION se lit (rien de modifiable) ; MACJ : la vente seule, aucune section CA gestion', () => {
    const f = tableauRecap(entrees({ agence: 'tous' }));
    expect(f.lignes.flatMap((l) => l.cellules).every((c) => c.modifiable === 'non' || c.modifiable === 'importe')).toBe(true);
    expect(f.lignes.some((l) => l.section === 'ca')).toBe(true); // FUSION = le CA de CRITERIMMO
    const m = tableauRecap(entrees({ agence: 'macj' }));
    expect(m.lignes.some((l) => l.section === 'ca' || l.famille === 'location' || l.famille === 'gestion')).toBe(false);
    expect(m.lignes.map((l) => l.cle)).toEqual(['vente-commissions', 'vente-apporteurs', 'vente-exterieures', 'vente-salaires', 'vente-autres', 'vente-total', 'couts-total']);
  });
  it('les adresses : la saisie du mois (structure, mois, partie) ; le récapitulatif suit « Voir »', () => {
    expect(lienSaisieDuMois('criterimmo', { annee: 2026, mois: 3 }, 'couts')).toBe('/admin/mon-espace?espace=criterimmo&onglet=couts&saisie=2026-03&partie=couts');
    expect(lienRecap('macj')).toBe('/admin/mon-espace/recapitulatif?agence=macj');
  });
});
