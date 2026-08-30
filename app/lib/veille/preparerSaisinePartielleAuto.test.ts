import { describe, it, expect } from 'vitest';
import { executerPreparationSaisinePartielle, type DepsPreparationSaisinePartielle } from './preparerSaisinePartielleAuto';

function deps(over: { candidats: number[]; preparees?: number[]; ignorees?: number[]; erreurSur?: number[] }): { deps: DepsPreparationSaisinePartielle; prepares: number[] } {
  const prepares: number[] = [];
  return {
    prepares,
    deps: {
      candidats: async () => over.candidats,
      preparer: async (id) => {
        if (over.erreurSur?.includes(id)) throw new Error('boom');
        if (over.ignorees?.includes(id)) return 'ignoree';
        prepares.push(id);
        return 'preparee';
      },
    },
  };
}

describe('PART-F ②③ — executerPreparationSaisinePartielle (prépare le brouillon, jamais d’envoi)', () => {
  it('aucun candidat → rien', async () => {
    const d = deps({ candidats: [] });
    expect(await executerPreparationSaisinePartielle(d.deps)).toEqual({ candidats: 0, preparees: 0, ignorees: 0, erreurs: 0 });
  });

  it('prépare chaque demande partielle saisissable', async () => {
    const d = deps({ candidats: [1, 2, 3] });
    const bilan = await executerPreparationSaisinePartielle(d.deps);
    expect(bilan).toEqual({ candidats: 3, preparees: 3, ignorees: 0, erreurs: 0 });
    expect(d.prepares).toEqual([1, 2, 3]);
  });

  it('refus métier (déjà en cours / non éligible) → IGNORÉ, pas une erreur', async () => {
    const d = deps({ candidats: [1, 2, 3], ignorees: [2] });
    const bilan = await executerPreparationSaisinePartielle(d.deps);
    expect(bilan).toEqual({ candidats: 3, preparees: 2, ignorees: 1, erreurs: 0 });
    expect(d.prepares).toEqual([1, 3]);
  });

  it('isolation : un échec inattendu n’arrête pas les suivantes', async () => {
    const d = deps({ candidats: [1, 2, 3], erreurSur: [1] });
    const bilan = await executerPreparationSaisinePartielle(d.deps);
    expect(bilan).toEqual({ candidats: 3, preparees: 2, ignorees: 0, erreurs: 1 });
    expect(d.prepares).toEqual([2, 3]);
  });
});
