import { describe, it, expect } from 'vitest';
import { chiffrer, coffreConfigure, dechiffrer, lireCle, masquer, CoffreIndisponible, VARIABLE_CLE } from './coffre';

/** Une clé de test, en hexadécimal. Jamais celle de production : elle n'a aucune valeur hors de ce fichier. */
const CLE = { [VARIABLE_CLE]: '0'.repeat(64) };
const AUTRE = { [VARIABLE_CLE]: 'f'.repeat(64) };

describe('la clé', () => {
  it('se lit en hexadécimal', () => {
    expect(lireCle(CLE)).toHaveLength(32);
  });
  it('se lit aussi en base64', () => {
    expect(lireCle({ [VARIABLE_CLE]: Buffer.alloc(32, 7).toString('base64') })).toHaveLength(32);
  });

  /** Sans cette phrase, on cherche la commande pendant dix minutes et on finit par mettre n'importe quoi. */
  it('absente : le message DIT comment en fabriquer une', () => {
    expect(() => lireCle({})).toThrow(/openssl rand -hex 32/);
  });
  it('trop courte : refusée, avec la même sortie', () => {
    expect(() => lireCle({ [VARIABLE_CLE]: 'abcd' })).toThrow(CoffreIndisponible);
  });
  it('le coffre se déclare indisponible plutôt que de jeter, quand on pose la question', () => {
    expect(coffreConfigure({})).toBe(false);
    expect(coffreConfigure(CLE)).toBe(true);
  });
});

describe('chiffrer et déchiffrer', () => {
  it('un aller-retour rend la valeur d’origine', () => {
    expect(dechiffrer(chiffrer('1//jeton-de-rafraichissement', CLE), CLE)).toBe('1//jeton-de-rafraichissement');
  });

  it('le contenu chiffré ne laisse RIEN voir du clair', () => {
    const c = chiffrer('1//secret-tres-reconnaissable', CLE);
    expect(c).not.toContain('secret');
    expect(c.startsWith('v1:')).toBe(true);
  });

  /**
   * 🔴 RÉUTILISER UN VECTEUR D'INITIALISATION AVEC LA MÊME CLÉ CASSE GCM COMPLÈTEMENT. Ce n'est pas une précaution
   * de style : c'est la condition de sa sécurité. Deux chiffrements du MÊME texte doivent donc différer.
   */
  it('deux chiffrements du même texte sont DIFFÉRENTS', () => {
    expect(chiffrer('pareil', CLE)).not.toBe(chiffrer('pareil', CLE));
  });

  /** GCM est AUTHENTIFIÉ : un octet changé fait ÉCHOUER, au lieu de rendre silencieusement n'importe quoi. */
  it('un contenu ALTÉRÉ est refusé, jamais rendu de travers', () => {
    const c = chiffrer('jeton', CLE).split(':');
    const abime = [c[0], c[1], c[2], Buffer.from('autre chose').toString('base64')].join(':');
    expect(() => dechiffrer(abime, CLE)).toThrow(CoffreIndisponible);
  });

  it('une étiquette d’authenticité fausse est refusée', () => {
    const c = chiffrer('jeton', CLE).split(':');
    expect(() => dechiffrer([c[0], c[1], Buffer.alloc(16).toString('base64'), c[3]].join(':'), CLE)).toThrow();
  });

  /** Le cas le plus probable en vrai : la clé a changé. Le message doit DIRE la sortie, qui est un simple reclic. */
  it('déchiffrer avec une AUTRE clé échoue, et dit quoi faire', () => {
    const c = chiffrer('jeton', CLE);
    expect(() => dechiffrer(c, AUTRE)).toThrow(/Connecter mon Google Drive/);
  });

  it('un format inattendu est refusé sans même lire la clé', () => {
    expect(() => dechiffrer('pas du tout un jeton', {})).toThrow(/format inattendu/);
  });
});

describe('ce qu’on dit d’un jeton', () => {
  it('sa longueur, jamais sa valeur', () => {
    expect(masquer('1//abcdef')).toBe('présent (9 caractères, non affiché)');
    expect(masquer('1//abcdef')).not.toContain('abcdef');
  });
  it('absent se dit absent', () => {
    expect(masquer(null)).toBe('absent');
  });
});
