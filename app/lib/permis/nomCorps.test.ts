import { describe, it, expect } from 'vitest';
import { nomAffichageCorps, libelleNomRepli, codeRepli } from './nomCorps';

describe('NOM-1 — nomAffichageCorps (repere document → repli maison → dernier recours)', () => {
  it('repere lu dans les documents PRIME (« BAT A »)', () => {
    expect(nomAffichageCorps({ repere: 'BAT A', nomRepli: 'BP2', corpsId: 3 })).toBe('BAT A'); // repere gagne, même si un repli existe
    expect(nomAffichageCorps({ repere: '2D1', nomRepli: null, corpsId: 3 })).toBe('2D1');
  });
  it('pas de repere + repli « BP2 » → « bâtiment en projet 2 »', () => {
    expect(nomAffichageCorps({ repere: null, nomRepli: 'BP2', corpsId: 7 })).toBe('bâtiment en projet 2');
  });
  it('permis à un seul corps sans nom (repli « BP ») → « bâtiment en projet » SANS numéro', () => {
    expect(nomAffichageCorps({ repere: null, nomRepli: 'BP', corpsId: 3 })).toBe('bâtiment en projet');
  });
  it('ni repere ni repli (migration 168 non appliquée) → ancien comportement « bâtiment {id} »', () => {
    expect(nomAffichageCorps({ repere: null, nomRepli: null, corpsId: 3 })).toBe('bâtiment 3');
    expect(nomAffichageCorps({ repere: null, corpsId: 4 })).toBe('bâtiment 4'); // nomRepli absent (colonne pas lue)
  });
  it('repere vide ou espaces → traité comme absent (repli/dernier recours)', () => {
    expect(nomAffichageCorps({ repere: '   ', nomRepli: 'BP', corpsId: 3 })).toBe('bâtiment en projet');
    expect(nomAffichageCorps({ repere: '', nomRepli: null, corpsId: 5 })).toBe('bâtiment 5');
  });
});

describe('NOM-1 — libelleNomRepli (code → libellé long)', () => {
  it('BP → « bâtiment en projet » ; BP2 → « bâtiment en projet 2 » ; null → null', () => {
    expect(libelleNomRepli('BP')).toBe('bâtiment en projet');
    expect(libelleNomRepli('BP2')).toBe('bâtiment en projet 2');
    expect(libelleNomRepli('BP10')).toBe('bâtiment en projet 10');
    expect(libelleNomRepli(null)).toBeNull();
    expect(libelleNomRepli(undefined)).toBeNull();
  });
  it('format inattendu → rendu tel quel (jamais un crash, jamais d’invention)', () => {
    expect(libelleNomRepli('XYZ')).toBe('XYZ');
  });
});

describe('NOM-1 — codeRepli (le rang suit le corps, single corps sans numéro)', () => {
  it('un seul corps → « BP » (sans numéro)', () => {
    expect(codeRepli(1, 1)).toBe('BP');
  });
  it('le rang du repli suit le RANG DU CORPS : corps 2 anonyme → BP2 (jamais BP1)', () => {
    expect(codeRepli(2, 2)).toBe('BP2'); // corps 1 nommé « BAT A », corps 2 anonyme → BP2
    expect(codeRepli(1, 3)).toBe('BP1');
    expect(codeRepli(3, 3)).toBe('BP3');
  });
});
