import { describe, it, expect } from 'vitest';
import { estCarteModifiee, modeFooter } from './curationEdition';

describe('estCarteModifiee (borne d’ouverture vs mutations)', () => {
  it('ni créée ni mutée → non modifiée', () => {
    expect(estCarteModifiee(false, false)).toBe(false);
  });
  it('mutée depuis l’ouverture (max id > borne) → modifiée', () => {
    expect(estCarteModifiee(false, true)).toBe(true);
  });
  it('créée dans la session → modifiée même sans mutation ultérieure', () => {
    expect(estCarteModifiee(true, false)).toBe(true);
  });
  it('créée ET mutée → modifiée', () => {
    expect(estCarteModifiee(true, true)).toBe(true);
  });
});

describe('modeFooter (choix des boutons)', () => {
  it('non modifiée → un seul bouton « Sortir »', () => {
    expect(modeFooter(false)).toBe('sortir');
  });
  it('modifiée → « Valider » + « Annuler »', () => {
    expect(modeFooter(true)).toBe('valider-annuler');
  });
  it('composé avec estCarteModifiee : ouverture propre → sortir ; après mutation → valider-annuler', () => {
    expect(modeFooter(estCarteModifiee(false, false))).toBe('sortir');
    expect(modeFooter(estCarteModifiee(false, true))).toBe('valider-annuler');
  });
});
