import { describe, it, expect } from 'vitest';
import { nomAffichageCorps, libelleNomRepli, codeRepli, nomAffichageEmprise, resolveurNomEmprise } from './nomCorps';

describe('NOM-3 — nomAffichageEmprise (base corps + « (numéro) » si le corps porte plusieurs emprises)', () => {
  const corpsRepere = { repere: 'A1', nomRepli: null, corpsId: 5 };
  const corpsAnon = { repere: null, nomRepli: 'BP', corpsId: 5 }; // → « bâtiment en projet » (un seul corps)

  it('UNE seule emprise sur le corps → base seule (aucun numéro superflu)', () => {
    expect(nomAffichageEmprise({ id: 10, numero: 1 }, corpsRepere, [{ id: 10, numero: 1 }])).toBe('A1');
    expect(nomAffichageEmprise({ id: 10, numero: 1 }, corpsAnon, [{ id: 10, numero: 1 }])).toBe('bâtiment en projet');
  });

  it('PLUSIEURS emprises sur le corps → « base (numéro) », numéro STABLE (le stocké), jamais un rang recalculé', () => {
    const memeCorps = [{ id: 10, numero: 1 }, { id: 40, numero: 2 }];
    expect(nomAffichageEmprise({ id: 10, numero: 1 }, corpsRepere, memeCorps)).toBe('A1 (1)');
    expect(nomAffichageEmprise({ id: 40, numero: 2 }, corpsRepere, memeCorps)).toBe('A1 (2)');
    expect(nomAffichageEmprise({ id: 10, numero: 1 }, corpsAnon, memeCorps)).toBe('bâtiment en projet (1)');
  });

  it('NON réattribué : après suppression de la 1re, la 2e GARDE son numéro (le n° suit l’emprise, pas la position)', () => {
    const apresSuppression = [{ id: 40, numero: 2 }]; // il ne reste qu'une emprise → base seule (plus de doublon possible)
    expect(nomAffichageEmprise({ id: 40, numero: 2 }, corpsRepere, apresSuppression)).toBe('A1');
    // et si une 3e est créée (numéro 3, jamais 2) : les deux restent distinctes.
    const deuxRestantes = [{ id: 40, numero: 2 }, { id: 70, numero: 3 }];
    expect(nomAffichageEmprise({ id: 40, numero: 2 }, corpsRepere, deuxRestantes)).toBe('A1 (2)');
    expect(nomAffichageEmprise({ id: 70, numero: 3 }, corpsRepere, deuxRestantes)).toBe('A1 (3)');
  });

  it('repli DÉTERMINISTE par id si numéro absent (migration 212 non appliquée) — jamais un crash', () => {
    const memeCorps = [{ id: 10, numero: null }, { id: 40, numero: null }];
    expect(nomAffichageEmprise({ id: 10, numero: null }, corpsAnon, memeCorps)).toBe('bâtiment en projet (1)');
    expect(nomAffichageEmprise({ id: 40, numero: null }, corpsAnon, memeCorps)).toBe('bâtiment en projet (2)');
  });

  it('corps INTROUVABLE → « bâtiment en projet » (jamais vide) ; ne collisionne pas avec un autre corps nommé', () => {
    expect(nomAffichageEmprise({ id: 10, numero: 1 }, null, [{ id: 10, numero: 1 }])).toBe('bâtiment en projet');
  });
});

describe('NOM-3 — resolveurNomEmprise (nom distinct par emprise, dérivé bâtiments + emprises)', () => {
  it('deux emprises tracées d’un même bâtiment anonyme → deux noms DISTINCTS', () => {
    const batiments = [{ corpsId: 5, repere: null, nomRepli: 'BP' }];
    const emprises = [{ id: 632, corpsId: 5, numero: 1 }, { id: 800, corpsId: 5, numero: 2 }];
    const nom = resolveurNomEmprise(batiments, emprises);
    expect(nom(emprises[0])).toBe('bâtiment en projet (1)');
    expect(nom(emprises[1])).toBe('bâtiment en projet (2)');
    expect(nom(emprises[0])).not.toBe(nom(emprises[1])); // jamais deux fois le même nom à l'écran
  });

  it('deux bâtiments (repli BP1/BP2) à UNE emprise chacun → distincts par le corps, sans suffixe', () => {
    const batiments = [{ corpsId: 5, repere: null, nomRepli: 'BP1' }, { corpsId: 6, repere: null, nomRepli: 'BP2' }];
    const emprises = [{ id: 10, corpsId: 5, numero: 1 }, { id: 20, corpsId: 6, numero: 2 }];
    const nom = resolveurNomEmprise(batiments, emprises);
    expect(nom(emprises[0])).toBe('bâtiment en projet 1');
    expect(nom(emprises[1])).toBe('bâtiment en projet 2');
  });
});

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
