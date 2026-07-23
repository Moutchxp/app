import { describe, it, expect } from 'vitest';
import {
  salutation, libelleVerdict, TITRE_ESPACE, TITRE_CONNEXION, SOUS_LIGNE_ACCUEIL,
  TITRE_ANALYSES, TITRE_CERTIFICATS, LIB_TELECHARGER,
} from './presentation';

describe('salutation — repli défensif (prénom/nom NULL ou vide)', () => {
  it('les DEUX présents → « Bonjour Prénom Nom »', () => {
    expect(salutation('Jean', 'Dupont')).toBe('Bonjour Jean Dupont');
  });
  it('nom NULL → « Bonjour, » seul (jamais « Bonjour null » ni espace orphelin)', () => {
    expect(salutation('Jean', null)).toBe('Bonjour,');
  });
  it('prénom NULL → « Bonjour, » seul', () => {
    expect(salutation(null, 'Dupont')).toBe('Bonjour,');
  });
  it('les DEUX NULL (dossier anonymisé) → « Bonjour, »', () => {
    expect(salutation(null, null)).toBe('Bonjour,');
  });
  it('chaînes vides / espaces → « Bonjour, » (pas d’espace orphelin)', () => {
    expect(salutation('', '')).toBe('Bonjour,');
    expect(salutation('  ', 'Dupont')).toBe('Bonjour,');
    expect(salutation(' Jean ', ' Dupont ')).toBe('Bonjour Jean Dupont'); // trim appliqué
  });
  it('jamais la chaîne « null » dans la sortie', () => {
    for (const s of [salutation(null, 'X'), salutation('X', null), salutation(null, null)]) {
      expect(s).not.toContain('null');
    }
  });
});

describe('libelleVerdict (espace)', () => {
  it('SANS_VIS_A_VIS → « Sans vis-à-vis »', () => expect(libelleVerdict('SANS_VIS_A_VIS')).toBe('Sans vis-à-vis'));
  it('VIS_A_VIS → « Vis-à-vis détecté »', () => expect(libelleVerdict('VIS_A_VIS')).toBe('Vis-à-vis détecté'));
  it('INDETERMINE / null → « Indéterminé »', () => {
    expect(libelleVerdict('INDETERMINE')).toBe('Indéterminé');
    expect(libelleVerdict(null)).toBe('Indéterminé');
  });
});

describe('titres de bandeau', () => {
  it('espace = « Mon espace personnel » (orthographe : deux n à personnel)', () => {
    expect(TITRE_ESPACE).toBe('Mon espace personnel');
  });
  it('connexion = « Connexion »', () => {
    expect(TITRE_CONNEXION).toBe('Connexion');
  });
});

describe('constantes de texte présentes et non vides', () => {
  it('toutes définies', () => {
    for (const s of [TITRE_ESPACE, TITRE_CONNEXION, SOUS_LIGNE_ACCUEIL, TITRE_ANALYSES, TITRE_CERTIFICATS, LIB_TELECHARGER]) {
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });
  it('la sous-ligne d’accueil invite aux analyses et certificats', () => {
    expect(SOUS_LIGNE_ACCUEIL).toMatch(/analyses/i);
    expect(SOUS_LIGNE_ACCUEIL).toMatch(/certificats/i);
  });
});
