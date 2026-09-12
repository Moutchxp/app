import { describe, it, expect } from 'vitest';
import { libelleFamillesManquantesNommees, LIMITE_FAMILLES_NOMMEES } from './familleManquanteTitre';

// Noms = ceux de la SOURCE UNIQUE LIBELLE_FAMILLE (Plan de masse / Plan de coupe / Plans d'étages / Formulaire Cerfa).
describe('② libelleFamillesManquantesNommees — le NOMBRE reste, suivi des NOMS des familles', () => {
  it('une famille : compte + nom (jamais « famille manquante : … » sans le compte)', () => {
    expect(libelleFamillesManquantesNommees(1, ['Plan de coupe'])).toBe('dossier incomplet (1 famille manquante : Plan de coupe)');
    expect(libelleFamillesManquantesNommees(1, ['Plan de coupe'])).toContain('1 famille manquante');
  });

  it('plusieurs (≤ seuil) : compte + liste complète, dans l’ordre reçu', () => {
    expect(libelleFamillesManquantesNommees(2, ['Plan de masse', 'Plan de coupe']))
      .toBe('dossier incomplet (2 familles manquantes : Plan de masse, Plan de coupe)');
  });

  it('au-delà du seuil : premiers noms puis « et N autre(s) » (titre lisible sur une ligne)', () => {
    expect(LIMITE_FAMILLES_NOMMEES).toBe(2);
    expect(libelleFamillesManquantesNommees(3, ['Plan de masse', 'Plan de coupe', 'Plans d’étages']))
      .toBe('dossier incomplet (3 familles manquantes : Plan de masse, Plan de coupe et 1 autre)');
    expect(libelleFamillesManquantesNommees(4, ['Plan de masse', 'Plan de coupe', 'Plans d’étages', 'Formulaire Cerfa']))
      .toBe('dossier incomplet (4 familles manquantes : Plan de masse, Plan de coupe et 2 autres)');
  });

  it('aucun nom fourni → compte seul (rétro-compatible : même chaîne que la formulation unique, aucune divergence)', () => {
    expect(libelleFamillesManquantesNommees(1, [])).toBe('dossier incomplet (1 famille manquante)');
    expect(libelleFamillesManquantesNommees(2, [])).toBe('dossier incomplet (2 familles manquantes)');
  });
});
