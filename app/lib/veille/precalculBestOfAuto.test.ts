import { describe, it, expect, vi } from 'vitest';
import { executerPrecalculBestOf, type DepsPrecalculBestOf } from './precalculBestOfAuto';
import type { BestOfValeur } from '../permis/bestOfPersistance';
import type { PieceGedMeta } from '../permis/lectureGed';

const PIECES: PieceGedMeta[] = [{ id: 1, nomFichier: 'PC.pdf', typeMime: 'application/pdf', cleStockage: 'k1', tailleOctets: 10 }];
const VALEUR: BestOfValeur = { proposees: [], autres: [], niveauxParId: new Map(), confirmations: new Map(), cerfaIds: new Set(), indisGed: [] };

/** Horloge injectable : renvoie successivement les valeurs de `temps` (dernier répété si épuisé). */
function horloge(temps: number[]): () => number {
  let i = 0;
  return () => temps[Math.min(i++, temps.length - 1)];
}

function makeDeps(over: Partial<DepsPrecalculBestOf> = {}): DepsPrecalculBestOf {
  return {
    maintenant: horloge([0]),
    listerCandidats: vi.fn(async () => [] as number[]),
    empreintePersistee: vi.fn(async () => null),
    empreinteCourante: vi.fn(async () => ({ empreinte: 'E', piecesPdf: PIECES })),
    calculer: vi.fn(async () => ({ valeur: VALEUR, cachable: true })),
    persister: vi.fn(async () => {}),
    ...over,
  };
}

describe('PC-3 — producteur de fond du best-of (executerPrecalculBestOf)', () => {
  it('univers vide → bilan à zéro, aucun calcul, aucune écriture', async () => {
    const calculer = vi.fn(async () => ({ valeur: VALEUR, cachable: true }));
    const persister = vi.fn(async () => {});
    const r = await executerPrecalculBestOf(makeDeps({ listerCandidats: vi.fn(async () => []), calculer, persister }));
    expect(r).toEqual({ candidats: 0, examines: 0, aJour: 0, recalcules: 0, persistes: 0, degrades: 0, interrompuBudget: false });
    expect(calculer).not.toHaveBeenCalled();
    expect(persister).not.toHaveBeenCalled();
  });

  it('dossier ABSENT du persisté → recalcule ET persiste (calcule_par fond, via deps.persister)', async () => {
    const persister = vi.fn(async () => {});
    const r = await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [11430]),
      empreintePersistee: vi.fn(async () => null),
      persister,
    }));
    expect(r).toMatchObject({ candidats: 1, examines: 1, aJour: 0, recalcules: 1, persistes: 1, degrades: 0 });
    expect(persister).toHaveBeenCalledWith(11430, 'E', VALEUR);
  });

  it('dossier DÉJÀ À JOUR (empreinte persistée == courante) → sauté, JAMAIS recalculé ni persisté', async () => {
    const calculer = vi.fn(async () => ({ valeur: VALEUR, cachable: true }));
    const persister = vi.fn(async () => {});
    const r = await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [7]),
      empreinteCourante: vi.fn(async () => ({ empreinte: 'MEME', piecesPdf: PIECES })),
      empreintePersistee: vi.fn(async () => 'MEME'),
      calculer, persister,
    }));
    expect(r).toMatchObject({ examines: 1, aJour: 1, recalcules: 0, persistes: 0 });
    expect(calculer).not.toHaveBeenCalled();
    expect(persister).not.toHaveBeenCalled();
  });

  it('empreinte PÉRIMÉE (persistée ≠ courante) → recalcule et persiste', async () => {
    const persister = vi.fn(async () => {});
    const r = await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [7]),
      empreinteCourante: vi.fn(async () => ({ empreinte: 'NEUVE', piecesPdf: PIECES })),
      empreintePersistee: vi.fn(async () => 'VIEILLE'),
      persister,
    }));
    expect(r).toMatchObject({ aJour: 0, recalcules: 1, persistes: 1 });
    expect(persister).toHaveBeenCalledWith(7, 'NEUVE', VALEUR);
  });

  it('GARDE echecTelechargement : calcul NON cachable → compté degrades, JAMAIS persisté', async () => {
    const persister = vi.fn(async () => {});
    const r = await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [7]),
      calculer: vi.fn(async () => ({ valeur: VALEUR, cachable: false })),
      persister,
    }));
    expect(r).toMatchObject({ recalcules: 1, persistes: 0, degrades: 1 });
    expect(persister).not.toHaveBeenCalled();
  });

  it('BUDGET atteint → interrompt la boucle avant la fin, en SÉRIE ; le reste sera repris au tick suivant', async () => {
    const persister = vi.fn(async () => {});
    // maintenant() : debut=0 ; dossier 1 → 0 (<budget, traité) ; dossier 2 → 100 (>=budget, coupe).
    const r = await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [1, 2, 3]),
      maintenant: horloge([0, 0, 100]),
      persister,
    }), { budgetMs: 100 });
    expect(r.candidats).toBe(3);
    expect(r.examines).toBe(1);
    expect(r.persistes).toBe(1);
    expect(r.interrompuBudget).toBe(true);
    expect(persister).toHaveBeenCalledTimes(1);
  });

  it('traite les candidats EN SÉRIE dans l’ordre fourni (ordre stable = reprise déterministe)', async () => {
    const vus: number[] = [];
    await executerPrecalculBestOf(makeDeps({
      listerCandidats: vi.fn(async () => [3, 5, 9]),
      empreinteCourante: vi.fn(async (d: number) => { vus.push(d); return { empreinte: `E${d}`, piecesPdf: PIECES }; }),
    }));
    expect(vus).toEqual([3, 5, 9]);
  });
});
