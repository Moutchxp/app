import { describe, expect, it } from 'vitest';
import { aUnEmail, rendezVousBloque } from './emailLocataireRequis';

/** 🔴🔴 Arno (11/11/2026) — la règle bloquante du rendez-vous (pré-visite, état des lieux de sortie). PUR. */
describe('un rendez-vous demande l’e-mail d’au moins un locataire', () => {
  it('aucun e-mail (ou aucun locataire) : bloqué ; un sur deux : permis ; une adresse mal formée ne compte pas', () => {
    expect(rendezVousBloque([{ emails: [] }, { emails: [] }])).toBe(true);
    expect(rendezVousBloque([])).toBe(true);
    expect(rendezVousBloque([{ emails: [] }, { emails: ['paul@exemple.test'] }])).toBe(false);
    expect(rendezVousBloque([{ emails: ['  ', 'pas-une-adresse', null] }])).toBe(true);
    expect(aUnEmail([' alice@exemple.test '])).toBe(true);
  });
});
