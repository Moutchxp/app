/**
 * 🔴 LOT P — décision d'Arno du 22/10/2026 : en mode « Façade (snap) », les 61 faisceaux du SCORE sont centrés sur la normale
 * extérieure du mur de la fenêtre ; verdict, cartouches, vue nature, immobilier, patrimoine et nom de l'orientation restent
 * sur l'azimut choisi. Cas réel : 19 rue Louis Ulbach, Courbevoie, au point du banc d'essai d'Arno (terrain 44,1185 m, étage 4,
 * sous-plafond 2,50 m, azimut 229°). LECTURE SEULE. Valeurs mesurées sur la base de dev (comme le golden).
 * ⚠️ Sur dev, le LiDAR s'arrête 5 m à l'ouest du point : le verdict y est INDÉTERMINÉ (en prod : SANS VIS-À-VIS). On ne
 * fige donc pas le verdict ici, seulement son IDENTITÉ avec et sans pivot.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { construireEntree } from './pipeline';
import { analyser } from '../svv/analyse';
import { ecartAzimuts } from '../svv/murFenetre';
import { chargerProfilDegagement } from './profilConfig';
import { closePool } from './client';

afterAll(async () => { await closePool(); });

// Le point du banc d'Arno (retrouvé le 22/10/2026 : terrain 44,1185 m, score 47 avant le pivot), à 0,30 m du coin du décrochement.
const ULBACH = { point: { lat: 48.90190759540803, lon: 2.2634560643670985 }, azimutPrincipalDeg: 229, etage: 4, hauteurSousPlafondM: 2.5, dernierEtage: false };

describe('🔴 LOT P — 19 rue Louis Ulbach : l’éventail du score face à la façade', () => {
  it('mur retenu : la façade qui porte le point, normale 242,13° (écart 13,13° avec l’azimut choisi 229°)', async () => {
    const { validation, entree } = await construireEntree(ULBACH);
    expect(validation.altitudeTerrainOrigineM).toBeCloseTo(44.1185, 4);
    expect(entree!.pivot!.azimutNormaleDeg).toBeCloseTo(242.13299614843544, 6);
    expect(entree!.pivot!.azimutChoisiDeg).toBe(229);
    expect(entree!.pivot!.ecartDeg).toBeCloseTo(13.132996148435495, 6);
    // Aucun faisceau du score derrière le mur ; l'éventail de l'azimut choisi en avait 4 (−90° à −81°).
    const derriere = (az: number) => ecartAzimuts(az, entree!.pivot!.azimutNormaleDeg) > 90 + 1e-9;
    expect(entree!.faisceauxScore!.filter((f) => derriere(entree!.pivot!.azimutNormaleDeg + f.offsetDeg))).toHaveLength(0);
    expect(entree!.faisceaux.filter((f) => derriere(229 + f.offsetDeg)).length).toBeGreaterThan(0);
  });

  it('verdict et cartouches identiques avec et sans pivot ; score 45,43 (au lieu de 47,41)', async () => {
    const profil = await chargerProfilDegagement();
    const { entree } = await construireEntree(ULBACH);
    const apres = analyser(entree!, profil);
    const sansPivot = { ...entree!, faisceauxScore: undefined, pivot: undefined };
    const avant = analyser(sansPivot, profil);
    expect(apres.verdict).toEqual(avant.verdict);
    expect(apres.contexteDegagement).toBe(avant.contexteDegagement);
    expect(apres.contexteVueNature).toBe(avant.contexteVueNature);
    expect(apres.contexteImmobilier).toBe(avant.contexteImmobilier);
    expect(apres.monumentsHistoriques).toEqual(avant.monumentsHistoriques);
    expect(avant.score.total).toBeCloseTo(47.4116, 3);
    expect(apres.score.total).toBeCloseTo(45.4317, 3);
  });
});
