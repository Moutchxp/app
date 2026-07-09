/**
 * Test d'intégration golden — pipeline d'analyse Sans Vis-à-Vis® (vraie connexion PostGIS).
 *
 * Valeurs figées sur les rasters LiDAR locaux (mns_lidar_brut / mnt_lidar_brut /
 * bdtopo_batiment) ; à recalibrer si ces données changent.
 *
 * Lancé uniquement via `npm run test:integration` (motif *.itest.ts) ; exclu du
 * `npm test` unitaire (include *.test.ts dans vitest.config.ts).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { analyserAdresse } from './pipeline';
import { closePool } from './client';
import type { ProfilDegagement } from '../svv/profilDegagement';
import { clonerProfil } from '../svv/profilTest';
import { comparerProfils } from './bancEssai';

/**
 * Config de scoring GELÉE de référence — snapshot EXACT des valeurs qui SCELLENT le golden
 * (identiques aujourd'hui au seed de la migration 003 et à PROFIL_DEGAGEMENT_DEFAUT).
 *
 * DÉCOUPLE le golden de deux sources mouvantes : (1) la ligne LIVE `config_scoring id=1`
 * éditable par l'admin (pilotage sans code) ; (2) `PROFIL_DEGAGEMENT_DEFAUT` (profil de REPLI,
 * susceptible d'évoluer). Constante INDÉPENDANTE : ne PAS la faire pointer vers l'un ou l'autre.
 * Vit dans ce fichier `.itest.ts` → jamais embarquée dans le bundle de prod.
 * Ré-synchroniser UNIQUEMENT lors d'un rescellage VOLONTAIRE du golden (commit séparé).
 * Réf : docs/SPEC_decouplage_golden_reference.md.
 */
