import { describe, it, expect } from 'vitest';
import { executerDiagnosticsVague, type CandidatVague, type DepsDiagnosticsVague } from './diagnosticsVague';

/** Deps de test : horloge figée, calme réglable, candidats fournis, `recalculer` note les dossiers diagnostiqués. */
function deps(over: { candidats: CandidatVague[]; calme?: number; now?: string; recalcErreurSur?: number[] }): { deps: DepsDiagnosticsVague; recalcules: number[] } {
  const recalcules: number[] = [];
  return {
    recalcules,
    deps: {
      maintenant: () => new Date(over.now ?? '2026-08-30T10:10:00Z'),
      calmeMinutes: async () => over.calme ?? 10,
      candidats: async () => over.candidats,
      recalculer: async (dossierId) => {
        if (over.recalcErreurSur?.includes(dossierId)) throw new Error('recalc KO');
        recalcules.push(dossierId);
      },
    },
  };
}

const cand = (dossierId: number, dernierMailLe: string | null): CandidatVague => ({ dossierId, demandeId: dossierId * 10, dernierMailLe: dernierMailLe ? new Date(dernierMailLe) : null });

describe('PART-C — executerDiagnosticsVague', () => {
  it('aucun candidat → aucun diagnostic', async () => {
    const { deps: d, recalcules } = deps({ candidats: [] });
    expect(await executerDiagnosticsVague('auto', d)).toEqual({ examines: 0, diagnostiques: 0, differes: 0, erreurs: 0 });
    expect(recalcules).toEqual([]);
  });

  it('AUTO : diagnostique les vagues CLOSES (dernier mail calme), REPORTE celles encore actives — un seul diagnostic par vague', async () => {
    const { deps: d, recalcules } = deps({
      now: '2026-08-30T10:10:00Z', calme: 10,
      candidats: [cand(1, '2026-08-30T09:00:00Z'), cand(2, '2026-08-30T10:08:00Z'), cand(3, null)], // 1 calme, 2 en cours (2 min), 3 sans mail
    });
    const bilan = await executerDiagnosticsVague('auto', d);
    expect(bilan).toEqual({ examines: 3, diagnostiques: 2, differes: 1, erreurs: 0 });
    expect(recalcules.sort()).toEqual([1, 3]); // 2 est reporté (vague pas close)
  });

  it('MANUEL : diagnostique TOUT immédiatement, même vague en cours (échappatoire d’Arno)', async () => {
    const { deps: d, recalcules } = deps({
      now: '2026-08-30T10:10:00Z', calme: 10,
      candidats: [cand(1, '2026-08-30T10:09:30Z'), cand(2, '2026-08-30T10:08:00Z')], // les deux < 10 min
    });
    const bilan = await executerDiagnosticsVague('manuel', d);
    expect(bilan).toEqual({ examines: 2, diagnostiques: 2, differes: 0, erreurs: 0 });
    expect(recalcules.sort()).toEqual([1, 2]);
  });

  it('isolation : un dossier en échec de diagnostic n’interrompt pas les suivants', async () => {
    const { deps: d, recalcules } = deps({
      now: '2026-08-30T10:10:00Z', calme: 10, recalcErreurSur: [1],
      candidats: [cand(1, '2026-08-30T08:00:00Z'), cand(2, '2026-08-30T08:00:00Z')],
    });
    const bilan = await executerDiagnosticsVague('auto', d);
    expect(bilan).toEqual({ examines: 2, diagnostiques: 1, differes: 0, erreurs: 1 });
    expect(recalcules).toEqual([2]);
  });
});
