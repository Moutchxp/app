import { describe, it, expect, vi } from 'vitest';

// Pur : `compterParProcess` mappe canal→rail (processDeCanal) et compte des PERMIS. On mocke db/client pour éviter toute I/O à
//   l'import de demandeRepo (le pool pg n'est jamais utilisé par cette fonction pure).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
import { compterParProcess, compterVivier } from './demandeRepo';

describe('Lot 2 — compterParProcess : compte des PERMIS par rail (jamais des communes)', () => {
  it('plusieurs permis d’une même commune formulaire comptent INDIVIDUELLEMENT (permis, pas communes)', () => {
    const vivier = [
      { canal: 'formulaire' }, { canal: 'formulaire' }, { canal: 'formulaire' }, // 3 permis (potentiellement 1 seule commune)
      { canal: 'email' }, { canal: 'email' },
    ];
    expect(compterParProcess(vivier)).toEqual({ email: 2, formulaire: 3 });
  });
  it('les canaux hors process (courrier / inconnu / null) ne sont dans AUCUN compteur', () => {
    const vivier = [{ canal: 'courrier' }, { canal: 'inconnu' }, { canal: null }, { canal: 'formulaire' }];
    expect(compterParProcess(vivier)).toEqual({ email: 0, formulaire: 1 });
  });
  it('vivier vide → 0 / 0', () => {
    expect(compterParProcess([])).toEqual({ email: 0, formulaire: 0 });
  });
});

describe('compterVivier — formulaire HORS DÉMOLITION (catégorie demolition écartée du DÉCOMPTE, jamais du vivier)', () => {
  it('le hors-démolition écarte la catégorie « demolition » ; le total formulaire la garde', () => {
    const vivier = [
      { canal: 'formulaire', categorie: 'construction_neuve' as const },
      { canal: 'formulaire', categorie: 'demolition' as const },       // comptée dans le TOTAL, écartée du HORS-DÉMO
      { canal: 'formulaire', categorie: 'extension' as const },
      { canal: 'email', categorie: 'demolition' as const },            // email : hors du décompte formulaire
    ];
    // formulaire total = 3 ; hors démolition = 2 (construction_neuve + extension) ; email = 1.
    expect(compterVivier(vivier)).toEqual({ email: 1, formulaire: 3, formulaireHorsDemolition: 2 });
  });
  it('vivier vide → 0 partout', () => {
    expect(compterVivier([])).toEqual({ email: 0, formulaire: 0, formulaireHorsDemolition: 0 });
  });
});