const PROFIL_GOLDEN_REF: ProfilDegagement = {
  boostF2: 0.3,
  boostF4: 2.5,
  forfaitConeCentral: 300,
  forfaitExtremites: 200,
  coneF3DemiAngleDeg: 60,
  distanceMaxM: 200,
  plafondCouche1: 90,
  plafondDegagement: 80,
  modeCombinaison: 'sequentiel',
  modeCombinaisonRepli: 'addition',
  couloirSeuilLateralM: 3,
  couloirFenetreConditionN: 16,
  couloirToleranceBordN: 2,
  couloirMalusPct: 0.01,
  naturesRemarquables: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'],
  coneFamilleDemiAngleDeg: 60,
  famillesPonderation: {
    mondialFaisceauM: 800,
    mh: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
    inventaire: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
  },
  famillesAnnee: [
    { borneMin: null, opMin: null, borneMax: 1900, opMax: '<=', cone: 1.5, flanc: 1.2, distMaxM: 300 },
    { borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=', cone: 1.2, flanc: 1.1, distMaxM: 200 },
  ],
  cumulNature: { seuilMinM: 30, baseM: 25, pasM: 5, increment: 0.1, plafond: 2.0, capP1M: 200 },
  orientationPts: { N: 0, NE: 1, E: 5, SE: 8, S: 10, SO: 9, O: 7, NO: 3 },
  analysisRangeM: 200,
};

afterAll(async () => {
  await closePool();
});

describe('analyserAdresse — golden 8 rue Denfert-Rochereau (Asnières)', () => {
  it('cas POSITIF : point intérieur → SANS_VIS_A_VIS, terrain MNT, obstacle LiDAR', async () => {
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: PROFIL_GOLDEN_REF, // golden découplé de config_scoring live (SPEC_decouplage_golden_reference)
    });

    // Origine validée + terrain lu sur le MNT AU POINT SNAPPÉ (≈ 41.570 ; ancien brut : 41.590).
    // Re-gelé en S2/S3 : valeurs au point snappé (chantier snap origine).
    expect(validation.valide).toBe(true);
    expect(validation.altitudeTerrainOrigineM).toBeCloseTo(41.57033157348633, 2);

    // Verdict géométrique figé.
    expect(resultat).not.toBeNull();
    expect(resultat!.verdict.verdict).toBe('SANS_VIS_A_VIS');
    expect(resultat!.verdict.distanceM).toBeCloseTo(42.100339602923526, 2);
    expect(resultat!.verdict.obstacle?.source).toBe('LIDAR_HD');

    // golden = note Couche 1 /80 (distances PERÇUES boostées F2/F3/F4 sur les 61 faisceaux).
    // Couche 2 (Exception) non implémentée → non ajoutée. Verdict (ci-dessus) inchangé.
    // F4 additif boostF4=2.5 + fallback MNS (bâti BD TOPO sans hauteur → toit LiDAR, côté SCORE seul).
    // Verdict (balayage) INCHANGÉ. (Avant fallback MNS : 27.390194425537956.)
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
  });

  it('BE-19 : le seam verbeux (opt-in) ne bouge PAS le golden — ventilation.note.total = score.total, 61 lignes', async () => {
    const { resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: PROFIL_GOLDEN_REF,
      ventilation: true, // OPT-IN : joint la ventilation par faisceau
    });
    expect(resultat).not.toBeNull();
    // Golden INCHANGÉ malgré l'opt-in (le seam est additif, dérivé du même calcul).
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
    // Ventilation présente, 61 faisceaux.
    expect(resultat!.ventilation).toBeDefined();
    expect(resultat!.ventilation!.lignes).toHaveLength(61);
    // Reconstruction BIT-IDENTIQUE : l'agrégat du seam est la SEULE source de la note (délégation).
    expect(resultat!.ventilation!.note.total).toBe(resultat!.score.total);
    // Chaque ligne porte la valeur brute (nullable) + perçue + la borne du profil.
    for (const l of resultat!.ventilation!.lignes) {
      expect(typeof l.distancePercueM).toBe('number');
      expect(typeof l.seuilBorneM).toBe('number');
    }
  });

  it('BE-19bis : sans opt-in, resultat.ventilation est absent (chemin de prod inchangé)', async () => {
    const { resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: PROFIL_GOLDEN_REF,
    });
    expect(resultat).not.toBeNull();
    expect(resultat!.ventilation).toBeUndefined();
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
  });

  it('seam ENRICHI : Asnières inchangé (note.total === score.total) + champs descriptifs cohérents', async () => {
    const { resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: PROFIL_GOLDEN_REF,
      ventilation: true,
    });
    expect(resultat).not.toBeNull();
    // Golden inchangé + reconstruction STRICTE non altérée par l'enrichissement descriptif.
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
    expect(resultat!.ventilation!.note.total).toBe(resultat!.score.total);
    // Champs descriptifs présents et cohérents avec la famille appliquée (après précédence).
    for (const l of resultat!.ventilation!.lignes) {
      expect(typeof l.dansChaineCouloir).toBe('boolean');
      // Carte d'année présente SSI la famille appliquée est 'annee'.
      if (l.famille === 'annee') expect(l.carteAnnee).not.toBeNull();
      else expect(l.carteAnnee).toBeNull();
      // Libellé de famille présent SSI famille patrimoniale (mh/inventaire/mondial), « famille » sinon null.
      if (l.famille === 'mh' || l.famille === 'inventaire' || l.famille === 'mondial') {
        expect(typeof l.familleLibelle).toBe('string');
      } else {
        expect(l.familleLibelle).toBeNull();
      }
    }
    // Cohérence couloir : tout faisceau marqué dansChaineCouloir appartient à une chaîne validée agrégée.
    const indices = new Set<number>();
    for (const c of resultat!.ventilation!.note.malusCouloir) {
      if (c.validee) for (const i of c.indices) indices.add(i);
    }
    resultat!.ventilation!.lignes.forEach((l, i) => {
      expect(l.dansChaineCouloir).toBe(indices.has(i));
    });
  });

  it('BE-20 : profil de test = CLONE du profil actif → MÊME score (décorrélation neutre) + actif non muté', async () => {
    const clone = clonerProfil(PROFIL_GOLDEN_REF);
    const { resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: clone,
    });
    expect(resultat).not.toBeNull();
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
    // Immutabilité : muter le clone APRÈS coup ne touche jamais le profil de référence.
    clone.boostF4 = 999;
    clone.famillesAnnee[0].cone = 42;
    expect(PROFIL_GOLDEN_REF.boostF4).toBe(2.5);
    expect(PROFIL_GOLDEN_REF.famillesAnnee[0].cone).toBe(1.5);
  });

  it('BE-20 : muter une variable VIVE du profil de test change le score, SANS toucher le profil actif', async () => {
    const clone = clonerProfil(PROFIL_GOLDEN_REF);
    clone.plafondDegagement = clone.plafondDegagement * 2; // VIVE : double le coefficient de dégagement
    const params = {
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
    } as const;
    const rTest = (await analyserAdresse({ ...params, profil: clone })).resultat;
    const rActif = (await analyserAdresse({ ...params, profil: PROFIL_GOLDEN_REF })).resultat;
    expect(rActif!.score.total).toBeCloseTo(29.107259068449615, 3); // actif inchangé
    expect(rTest!.score.total).not.toBeCloseTo(29.107259068449615, 3); // test décorrélé
  });

  it('CA-2.6 : muter une variable VESTIGIALE (boostF2) du profil de test ne change PAS le score', async () => {
    const clone = clonerProfil(PROFIL_GOLDEN_REF);
    clone.boostF2 = 5; // VESTIGIALE : non consultée par le moteur → sans effet
    const { resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: clone,
    });
    expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);
  });

  it('BE-50/50bis + CA-5.2 : comparerProfils, profil de test = clone du profil actif → deux scores identiques (= golden), delta 0', async () => {
    const comp = await comparerProfils({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
      profil: PROFIL_GOLDEN_REF, // profil ACTIF = réf gelée ; test = clone (aucun profilTest fourni)
    });
    expect(comp.ok).toBe(true);
    // Chemin banc (build entree ×1 + analyser ×2) → MÊME golden, bit-identique.
    expect(comp.actif!.score.total).toBeCloseTo(29.107259068449615, 3);
    expect(comp.test!.score.total).toBe(comp.actif!.score.total); // profil test == actif → identiques
    expect(comp.delta).toBe(0);
    expect(comp.verdictIdentique).toBe(true);
    expect(comp.ecarts!.total).toBe(0);
    // Ventilation (seam Lot 1) exposée pour les DEUX runs.
    expect(comp.actif!.ventilation.lignes).toHaveLength(61);
    expect(comp.test!.ventilation.lignes).toHaveLength(61);
  });

  it('CA-5.3 + BE-56 : un profil de test avec une variable VIVE modifiée change le score du TEST, pas de l’actif ; verdict identique', async () => {
    const profilTest = clonerProfil(PROFIL_GOLDEN_REF);
    profilTest.plafondDegagement = profilTest.plafondDegagement * 2; // VIVE : double le coefficient de dégagement
    const comp = await comparerProfils(
      {
        point: { lat: 48.90693182287072, lon: 2.269431435588249 },
        azimutPrincipalDeg: 90,
        etage: 2,
        dernierEtage: false,
        profil: PROFIL_GOLDEN_REF,
      },
      profilTest,
    );
    expect(comp.ok).toBe(true);
    expect(comp.actif!.score.total).toBeCloseTo(29.107259068449615, 3); // actif INCHANGÉ
    expect(comp.test!.score.total).not.toBeCloseTo(29.107259068449615, 3); // test décorrélé
    expect(comp.delta).not.toBe(0);
    expect(comp.verdictIdentique).toBe(true); // verdict 100 % géométrique → identique quoi qu'il arrive
    expect(comp.ecarts!.scalaires.some((e) => e.champ === 'plafondDegagement')).toBe(true);
  });

  it('cas NÉGATIF : point « rue » hors emprise → valide=false, resultat=null (HORS_BATIMENT)', async () => {
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.907093686290544, lon: 2.2694291636998782 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
    });

    expect(validation.valide).toBe(false);
    expect(resultat).toBeNull();
    // ValidationOrigine n'expose PAS de champ `statut` (dérivé uniquement dans /api/origine).
    // Sémantique HORS_BATIMENT = invalide MAIS un bâtiment existe à proximité
    // → distance finie (≠ Infinity, qui signalerait SANS_BATIMENT).
    expect(Number.isFinite(validation.distanceAuBatimentM)).toBe(true);
  });

  it('cas INDÉTERMINÉ : couloir sortant de la couverture LiDAR avant 40 m → INDETERMINE', async () => {
    // Origine couverte (MNS+MNT) dans bdtopo_batiment 486669, à ~2,2 m du bord Nord des dalles ;
    // couloir plein Nord → sort de la couverture à 2,20 m → < 6 lignes couvertes → aucune fenêtre
    // d'obstacle possible → trou de données < 40 m avant tout obstacle → INDÉTERMINÉ.
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.90977883617502, lon: 2.274351016683915 },
      azimutPrincipalDeg: 0,
      etage: 0,
      dernierEtage: false,
    });

    // L'origine est VALIDE (terrain MNT lu) : l'INDÉTERMINÉ vient du couloir, pas de l'origine.
    expect(validation.valide).toBe(true);
    expect(validation.altitudeTerrainOrigineM).not.toBeNull();

    expect(resultat).not.toBeNull();
    expect(resultat!.verdict.verdict).toBe('INDETERMINE');
    // distanceM = 0 : sentinelle du mapping INDETERMINE (obstaclesParBalayage → premierObstacle).
    expect(resultat!.verdict.distanceM).toBe(0);
  });
});
