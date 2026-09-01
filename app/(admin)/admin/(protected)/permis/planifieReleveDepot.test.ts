import { describe, it, expect, vi } from 'vitest';
import { creerPlanificateurReleve, type IoPlanificateurReleve } from './planifieReleveDepot';

/**
 * LOT 34 — planificateur PUR de la relève déclenchée par « copier ». On prouve, sans DOM ni horloge réelle : un clic programme UNE
 * relève ; deux clics rapprochés n'en programment qu'UNE (dédup) ; à l'échéance le créneau se libère (reprogrammable) ; annuler
 * (démontage) évite la relève fantôme ; le délai est relu à CHAQUE programmation (suit la config, jamais figé).
 */
function harness(delaiSec = 60) {
  let cb: (() => void) | null = null;
  const io: IoPlanificateurReleve & { _delai: number } = {
    _delai: delaiSec,
    delaiMs() { return this._delai * 1000; },
    programmer: vi.fn((c: () => void) => { cb = c; return {}; }),
    annuler: vi.fn(),
    avantAttente: vi.fn(),
    executer: vi.fn(),
  };
  const p = creerPlanificateurReleve(io);
  return { p, io, echeance: () => cb?.() };
}

describe('creerPlanificateurReleve', () => {
  it('un clic → UNE relève programmée + le feedback « dans un instant » une fois', () => {
    const h = harness();
    h.p.demander();
    expect(h.io.programmer).toHaveBeenCalledTimes(1);
    expect(h.io.avantAttente).toHaveBeenCalledTimes(1);
    expect(h.p.enAttente()).toBe(true);
  });

  it('DEUX (et trois) clics rapprochés → une SEULE relève programmée (dédoublonnage)', () => {
    const h = harness();
    h.p.demander(); h.p.demander(); h.p.demander();
    expect(h.io.programmer).toHaveBeenCalledTimes(1);
    expect(h.io.avantAttente).toHaveBeenCalledTimes(1);
    expect(h.io.executer).not.toHaveBeenCalled(); // pas encore l'échéance
  });

  it('à l’échéance → executer UNE fois ; le créneau se libère, un clic ultérieur reprogramme', () => {
    const h = harness();
    h.p.demander();
    h.echeance();
    expect(h.io.executer).toHaveBeenCalledTimes(1);
    expect(h.p.enAttente()).toBe(false);
    h.p.demander(); // clic APRÈS l'échéance
    expect(h.io.programmer).toHaveBeenCalledTimes(2);
  });

  it('annuler (démontage) → clearTimeout appelé, plus rien en attente, executer JAMAIS appelé', () => {
    const h = harness();
    h.p.demander();
    h.p.annuler();
    expect(h.io.annuler).toHaveBeenCalledTimes(1); // clearTimeout → le vrai timer ne se déclenchera jamais
    expect(h.p.enAttente()).toBe(false);
    expect(h.io.executer).not.toHaveBeenCalled();  // l'échéance n'a jamais été atteinte
  });

  it('le délai est relu FRAIS à chaque programmation (suit la config, jamais figé)', () => {
    const h = harness(60);
    h.p.demander();
    expect(h.io.programmer).toHaveBeenLastCalledWith(expect.any(Function), 60000);
    h.echeance();
    h.io._delai = 30; // la config change
    h.p.demander();
    expect(h.io.programmer).toHaveBeenLastCalledWith(expect.any(Function), 30000);
  });
});
