import { describe, it, expect, beforeEach } from 'vitest';
import { motDePasseValide } from './password';

const MDP = 'dev-admin-2026';

beforeEach(() => {
  process.env.ADMIN_PASSWORD = MDP;
});

describe('motDePasseValide', () => {
  it('bon mot de passe → true', () => {
    expect(motDePasseValide(MDP)).toBe(true);
  });

  it('mauvais mot de passe de MÊME longueur → false', () => {
    const faux = 'dev-admin-2027';
    expect(faux.length).toBe(MDP.length);
    expect(motDePasseValide(faux)).toBe(false);
  });

  it('mauvais mot de passe de longueur DIFFÉRENTE → false, sans throw', () => {
    expect(motDePasseValide('x')).toBe(false);
    expect(motDePasseValide(MDP + '-suffixe-plus-long')).toBe(false);
  });

  it('chaîne vide → false', () => {
    expect(motDePasseValide('')).toBe(false);
  });

  it('throw si ADMIN_PASSWORD absent', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(() => motDePasseValide(MDP)).toThrow(/ADMIN_PASSWORD/);
  });
});
