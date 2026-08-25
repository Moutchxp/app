import { describe, it, expect } from 'vitest';
import { estFuturBati, estEnProjet } from './etatBati';

describe('PROJ-3h — vocabulaire d’état BD TOPO (même nomenclature que le Rattachement)', () => {
  it('estFuturBati : En projet OU En construction ; jamais l’existant ni null', () => {
    expect(estFuturBati('En projet')).toBe(true);
    expect(estFuturBati('En construction')).toBe(true);
    expect(estFuturBati('En service')).toBe(false);
    expect(estFuturBati('En ruine')).toBe(false);
    expect(estFuturBati(null)).toBe(false);
    expect(estFuturBati(undefined)).toBe(false);
  });
  it('estEnProjet : strictement « En projet »', () => {
    expect(estEnProjet('En projet')).toBe(true);
    expect(estEnProjet('En construction')).toBe(false); // futur bâti mais PAS « en projet »
    expect(estEnProjet('En service')).toBe(false);
    expect(estEnProjet(null)).toBe(false);
  });
});
