import { describe, expect, it } from 'vitest';
import { aCaGestion, caGestionDuMoisC, celluleGlobal, multiplicateurTva, TVA, type GestionMois } from '../transaction/modele';
import { honorairesTtcC, moisGestion, totauxGestion, centimesGestion } from '../transaction/gestionVue';
import { celluleGlobalEn } from '../transaction/globalUnite';
import { caGestionDuPoint, lireGesteCout } from './couts';
import { alertesSaisie, completudeCa, lireAlertesSaisie, motRappelCa, postesCaGestion, type Validation } from './saisieMois';

/**
 * 🔴🔴 MON ESPACE « COÛTS ET CA » (Arno, 13/11/2026, migration 471) — LE CA DE GESTION SAISI PAR LES ASSOCIÉS (règles pures).
 *   · CA global de gestion = honoraires de gestion + honoraires GLI, chacun HT avec son taux de TVA (20 % par défaut) ;
 *   · UNE SEULE COMPTABILITÉ : la même ligne du mois que le Suivi CA › Gestion, la même fonction pour le CA global (HT et TTC) et Mon espace ;
 *   · CRITERIMMO seulement (MACJ ne fait pas de gestion ; FUSION = CRITERIMMO) ; complétude par case ✓ (0 € coché compris) ;
 *   · l'indicateur unifié : « Coûts d'octobre à saisir », « CA gestion d'octobre à saisir », ou les deux.
 */
const g = (id: number, annee: number, mois: number, x: Partial<GestionMois> = {}): GestionMois => ({ id, annee, mois, nbLots: null, honorairesHt: null, adhocHt: null,
  mongaHt: null, salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...x });
const OCT: { annee: number; mois: number } = { annee: 2026, mois: 10 };
const JOUR = '2026-11-13';

describe('le CA global de gestion d’un mois : honoraires + GLI, chacun à son taux', () => {
  it('honoraires 1 000 € à 20 % + GLI 250,50 € à 10 % : HT 1 250,50 € ; TTC 1 200 + 275,55 = 1 475,55 €', () => {
    expect(caGestionDuMoisC({ honorairesHt: 1000, gliHt: 250.5, honorairesTvaTaux: 20, gliTvaTaux: 10 }))
      .toEqual({ honorairesC: 100000, honorairesTtcC: 120000, gliC: 25050, gliTtcC: 27555, totalC: 125050, totalTtcC: 147555 });
  });
  it('sans GLI ni taux saisi : exactement le calcul de toujours (honoraires × 1,20), au centime — l’historique ne bouge pas', () => {
    for (const ht of [16184.63, 0.01, 22725, 1618.47]) {
      const c = caGestionDuMoisC({ honorairesHt: ht });
      expect([c.totalC, c.totalTtcC]).toEqual([Math.round(ht * 100), honorairesTtcC(Math.round(ht * 100))]);
    }
    expect([multiplicateurTva(null), multiplicateurTva(undefined), multiplicateurTva(20), multiplicateurTva(0)]).toEqual([TVA, TVA, 1.2, 1]);
    expect(caGestionDuMoisC(null)).toEqual({ honorairesC: 0, honorairesTtcC: 0, gliC: 0, gliTtcC: 0, totalC: 0, totalTtcC: 0 });
  });
  it('un mois avec la GLI seule a un CA de gestion ; un mois vide n’en a pas', () => {
    expect([aCaGestion({ honorairesHt: null, gliHt: 10 }), aCaGestion({ honorairesHt: 5 }), aCaGestion({ honorairesHt: null, gliHt: null })]).toEqual([true, true, false]);
  });
});

