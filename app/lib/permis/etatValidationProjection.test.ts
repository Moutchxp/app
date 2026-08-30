import { describe, it, expect } from 'vitest';
import { etatValidationProjection, INVITE_DEPLIER_BATIMENTS } from './etatValidationProjection';
import type { VerdictProjection } from './projectionBatiments';

const verdict = (over: Partial<VerdictProjection> = {}): VerdictProjection =>
  ({ peutValider: true, aucunBatiment: false, libelle: '2 bâtiments — projection prête', ...over } as VerdictProjection);

describe('PERF-1 — etatValidationProjection (gating du bouton Valider, pur)', () => {
  it('bloc bâtiments jamais déplié → non validable + invite à déplier (jamais « chargement… » indéfini)', () => {
    expect(etatValidationProjection(false, null)).toEqual({ peutValider: false, aucunBatiment: false, libelle: INVITE_DEPLIER_BATIMENTS });
  });

  it('même déplié n’écrase pas un verdict déjà connu par l’invite', () => {
    expect(etatValidationProjection(false, verdict())).toMatchObject({ peutValider: false, libelle: INVITE_DEPLIER_BATIMENTS });
  });

  it('déplié sans verdict encore chargé → « chargement des bâtiments… », non validable', () => {
    expect(etatValidationProjection(true, null)).toEqual({ peutValider: false, aucunBatiment: false, libelle: 'chargement des bâtiments…' });
  });

  it('déplié avec verdict → comportement identique à avant (le verdict pilote le bouton)', () => {
    expect(etatValidationProjection(true, verdict())).toEqual({ peutValider: true, aucunBatiment: false, libelle: '2 bâtiments — projection prête' });
    expect(etatValidationProjection(true, verdict({ peutValider: false, aucunBatiment: true, libelle: '0 bâtiment' }))).toMatchObject({ peutValider: false, aucunBatiment: true });
  });
});
