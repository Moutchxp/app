import { describe, it, expect } from 'vitest';
import { resumeCompletude, doitRecalculerAuto } from './completudeResume';

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

describe('PERF-2 — doitRecalculerAuto (déclenchement + anti-boucle, pur)', () => {
  it('diagnostic périmé (GED changée) ET pas encore lancé → OUI', () => {
    expect(doitRecalculerAuto({ perime: true }, false)).toBe(true);
  });

  it('diagnostic à jour (perime false) → NON, même pas encore lancé', () => {
    expect(doitRecalculerAuto({ perime: false }, false)).toBe(false);
  });

  it('ANTI-BOUCLE : déjà lancé → NON, même si toujours périmé (échec / péremption persistante)', () => {
    expect(doitRecalculerAuto({ perime: true }, true)).toBe(false);
  });

  it('jamais analysé (null) → NON (on n’invente pas un 1er calcul en arrière-plan)', () => {
    expect(doitRecalculerAuto(null, false)).toBe(false);
  });
});
