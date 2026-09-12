import { describe, it, expect } from 'vitest';
import { emprisesASurligner } from './surlignageSelection';

// Emprise minimale (seuls id + corpsId comptent pour la règle d'appartenance).
const e = (id: number, corpsId: number | null) => ({ id, corpsId });

describe('emprisesASurligner (D) — quelles emprises du bâtiment sélectionné surligner', () => {
  const emp = [e(1, 10), e(2, 10), e(3, 20), e(4, null)]; // corps 10 en porte DEUX, corps 20 une, une orpheline

  it('≥ 2 bâtiments + bâtiment sélectionné : TOUTES ses emprises (0, 1 ou plusieurs)', () => {
    expect(emprisesASurligner(emp, 10, 2)).toEqual([1, 2]); // le bâtiment 10 porte deux emprises → les deux
    expect(emprisesASurligner(emp, 20, 2)).toEqual([3]);
  });

  it('UN seul bâtiment → RIEN (rien à distinguer)', () => {
    expect(emprisesASurligner(emp, 10, 1)).toEqual([]);
    expect(emprisesASurligner(emp, 10, 0)).toEqual([]);
  });

  it('aucun bâtiment sélectionné → RIEN', () => {
    expect(emprisesASurligner(emp, null, 3)).toEqual([]);
  });

  it('bâtiment sélectionné SANS emprise tracée → tableau vide, aucune erreur', () => {
    expect(emprisesASurligner(emp, 99, 3)).toEqual([]);
  });
});
