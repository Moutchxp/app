import { describe, expect, it } from 'vitest';
import { familleDeCategorie, manquesDuBien, verifierBienComplet, verifierComplements } from './bienComplet';

describe('🔴 formulaire complet du bien — la règle pure (écran ET serveur)', () => {
  it('obligatoires : un propriétaire, l’adresse, la FAMILLE, puis le type propre à la famille', () => {
    expect(Object.keys(manquesDuBien({ proprietaireIds: [], adresse: ' ' }))).toEqual(['proprietaires', 'adresse', 'famille']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'logement' }))).toEqual(['typeLogement']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'local' }))).toEqual(['typeLocal']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'parking' }))).toEqual(['parkingType']);
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'logement', typeLogement: 'studio' })).toEqual({});
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'local', typeLocal: 'bureaux', annexes: [{ autreAdresse: true, adresse: '' }] }))
      .toEqual({ 'annexe-0': 'Annexe 1 : l’autre adresse est à renseigner.' });
  });
  it('la famille d’un bien existant se DÉDUIT de sa catégorie (rien n’est écrit)', () => {
    expect([familleDeCategorie('logement'), familleDeCategorie('local'), familleDeCategorie('parking'), familleDeCategorie('box'), familleDeCategorie('cave'), familleDeCategorie(null)])
      .toEqual(['logement', 'local', 'parking', 'parking', null, null]);
  });
  it('le reste est facultatif, mais refusé s’il est mal formé', () => {
    const base = { proprietaireIds: [1, 1, 2], logement: { adresse: '1 rue A', famille: 'logement', typeLogement: 'maison' }, annexes: [] };
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
