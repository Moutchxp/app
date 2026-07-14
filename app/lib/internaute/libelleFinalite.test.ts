import { describe, it, expect } from 'vitest';
import { libelleFinaliteAffichage } from './libelleFinalite';
import { FINALITES_SEED } from './consentement';

describe('libelleFinaliteAffichage — enrichissement d’AFFICHAGE (canal + code F), donnée base inchangée', () => {
  it('F1 (recontact_interne) → suffixe canal « appel téléphonique » + code F1', () => {
    expect(libelleFinaliteAffichage(FINALITES_SEED.recontactInterne, 'Recontact commercial interne')).toBe(
      'Recontact commercial interne (appel téléphonique) (F1)',
    );
  });
  it('F2 (email_marketing) → code F2 seul (aucun canal)', () => {
    expect(libelleFinaliteAffichage(FINALITES_SEED.emailMarketing, 'Communications par email')).toBe(
      'Communications par email (F2)',
    );
  });
  it('F3 (retargeting_tiers) → code F3 seul (aucun canal)', () => {
    expect(libelleFinaliteAffichage(FINALITES_SEED.retargetingTiers, 'Ciblage publicitaire tiers')).toBe(
      'Ciblage publicitaire tiers (F3)',
    );
  });
  it('clé inconnue (finalité future hors SEED) → libellé base tel quel (fallback sûr)', () => {
    expect(libelleFinaliteAffichage('finalite_future', 'Un libellé quelconque')).toBe('Un libellé quelconque');
  });
});
