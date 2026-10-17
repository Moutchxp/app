import { describe, expect, it } from 'vitest';
import { manquesDuBien, verifierBienComplet, verifierComplements } from './bienComplet';

describe('🔴 formulaire complet du bien — la règle pure (écran ET serveur)', () => {
  it('trois obligatoires seulement : un propriétaire, l’adresse, le type de logement', () => {
    expect(Object.keys(manquesDuBien({ proprietaireIds: [], adresse: ' ', typeLogement: null }))).toEqual(['proprietaires', 'adresse', 'typeLogement']);
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', typeLogement: 'studio' })).toEqual({});
  });
  it('le reste est facultatif, mais refusé s’il est mal formé', () => {
    const base = { proprietaireIds: [1, 1, 2], logement: { adresse: '1 rue A', typeLogement: 'maison' }, annexes: [] };
    const v = verifierBienComplet(base);
    expect(v.ok && v.proprietaireIds).toEqual([1, 2]);
    expect(v.ok && v.logement).toMatchObject({ categorie: 'logement', meuble: null, dpeClasse: null, nombrePieces: null });
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, nombrePieces: '2,5' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, dpeClasse: 'H' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, codePostal: '7501' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, annexes: [{ categorie: 'logement' }] }).ok).toBe(false);
  });
  it('les compléments : virgule décimale, classe DPE en majuscule, « oui / non » pour meublé', () => {
    const v = verifierComplements({ surfaceHabitableM2: '41,8', dpeClasse: 'c', meuble: 'non', typeLogement: '' });
    expect(v.ok && v.valeurs).toMatchObject({ surfaceHabitableM2: 41.8, dpeClasse: 'C', meuble: false, typeLogement: null });
  });
});
