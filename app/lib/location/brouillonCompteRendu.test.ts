import { describe, expect, it } from 'vitest';
import { BROUILLON_VIDE, brouillonVide, heureBrouillon, messageBrouillonRestaure, nettoyerBrouillon } from './brouillonCompteRendu';

/** 🔴 Arno (15/11/2026) — le brouillon du compte rendu : propre, borné, jamais refusé. */
describe('brouillon du compte rendu', () => {
  it('nettoie et borne ce qui arrive ; ce qui ne tient pas est laissé de côté', () => {
    const c = nettoyerBrouillon({ corps: 'Salon\u0000 propre', presents: [11, 11, -3, 'x', 12], aussiLocataires: false,
      ajoutees: [{ cle: 'a', civilite: 'Madame', nom: ' Martin ', prenom: 'Léa', present: true, note: 'mère' }, { civilite: 'Docteur', nom: 'X' }],
      photos: [{ id: 71, legende: 'Rayure' }, { id: 71, legende: 'doublon' }, { id: 0, legende: 'non' }],
      fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: true, prises: [{ id: 81, dureeS: 3.5 }, { id: 'x' }] }], inconnu: 'ignoré' });
    expect(c).toEqual({ corps: 'Salon propre', presents: [11, 12], aussiLocataires: false, fichierActif: null, absence: false, aussiProprietaires: false, adressesProprietaires: null,
      ajoutees: [{ cle: 'a', civilite: 'Madame', nom: 'Martin', prenom: 'Léa', present: true, note: 'mère' }],
      photos: [{ id: 71, legende: 'Rayure' }], fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: true, prises: [{ id: 81, dureeS: 3.5 }] }] });
    expect(nettoyerBrouillon(null)).toEqual(BROUILLON_VIDE);
  });
  it('vide : rien à garder ; l’envoi aux locataires désactivé compte comme une saisie', () => {
    expect(brouillonVide(BROUILLON_VIDE)).toBe(true);
    expect(brouillonVide({ ...BROUILLON_VIDE, corps: 'x' })).toBe(false);
    expect(brouillonVide({ ...BROUILLON_VIDE, aussiLocataires: false })).toBe(false);
  });
  it('« Brouillon restauré — enregistré à HHhMM », heure de Paris', () => {
    expect(heureBrouillon('2026-11-15T13:05:00Z')).toBe('14h05');
    expect(messageBrouillonRestaure('2026-11-15T13:05:00Z')).toBe('Brouillon restauré — enregistré à 14h05');
  });
});
