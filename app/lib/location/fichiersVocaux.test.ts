import { describe, expect, it } from 'vitest';
import { fichiersDeTrace, fichiersVocauxRecus, idsDeTrace, insererDictee, nomFichierVocal, traceVocaux, VOCAUX_MAX } from './vocauxCompteRendu';
import { vocauxPourEnvoi, type FichierVocal } from '../../(admin)/admin/(protected)/location/CompteRenduSaisie';

/** 🔴 Arno (15/11/2026) — le dictaphone : des FICHIERS vocaux (nom, prises dans l'ordre), rangés au journal ; la DICTÉE insérée au curseur. */
describe('fichiers vocaux au journal', () => {
  it('trace des fichiers (noms, prises dans l’ordre) ; relue telle quelle ; l’ancienne trace « ids: » : un fichier par vocal', () => {
    const t = traceVocaux([5, 6, 7], [{ nom: 'Cuisine', ids: [5, 6] }, { nom: '  ', ids: [7] }]);
    expect(fichiersDeTrace(t)).toEqual([{ nom: 'Cuisine', ids: [5, 6] }, { nom: 'Vocal 2', ids: [7] }]);
    expect(idsDeTrace(t)).toEqual([5, 6, 7]);
    expect(fichiersDeTrace('ids:3,4')).toEqual([{ nom: 'Vocal 1', ids: [3] }, { nom: 'Vocal 2', ids: [4] }]);
    expect(traceVocaux([3, 4])).toBe('ids:3,4');
    expect(fichiersDeTrace('json:{pas du json')).toEqual([]);
    expect(fichiersDeTrace(null)).toEqual([]);
  });
  it('🔴 les fichiers reçus sont BORNÉS aux prises du compte rendu : inconnue écartée, doublon une fois, fichier vide retiré, prise orpheline = son fichier', () => {
    expect(fichiersVocauxRecus([{ nom: 'A', ids: [1, 99, 2] }, { nom: 'B', ids: [2, 'x'] }, { nom: 'C', ids: [] }], [1, 2, 3]))
      .toEqual([{ nom: 'A', ids: [1, 2] }, { nom: 'Vocal 2', ids: [3] }]);
    expect(fichiersVocauxRecus('pas une liste', [4])).toEqual([{ nom: 'Vocal 1', ids: [4] }]);
  });
  it('nom propre : espaces resserrés, caractères de contrôle retirés, 60 caractères au plus ; vide → « Vocal N »', () => {
    expect(nomFichierVocal('  Salle\u0000 de   bain ', 0)).toBe('Salle de bain');
    expect(nomFichierVocal('x'.repeat(80), 0)).toHaveLength(60);
    expect(nomFichierVocal('', 2)).toBe('Vocal 3');
    expect(VOCAUX_MAX).toBe(40);
  });
});

describe('la dictée au curseur (sans mention)', () => {
  it('au curseur, espacée ; à la fin sans curseur ; vide : rien', () => {
    expect(insererDictee('Entrée propre. Salon rayé.', 15, 'Cuisine propre')).toEqual({ texte: 'Entrée propre. Cuisine propre Salon rayé.', curseur: 30 });
    expect(insererDictee('Début', null, ' fin  dictée ')).toEqual({ texte: 'Début fin dictée', curseur: 16 });
    expect(insererDictee('', 0, 'Bonjour')).toEqual({ texte: 'Bonjour', curseur: 7 });
    expect(insererDictee('Texte', 2, '   ').texte).toBe('Texte');
  });
});

describe('ce qui part à l’envoi', () => {
  it('les prises DÉPOSÉES, groupées par fichier (nom, ordre) ; un fichier sans prise déposée ne part pas', () => {
    const f = (nom: string, ids: (number | null)[]): FichierVocal => ({ cle: nom, nom, transcription: null, motif: null,
      prises: ids.map((id, i) => ({ cle: `${nom}${i}`, id, url: '', dureeS: 1, etat: id === null ? 'depot' : 'ok', motif: null })) });
    expect(vocauxPourEnvoi([f('Vocal 1', [3, null, 4]), f('Vide', [null]), f(' ', [9])]))
      .toEqual({ vocaux: [3, 4, 9], fichiersVocaux: [{ nom: 'Vocal 1', ids: [3, 4], locataires: false }, { nom: 'Vocal 3', ids: [9], locataires: false }] });
  });
});
