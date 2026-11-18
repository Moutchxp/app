import { describe, expect, it } from 'vitest';
import { cleEnsemble, decisionMandat, phraseAConfirmer, signalementPartage } from './mandatParBien';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien ») — « Un même n° peut couvrir plusieurs biens UNIQUEMENT s'ils appartiennent au même propriétaire […] s'il est
 * déjà utilisé par un AUTRE propriétaire → refus avec message clair, sans exception » ; « « Même propriétaire » = EXACTEMENT le même ensemble de
 * propriétaires ; M. Martin seul ≠ M. et Mme Martin → refus » ; « on signale qu'un n° partagé ne couvre plus le même propriétaire, sans bloquer ».
 */
const MARTIN = 11; const MME_MARTIN = 12; const DURAND = 20;
const BIEN_MARTIN = { lotId: 1, adresse: '4 rue _TEST MANDAT, 92600 Asnières-sur-Seine', proprietaires: [MARTIN] };
const BIEN_COUPLE = { lotId: 2, adresse: '6 rue _TEST MANDAT, 92600 Asnières-sur-Seine', proprietaires: [MME_MARTIN, MARTIN] };

describe('🔴 le n° partagé', () => {
  it('un n° neuf : libre', () => {
    expect(decisionMandat('gestion', 'MG 41', [MARTIN], [], false)).toEqual({ etat: 'libre' });
  });
  it('déjà sur un bien du MÊME propriétaire : la fenêtre « L’utiliser aussi pour ce bien ? » ; confirmé : accepté', () => {
    expect(decisionMandat('gestion', 'MG 41', [MARTIN], [BIEN_MARTIN], false)).toEqual({ etat: 'a_confirmer', adresses: [BIEN_MARTIN.adresse],
      motif: 'Le mandat n° MG 41 est déjà utilisé pour 4 rue _TEST MANDAT, 92600 Asnières-sur-Seine de ce propriétaire. L’utiliser aussi pour ce bien ?' });
    expect(decisionMandat('gestion', 'MG 41', [MARTIN], [BIEN_MARTIN], true)).toEqual({ etat: 'meme_proprietaire_confirme' });
  });
  it('🔴 un AUTRE propriétaire : refus absolu, même confirmé', () => {
    for (const confirme of [false, true]) {
      expect(decisionMandat('gestion', 'MG 41', [DURAND], [BIEN_MARTIN], confirme)).toEqual({ etat: 'refus',
        motif: 'Le mandat n° MG 41 est déjà utilisé pour 4 rue _TEST MANDAT, 92600 Asnières-sur-Seine d’un autre propriétaire : un même n° ne couvre que les biens d’un même propriétaire (exactement les mêmes propriétaires). Rien n’est enregistré.' });
    }
  });
  it('🔴 EXACTEMENT le même ensemble : M. Martin seul ≠ M. et Mme Martin (dans les deux sens) ; l’ordre ne compte pas', () => {
    expect(decisionMandat('gestion', 'MG 41', [MARTIN, MME_MARTIN], [BIEN_MARTIN], true).etat).toBe('refus');
    expect(decisionMandat('gestion', 'MG 41', [MARTIN], [BIEN_COUPLE], true).etat).toBe('refus');
    expect(decisionMandat('gestion', 'MG 41', [MARTIN, MME_MARTIN], [BIEN_COUPLE], false).etat).toBe('a_confirmer');
    expect(cleEnsemble([12, 11, 11])).toBe('11,12');
  });
  it('un même propriétaire ET un autre : refus (l’autre l’emporte)', () => {
    expect(decisionMandat('gestion', 'MG 41', [MARTIN], [BIEN_MARTIN, { lotId: 3, adresse: '8 rue _TEST MANDAT', proprietaires: [DURAND] }], true))
      .toMatchObject({ etat: 'refus', motif: expect.stringContaining('8 rue _TEST MANDAT d’un autre propriétaire') });
  });
  it('le mandat de transaction : la même règle, sa phrase', () => {
    expect(phraseAConfirmer('transaction', 'MT 7', ['A', 'B'])).toBe('Le mandat de transaction locative n° MT 7 est déjà utilisé pour A et B de ce propriétaire. L’utiliser aussi pour ce bien ?');
    expect(decisionMandat('transaction', 'MT 7', [DURAND], [BIEN_MARTIN], true).etat).toBe('refus');
  });
  it('🔴 le signalement : les propriétaires d’un bien ont changé depuis — jamais un refus', () => {
    expect(signalementPartage('gestion', 'MG 41', [MARTIN, MME_MARTIN], [BIEN_MARTIN])).toBe(
      'Mandat de gestion n° MG 41 : il est aussi celui de 4 rue _TEST MANDAT, 92600 Asnières-sur-Seine, dont les propriétaires ne sont plus exactement les mêmes — ce n° partagé ne couvre plus le même propriétaire.');
    expect(signalementPartage('gestion', 'MG 41', [MARTIN], [BIEN_MARTIN])).toBeNull();
    expect(signalementPartage('gestion', 'MG 41', [MARTIN], [])).toBeNull();
  });
});
