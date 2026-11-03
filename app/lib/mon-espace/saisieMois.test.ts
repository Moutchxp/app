import { describe, expect, it } from 'vitest';
import { completude, libelleMois, moisProposes, motRappel, postesSaisis, rappelMois, type Validation } from './saisieMois';

/**
 * 🔴 « LES COÛTS », LOT 3 (Arno, 03/11/2026) — « Saisir les coûts du mois » : C16 (le mois précédent par défaut, les 6 derniers mois révolus,
 * janvier → décembre de l'année d'avant), les postes saisis d'une structure (C7), « complet » = validé explicitement (0 compris), le rappel (C17).
 */
const O = { adhocImporte: false, monga: true };
const v = (societe: 'criterimmo' | 'macj', famille: 'vente' | 'location' | 'gestion', poste: 'salaires' | 'autres' | 'adhoc' | 'monga', annee = 2026, mois = 10): Validation =>
  ({ societe, famille, poste, annee, mois });

describe('🔴 C16 — le mois proposé et le sélecteur', () => {
  it('au 03/11/2026 : octobre 2026 d’abord, puis les 5 mois d’avant (mai → octobre) ; 6 en tout', () => {
    expect(moisProposes('2026-11-03').map(libelleMois)).toEqual(['Octobre 2026', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026', 'Mai 2026']);
  });
  it('en janvier : décembre de l’année précédente ; le 1er du mois comme le dernier jour', () => {
    expect(moisProposes('2027-01-15')[0]).toEqual({ annee: 2026, mois: 12 });
    expect(moisProposes('2027-01-01')[0]).toEqual({ annee: 2026, mois: 12 });
    expect(moisProposes('2027-03-31').map((m) => `${m.annee}-${m.mois}`)).toEqual(['2027-2', '2027-1', '2026-12', '2026-11', '2026-10', '2026-9']);
  });
  it('le rappel dit le mois : « Coûts d’octobre à saisir », « Coûts de mai à saisir »', () => {
    expect(motRappel({ annee: 2026, mois: 10 })).toBe('Coûts d’octobre à saisir');
    expect(motRappel({ annee: 2026, mois: 5 })).toBe('Coûts de mai à saisir');
    expect(motRappel({ annee: 2026, mois: 8 })).toBe('Coûts d’août à saisir');
  });
});

describe('🔴 les postes saisis d’une structure (C7)', () => {
  it('MACJ : la vente seule (salaires, autres)', () => {
    expect(postesSaisis('macj', O).map((p) => `${p.famille}-${p.poste}`)).toEqual(['vente-salaires', 'vente-autres']);
  });
  it('CRITERIMMO : vente, location, gestion (ADHOC, MONGA) ; ADHOC repris d’un import ou MONGA sans la 446 : pas à saisir ici', () => {
    expect(postesSaisis('criterimmo', O).map((p) => `${p.famille}-${p.poste}`)).toEqual(['vente-salaires', 'vente-autres', 'location-salaires', 'location-autres',
      'gestion-salaires', 'gestion-adhoc', 'gestion-monga', 'gestion-autres']);
    expect(postesSaisis('criterimmo', { adhocImporte: true, monga: false }).map((p) => p.poste)).not.toContain('adhoc');
    expect(postesSaisis('criterimmo', { adhocImporte: true, monga: false }).map((p) => p.poste)).not.toContain('monga');
  });
});

describe('🔴 « complet / à compléter » : validé explicitement, par poste, par bloc, en tout', () => {
  it('MACJ octobre : rien de validé → à compléter ; les deux postes → complet ; la validation d’un autre mois ou d’une autre structure ne compte pas', () => {
    const p = postesSaisis('macj', O);
    expect(completude(p, [], 'macj', { annee: 2026, mois: 10 }).complet).toBe(false);
    expect(completude(p, [v('macj', 'vente', 'salaires'), v('macj', 'vente', 'autres')], 'macj', { annee: 2026, mois: 10 })).toMatchObject({ complet: true,
      familles: { vente: true, location: null, gestion: null } });
    expect(completude(p, [v('macj', 'vente', 'salaires', 2026, 9), v('criterimmo', 'vente', 'autres')], 'macj', { annee: 2026, mois: 10 }).complet).toBe(false);
  });
  it('CRITERIMMO : un bloc complet, un autre pas', () => {
    const c = completude(postesSaisis('criterimmo', O), [v('criterimmo', 'vente', 'salaires'), v('criterimmo', 'vente', 'autres')], 'criterimmo', { annee: 2026, mois: 10 });
    expect(c.familles).toEqual({ vente: true, location: false, gestion: false });
    expect(c.complet).toBe(false);
  });
});

describe('🔴 C17 — le rappel du mois précédent', () => {
  it('au 03/11/2026 : octobre à compléter → « Coûts d’octobre à saisir » ; tout validé → aucun rappel ; FUSION : les deux structures', () => {
    expect(rappelMois(['macj'], [], '2026-11-03', O)).toEqual({ mois: { annee: 2026, mois: 10 }, mot: 'Coûts d’octobre à saisir' });
    expect(rappelMois(['macj'], [v('macj', 'vente', 'salaires'), v('macj', 'vente', 'autres')], '2026-11-03', O)).toBeNull();
    expect(rappelMois(['criterimmo', 'macj'], [v('macj', 'vente', 'salaires'), v('macj', 'vente', 'autres')], '2026-11-03', O)).not.toBeNull();
  });
});
