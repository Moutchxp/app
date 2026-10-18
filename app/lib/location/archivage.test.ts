import { describe, expect, it } from 'vitest';
import { dateEntree, etatBouton, LIBELLE_BOUTON, LIBELLE_CONFIRMER_OCCUPE, libelleBien, phraseArchivage } from './archivage';

/** « Supprimer un propriétaire » (Arno, 18/10/2026) — le gros bouton et les phrases, sans base. */
describe('archivage : le gros bouton suit l’occupation de TOUS les biens', () => {
  const occ = { occupationId: 1, lotId: 2, adresse: null, lot: null, locataireId: 3, locataire: 'X', entree: null };
  it('aucune location en cours → rouge « Archiver… » ; au moins une → orange d’alerte ; archivé → « Réactiver… »', () => {
    expect(etatBouton({ sortie: null, occupees: [] })).toBe('archiver');
    expect(etatBouton({ sortie: null, occupees: [occ] })).toBe('alerte');
    expect(etatBouton({ sortie: { le: '2026-10-18', par: null }, occupees: [occ] })).toBe('reactiver');
  });
  it('les mots d’Arno, exactement', () => {
    expect(LIBELLE_BOUTON).toEqual({
      archiver: 'Archiver le propriétaire et son historique',
      alerte: 'Attention, au moins un bien est actuellement occupé par un locataire',
      reactiver: 'Réactiver le propriétaire et ses biens',
    });
    expect(LIBELLE_CONFIRMER_OCCUPE).toBe('Confirmer l’archivage du propriétaire et de ses biens');
  });
  it('bien, date d’entrée, phrase : rien n’est effacé, locations closes à la date du jour', () => {
    expect(libelleBien({ adresse: '14 rue X, PARIS', lot: '315', lotId: 9 })).toBe('14 rue X, PARIS · lot 315');
    expect(libelleBien({ adresse: null, lot: null, lotId: 9 })).toBe('Bien 9');
    expect(dateEntree('2024-09-01')).toBe('entré(e) le 01/09/2024');
    expect(dateEntree(null)).toBe('date d’entrée inconnue');
    for (const s of ['proprietaire', 'bien', 'locataire'] as const) {
      expect(phraseArchivage(s)).toContain('Rien n’est effacé');
      expect(phraseArchivage(s)).toContain('à la date du jour');
    }
    expect(phraseArchivage('proprietaire')).toContain('sauf s’ils louent un autre bien du portefeuille');
  });
});
