import { describe, it, expect } from 'vitest';
import { raisonRefusBascule } from './basculeRail';

const coords = (o: Partial<{ email: string; urlFormulaire: string; adressePostale: string }> = {}) => ({
  email: '', urlFormulaire: '', adressePostale: '', ...o,
});

describe('D5 — raisonRefusBascule (garde canal↔coordonnée, réutilise validerCanal)', () => {
  // 🔴 PART 3 — basculer vers 'formulaire' SANS URL est REFUSÉ avec sa raison (renvoi à la fiche contact).
  it('vers téléservice sans URL → refus + raison', () => {
    const r = raisonRefusBascule('email', 'formulaire', coords({ email: 'mairie@ville.fr', urlFormulaire: '' }));
    expect(r).toContain('URL de formulaire invalide');
    expect(r).toContain('fiche contact');
  });
  // 🔴 PART 3 — basculer vers 'email' SANS adresse e-mail est REFUSÉ avec sa raison.
  it('vers e-mail sans adresse valide → refus + raison', () => {
    const r = raisonRefusBascule('formulaire', 'email', coords({ urlFormulaire: 'https://ville.fr/urba', email: '' }));
    expect(r).toContain('e-mail invalide');
  });
  it('déjà sur le rail cible → refus (rien à faire)', () => {
    expect(raisonRefusBascule('email', 'email', coords({ email: 'x@y.fr' }))).toBe('la commune est déjà sur ce rail');
  });
  it('coordonnée cible présente → bascule permise (null)', () => {
    expect(raisonRefusBascule('email', 'formulaire', coords({ urlFormulaire: 'https://ville.fr/urba', email: 'x@y.fr' }))).toBeNull();
    expect(raisonRefusBascule('formulaire', 'email', coords({ email: 'mairie@ville.fr', urlFormulaire: 'https://ville.fr/urba' }))).toBeNull();
  });
});
