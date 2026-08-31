import { describe, it, expect } from 'vitest';
import { creerBudgetRun } from './plafondEnvoiRun';

/**
 * PLAFOND ANTI-CUMUL — budget PUR par demande et par run. On prouve : le plafond borne PAR DEMANDE (jamais global), il est lu au
 * runtime (N configurable), un envoi noté consomme une unité, et une valeur aberrante (≤ 0 / non finie) est ramenée à 1 (jamais bloquer).
 */
describe('creerBudgetRun — plafond par demande et par run', () => {
  it('N=1 : la 1re demande passe ; une 2e tentative sur la MÊME demande est refusée', () => {
    const b = creerBudgetRun(1);
    expect(b.peutEnvoyer(42)).toBe(true);
    b.noterEnvoi(42);
    expect(b.peutEnvoyer(42)).toBe(false);
    expect(b.compteur(42)).toBe(1);
  });

  it('le plafond est PAR DEMANDE : une AUTRE demande reste autorisée même quand la première est pleine', () => {
    const b = creerBudgetRun(1);
    b.noterEnvoi(42);
    expect(b.peutEnvoyer(42)).toBe(false);
    expect(b.peutEnvoyer(43)).toBe(true); // demande distincte → budget propre
  });

  it('N lu au runtime : porté à 2, deux envois passent sur la même demande, le 3e est refusé', () => {
    const b = creerBudgetRun(2);
    expect(b.peutEnvoyer(1)).toBe(true); b.noterEnvoi(1);
    expect(b.peutEnvoyer(1)).toBe(true); b.noterEnvoi(1);
    expect(b.peutEnvoyer(1)).toBe(false);
    expect(b.compteur(1)).toBe(2);
  });

  it('borne basse : un plafond ≤ 0 est ramené à 1 (ne jamais bloquer TOUT envoi)', () => {
    const b = creerBudgetRun(0);
    expect(b.peutEnvoyer(1)).toBe(true);
    b.noterEnvoi(1);
    expect(b.peutEnvoyer(1)).toBe(false);
  });

  it('valeur non finie (NaN) → repli sûr sur 1', () => {
    const b = creerBudgetRun(Number.NaN);
    expect(b.peutEnvoyer(1)).toBe(true);
    b.noterEnvoi(1);
    expect(b.peutEnvoyer(1)).toBe(false);
  });
});
