import { describe, it, expect } from 'vitest';
import { estEmailValide } from './email';

describe('estEmailValide — cas valides', () => {
  it.each([
    'a.jorel@sansvisavis.com',
    'prenom.nom@exemple.fr',
    'x@y.z',
    'Prenom.Nom@Exemple.FR', // casse préservée : la validation ne dépend pas de la casse
    '  arno@exemple.fr  ', // trim : les blancs de bord sont tolérés
    'a+b@sous.domaine.co.uk',
  ])('accepte %j', (v) => {
    expect(estEmailValide(v)).toBe(true);
  });
});

describe('estEmailValide — cas invalides', () => {
  it.each([
    ['pas d’arobase', 'arno'],
    ['deux arobases', 'a@@b.com'],
    ['deux arobases séparées', 'a@b@c.com'],
    ['espace interne', 'a b@c.com'],
    ['domaine sans point', 'arno@localhost'],
    ['domaine terminant par un point', 'arno@exemple.'],
    ['domaine commençant par un point', 'arno@.fr'],
    ['partie locale vide', '@exemple.fr'],
    ['chaîne vide', ''],
    ['uniquement des blancs', '   '],
    ['trop long (300 caractères)', `${'a'.repeat(290)}@ex.fr`],
  ])('rejette %s', (_libelle, v) => {
    expect(estEmailValide(v)).toBe(false);
  });

  it('rejette précisément une adresse de 255 caractères, accepte 254', () => {
    const domaine = '@e.fr'; // 5 caractères
    const local254 = 'a'.repeat(254 - domaine.length);
    expect(estEmailValide(local254 + domaine)).toBe(true); // 254 pile
    expect(estEmailValide(`a${local254}${domaine}`)).toBe(false); // 255
  });
});