describe('UNE SEULE COMPTABILITÉ : le CA saisi se propage partout où le CA de gestion est compté', () => {
  const gestion = [g(1, 2026, 10, { honorairesHt: 1000, gliHt: 250.5, gliTvaTaux: 10, adhocHt: 100 }), g(2, 2026, 9, { honorairesHt: 2000 })];
  it('le mois du Suivi CA › Gestion : `honorairesC` = le CA global (le CA net le compte) ; ses deux parts à part ; les totaux aussi', () => {
    const m = moisGestion(gestion, 2026, 10);
    expect([m.honorairesC, m.honorairesGestionC, m.gliC, m.netC, m.honorairesTtcC]).toEqual([125050, 100000, 25050, 125050 - 10000 - 0, 147555]);
    const t = totauxGestion(gestion, [OCT, { annee: 2026, mois: 9 }]);
    expect([centimesGestion(t, 'honoraires'), centimesGestion(t, 'honoraires_gestion'), centimesGestion(t, 'gli'), centimesGestion(t, 'gli', 'ttc')]).toEqual([325050, 300000, 25050, 27555]);
  });
  it('le CA global (HT et TTC) : la gestion d’octobre = honoraires + GLI ; celle de septembre, inchangée', () => {
    const e = { ventes: [], location: null, gestion };
    expect([celluleGlobal(e, 2026, 10).gestionHt, celluleGlobal(e, 2026, 9).gestionHt, celluleGlobal(e, 2026, null).gestionHt]).toEqual([1250.5, 2000, 3250.5]);
    expect(celluleGlobalEn(e, 2026, 10, 'ttc').gestionHt).toBeCloseTo(1475.55, 10);
    expect(celluleGlobalEn(e, 2026, 9, 'ttc').gestionHt).toBeCloseTo(2400, 10);
  });
  it('Mon espace : CRITERIMMO et FUSION lisent le même CA ; MACJ n’en a pas (null) ; HT et TTC', () => {
    const c = caGestionDuPoint(gestion, 'criterimmo', 2026, 10)!;
    expect(c).toEqual({ honoraires: { htC: 100000, ttcC: 120000 }, gli: { htC: 25050, ttcC: 27555 }, total: { htC: 125050, ttcC: 147555 } });
    expect(caGestionDuPoint(gestion, 'tous', 2026, 10)).toEqual(c);
    expect(caGestionDuPoint(gestion, 'macj', 2026, 10)).toBeNull();
    expect(caGestionDuPoint(gestion, 'criterimmo', 2026, null)!.total).toEqual({ htC: 325050, ttcC: 387555 });
  });
});

describe('la partie « CA gestion » : CRITERIMMO seulement ; complète quand chaque ligne est cochée ✓ (0 € compris)', () => {
  const v = (poste: 'honoraires' | 'gli'): Validation => ({ societe: 'criterimmo', famille: 'gestion', poste, ...OCT });
  it('MACJ : aucune ligne, pas de partie (null) ; CRITERIMMO : honoraires + GLI ; honoraires repris d’un import : la GLI seule', () => {
    expect(postesCaGestion('macj', { honorairesImportes: false })).toEqual([]);
    expect(completudeCa([], [], 'macj', OCT).complet).toBeNull();
    expect(postesCaGestion('criterimmo', { honorairesImportes: false }).map((p) => p.poste)).toEqual(['honoraires', 'gli']);
    expect(postesCaGestion('criterimmo', { honorairesImportes: true }).map((p) => p.poste)).toEqual(['gli']);
  });
  it('une ligne cochée sur deux : à compléter ; les deux (même à 0 €, coché volontairement) : complète ; un autre mois ne compte pas', () => {
    const p = postesCaGestion('criterimmo', { honorairesImportes: false });
    expect(completudeCa(p, [v('gli')], 'criterimmo', OCT).complet).toBe(false);
    expect(completudeCa(p, [v('gli'), v('honoraires')], 'criterimmo', OCT).complet).toBe(true);
    expect(completudeCa(p, [{ ...v('gli'), mois: 9 }, { ...v('honoraires'), mois: 9 }], 'criterimmo', OCT).complet).toBe(false);
  });
});

