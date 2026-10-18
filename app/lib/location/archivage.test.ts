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

describe('origine de l’archivage (Arno, 18/10/2026)', () => {
  it('un seul choix parmi cinq codes stables ; la mise en vente exige « par qui » ; précision facultative', async () => {
    const { verifierOrigine, originePrete, ORIGINES, LIBELLE_ORIGINE } = await import('./archivage');
    expect(ORIGINES).toEqual(['recupere_proprietaire', 'mise_en_vente', 'mecontent', 'deces_succession', 'litige']);
    expect(Object.values(LIBELLE_ORIGINE)).toEqual(['Récupéré par le propriétaire / sa famille', 'Mise en vente', 'Propriétaire mécontent', 'Décès / succession', 'Litige']);
    expect(verifierOrigine(undefined)).toBeNull();
    expect(verifierOrigine({ origine: 'autre' })).toBeNull();
    expect(verifierOrigine({ origine: 'mise_en_vente' })).toBeNull();
    expect(verifierOrigine({ origine: 'litige', sousOrigine: 'notre_agence' })).toBeNull();
    expect(verifierOrigine({ origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: '  ' })).toEqual({ origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: null });
    expect(verifierOrigine({ origine: 'litige', precision: ' impayés ' })).toEqual({ origine: 'litige', sousOrigine: null, precision: 'impayés' });
    expect([originePrete(null, null), originePrete('mise_en_vente', null), originePrete('mise_en_vente', 'lui_meme'), originePrete('mecontent', null)]).toEqual([false, false, true, true]);
  });
  it('le libellé de la fiche archivée', async () => {
    const { libelleOrigine } = await import('./archivage');
    expect(libelleOrigine({ origine: 'mise_en_vente', sousOrigine: 'autre_agence' })).toBe('Mise en vente par une autre agence');
    expect(libelleOrigine({ origine: 'mise_en_vente', sousOrigine: 'notre_agence' })).toBe('Mise en vente par notre agence');
    expect(libelleOrigine({ origine: 'mise_en_vente', sousOrigine: 'indetermine' })).toBe('Mise en vente (vendeur indéterminé)');
    expect(libelleOrigine({ origine: 'deces_succession', sousOrigine: null })).toBe('Décès / succession');
  });
});

describe('cartes des biens : famille et dates (Arno, 18/10/2026)', () => {
  it('« Logement / Local / Parking vacant » ; la famille déduite de la nature de l’import quand la catégorie manque', async () => {
    const { familleDuBien, motVacant, dateFr } = await import('./archivage');
    expect([motVacant('logement'), motVacant('local'), motVacant('parking'), motVacant(null)]).toEqual(['Logement vacant', 'Local vacant', 'Parking vacant', 'Logement vacant']);
    expect(familleDuBien('parking', 'Appartement', null)).toBe('parking');
    expect(familleDuBien(null, 'Local commercial', null)).toBe('local');
    expect(familleDuBien(null, 'Garage', 'Garage')).toBe('parking');
    expect(familleDuBien(null, 'Box', null)).toBe('parking');
    expect(familleDuBien(null, 'Appartement meublé', 'Studio')).toBe('logement');
    expect([dateFr('2026-06-30'), dateFr(null)]).toEqual(['30/06/2026', null]);
  });
});
