import { describe, it, expect } from 'vitest';
import { jourCivilLocal } from './BlocDemandePieces';
import { instantParis } from '../../../../lib/temps/paris';

/**
 * Q9 — le bouton « Aujourd'hui » remplit le champ date au jour LOCAL. 🔴 JAMAIS `toISOString().slice(0,10)` : le soir, l'instant UTC
 * bascule d'un jour (piège du butoir corrigé au LOT 1). `jourCivilLocal` compose depuis les champs LOCAUX de la Date → aucune dérive.
 */
describe('Q9 — jourCivilLocal : jour civil LOCAL, aucune dérive selon l’heure', () => {
  it('fin de soirée (23:30 locale) → le MÊME jour civil, jamais le lendemain UTC', () => {
    const d = instantParis(2026, 8, 28, 23, 30, 0); // 28/08/2026 23:30 heure de PARIS (portabilité : quel que soit le fuseau du runner)
    expect(jourCivilLocal(d)).toBe('2026-08-28');
    // preuve de l'anti-piège : construit à partir des champs LOCAUX → suit getDate() local, pas la bascule UTC de toISOString.
    expect(jourCivilLocal(d)).toBe(`2026-08-${String(d.getDate()).padStart(2, '0')}`);
  });
  it('tout début de journée (00:15 locale) → jour local, padding mois/jour correct', () => {
    expect(jourCivilLocal(instantParis(2026, 1, 5, 0, 15, 0))).toBe('2026-01-05'); // 05/01/2026
  });
  it('padding : mois et jour à un chiffre → deux chiffres', () => {
    expect(jourCivilLocal(instantParis(2026, 3, 9, 12, 0, 0))).toBe('2026-03-09'); // 09/03/2026
  });
});
