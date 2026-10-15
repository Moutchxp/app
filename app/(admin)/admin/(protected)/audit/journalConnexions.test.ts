import { describe, it, expect } from 'vitest';
import { libelleResultat, dateParis, adresseCourte, identifiantAffiche } from './journalConnexions';

describe('affichage du journal des connexions (point 8)', () => {
  it('libellés des résultats', () => {
    expect(libelleResultat('succes')).toBe('Réussie');
    expect(libelleResultat('echec')).toBe('Échouée');
    expect(libelleResultat('bloque')).toBe('Bloquée (trop d’essais)');
  });

  it('date à l’heure de Paris (été : UTC+2)', () => {
    expect(dateParis('2026-10-15T08:04:12.000Z')).toBe('15/10/2026 10:04:12');
    expect(dateParis('pas une date')).toBe('pas une date');
  });

  it('empreinte d’adresse raccourcie à 8 caractères ; absente → tiret', () => {
    expect(adresseCourte('a'.repeat(64))).toBe('aaaaaaaa');
    expect(adresseCourte(null)).toBe('—');
  });

  it('identifiant vide affiché lisiblement', () => {
    expect(identifiantAffiche('')).toBe('(identifiant vide)');
    expect(identifiantAffiche('a@x.fr')).toBe('a@x.fr');
  });
});
