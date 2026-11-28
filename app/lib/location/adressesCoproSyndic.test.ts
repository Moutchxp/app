import { describe, expect, it } from 'vitest';
import { biensParAdresse } from './adressesCoproSyndic';

/** 🔴🔴 Arno (28/11/2026, 12h17, point 4) — « 43 Avenue Marceau · 43 avenue Marceau · 43 avenue Marceau · 80 rue de Normandie · 80 rue de Normandie » */
describe('biensParAdresse : une adresse une fois, ses biens la suivent', () => {
  const L = (id: number, adresse: string | null) => ({ id, adresse });
  it('l’exemple d’Arno : 2 adresses, 3 et 2 biens ; majuscules, abréviation et « bis » collé ignorés (clé de la 522)', () => {
    const g = biensParAdresse([L(1, '43 Avenue Marceau'), L(2, '43 avenue Marceau'), L(3, '43 av. Marceau'), L(4, '80 rue de Normandie'), L(5, '80 r. de Normandie')]);
    expect(g.map((x) => [x.adresse, x.lots.map((l) => l.id)])).toEqual([['43 Avenue Marceau', [1, 2, 3]], ['80 rue de Normandie', [4, 5]]]);
    expect(biensParAdresse([L(1, '12bis rue X'), L(2, '12 bis rue X')])).toHaveLength(1);
  });
  it('des adresses différentes restent séparées ; un bien sans adresse n’est pas perdu', () => {
    expect(biensParAdresse([L(1, '43 avenue Marceau'), L(2, '45 avenue Marceau'), L(3, null)]).map((x) => x.lots.length)).toEqual([1, 1, 1]);
  });
});
