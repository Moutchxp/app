import { describe, it, expect } from 'vitest';
import { resumeCompletude } from './completudeResume';

const diag = (presences: boolean[]) => ({ diagnostic: { lignes: presences.map((presente) => ({ presente })) } });

describe('PERF-1 — resumeCompletude (bilan léger, pur)', () => {
  it('diagnostic jamais calculé (null) → statut « jamais », JAMAIS « incomplet »', () => {
    expect(resumeCompletude(null)).toEqual({ statut: 'jamais', manquantes: 0 });
  });

  it('des familles manquantes → « incomplet » + leur nombre (cas 7424 : 2 sur 4)', () => {
    expect(resumeCompletude(diag([true, false, true, false]))).toEqual({ statut: 'incomplet', manquantes: 2 });
  });

  it('toutes présentes → « complet », 0 manquante', () => {
    expect(resumeCompletude(diag([true, true, true, true]))).toEqual({ statut: 'complet', manquantes: 0 });
  });

  it('une seule manquante → « incomplet », 1', () => {
    expect(resumeCompletude(diag([true, false]))).toEqual({ statut: 'incomplet', manquantes: 1 });
  });
});