describe('l’indicateur unifié de l’accueil (le mois contrôlé : le mois écoulé, comme le rappel d’avant)', () => {
  const o = { adhocImporte: false, monga: true, ca: true, honorairesImportes: false };
  const coutsCriterimmo: Validation[] = (['vente-remunerations', 'vente-salaires', 'vente-autres', 'location-salaires', 'location-autres', 'gestion-salaires', 'gestion-adhoc', 'gestion-monga', 'gestion-autres'] as const)
    .map((x) => ({ societe: 'criterimmo', famille: x.split('-')[0] as Validation['famille'], poste: x.split('-')[1] as Validation['poste'], ...OCT }));
  const caOk: Validation[] = [{ societe: 'criterimmo', famille: 'gestion', poste: 'honoraires', ...OCT }, { societe: 'criterimmo', famille: 'gestion', poste: 'gli', ...OCT }];
  it('rien de saisi : les deux libellés précis ; coûts complets : le CA seul ; CA complet : les coûts seuls ; tout complet : rien', () => {
    expect(alertesSaisie(['criterimmo'], [], JOUR, o).map((a) => a.mot)).toEqual(['Coûts d’octobre à saisir', 'CA gestion d’octobre à saisir']);
    expect(alertesSaisie(['criterimmo'], coutsCriterimmo, JOUR, o).map((a) => [a.partie, a.societe])).toEqual([['ca', 'criterimmo']]);
    expect(alertesSaisie(['criterimmo'], caOk, JOUR, o).map((a) => a.partie)).toEqual(['couts']);
    expect(alertesSaisie(['criterimmo'], [...coutsCriterimmo, ...caOk], JOUR, o)).toEqual([]);
  });
  it('MACJ seul : jamais d’alerte CA ; FUSION (les deux) : les coûts de la première structure à compléter, le CA de CRITERIMMO ; sans la 471 : pas de CA', () => {
    expect(alertesSaisie(['macj'], [], JOUR, o).map((a) => a.partie)).toEqual(['couts']);
    expect(alertesSaisie(['criterimmo', 'macj'], coutsCriterimmo, JOUR, o).map((a) => [a.partie, a.societe])).toEqual([['couts', 'macj'], ['ca', 'criterimmo']]);
    expect(alertesSaisie(['criterimmo'], coutsCriterimmo, JOUR, { ...o, ca: false })).toEqual([]);
    expect(alertesSaisie(['criterimmo'], [], JOUR, o)[1].mois).toEqual(OCT);
    expect([motRappelCa({ annee: 2026, mois: 4 }), motRappelCa({ annee: 2026, mois: 5 })]).toEqual(['CA gestion d’avril à saisir', 'CA gestion de mai à saisir']);
  });
  it('la réponse de la route est vérifiée : une alerte mal formée est écartée, jamais une erreur', () => {
    expect(lireAlertesSaisie([{ partie: 'ca', societe: 'criterimmo', mois: OCT, mot: 'CA gestion d’octobre à saisir' }, { partie: 'autre' }, null, 3])).toHaveLength(1);
    expect([lireAlertesSaisie(undefined), lireAlertesSaisie({})]).toEqual([[], []]);
  });
});

describe('la saisie du CA (le geste que la route accepte)', () => {
  const base = { action: 'ca-gestion', annee: 2026, mois: 10, poste: 'honoraires', montantHt: 1200.5, tauxTva: 20, version: 3 };
  it('accepté : honoraires ou GLI, montant HT (ou vide), taux en % ; refusés : autre poste, taux hors 0–100, montant invalide, sans version', () => {
    expect(lireGesteCout(base)).toEqual({ ok: true, geste: base });
    expect(lireGesteCout({ ...base, poste: 'gli', montantHt: null, tauxTva: 5.5 }).ok).toBe(true);
    for (const x of [{ poste: 'adhoc' }, { tauxTva: 101 }, { tauxTva: -1 }, { tauxTva: '20' }, { montantHt: -3 }, { montantHt: 1.234 }, { version: undefined }, { mois: 13 }])
      expect(lireGesteCout({ ...base, ...x }).ok).toBe(false);
  });
  it('la validation ✓ d’une ligne du CA : à CRITERIMMO, famille gestion ; MACJ refusée', () => {
    const val = (societe: string) => lireGesteCout({ action: 'valider', validation: { societe, famille: 'gestion', poste: 'gli', annee: 2026, mois: 10 }, valide: true });
    expect([val('criterimmo').ok, val('macj').ok]).toEqual([true, false]);
  });
});
