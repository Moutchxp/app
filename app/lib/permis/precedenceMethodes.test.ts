import { describe, it, expect } from 'vitest';
import { rangMethode, domine, methodeGagnante, motifEcartePrecedence, estMotifPrecedence, PRECEDENCE_METHODES } from './precedenceMethodes';

/**
 * N10-T — la précédence entre méthodes, déclarée UNE SEULE FOIS. Tests PURS. L'ordre : saisie > cerfa > enonce > plan > ia > motifs.
 */
describe('precedenceMethodes', () => {
  it('l’ORDRE est bien saisie > cerfa > enonce > plan > ia > motifs > recap (rang croissant = force décroissante)', () => {
    expect([...PRECEDENCE_METHODES]).toEqual(['saisie', 'cerfa', 'enonce', 'plan', 'ia', 'motifs', 'recap']);
    expect(rangMethode('cerfa')).toBeLessThan(rangMethode('ia'));
    expect(rangMethode('enonce')).toBeLessThan(rangMethode('motifs'));
    expect(rangMethode('inconnue')).toBe(PRECEDENCE_METHODES.length); // inconnue = rang le plus faible
    expect(rangMethode(null)).toBe(PRECEDENCE_METHODES.length);
  });

  it('domine : une méthode écrit par-dessus une méthode de rang inférieur ou égal, jamais supérieur', () => {
    expect(domine('cerfa', 'ia')).toBe(true);   // cerfa (formulaire) > ia (lecture d'image)
    expect(domine('ia', 'cerfa')).toBe(false);  // ia n'écrase PAS le formulaire
    expect(domine('enonce', 'motifs')).toBe(true);
    expect(domine('motifs', 'enonce')).toBe(false);
    expect(domine('ia', null)).toBe(true);       // aucun propriétaire → on écrit
    expect(domine('ia', 'ia')).toBe(true);       // même méthode (recompute idempotent) → on écrit
    // LOT 69 — 'recap' (champ libre corroboré) est le PLUS FAIBLE : il n'écrase AUCUNE méthode structurée, il n'écrit qu'un champ vierge.
    expect(domine('recap', 'motifs')).toBe(false);
    expect(domine('recap', null)).toBe(true);    // champ neuf (aucun propriétaire) → on écrit
    expect(domine('cerfa', 'recap')).toBe(true); // toute méthode structurée domine 'recap'
  });

  it('methodeGagnante : la plus forte parmi des « retenue » ; ignore les méthodes nulles ; null si aucune', () => {
    expect(methodeGagnante(['ia', 'cerfa'])).toBe('cerfa');
    expect(methodeGagnante(['motifs', 'enonce', 'plan'])).toBe('enonce');
    expect(methodeGagnante([null, undefined])).toBeNull();
    expect(methodeGagnante(['ia', null])).toBe('ia');
    expect(methodeGagnante([])).toBeNull();
  });

  it('motif d’écart : NOMME la règle, et estMotifPrecedence le reconnaît par un préfixe STABLE (pas un rapprochement fragile)', () => {
    const m = motifEcartePrecedence('ia', 'cerfa');
    expect(m).toContain('cerfa > ia');
    expect(estMotifPrecedence(m)).toBe(true);
    expect(estMotifPrecedence('champ non renseigné (case blanche)')).toBe(false);
    expect(estMotifPrecedence(null)).toBe(false);
  });
});
