import { describe, it, expect } from 'vitest';
import {
  detecterRattachement,
  type EntreesRattachement, type SeuilsRattachement, type CorpsPermis, type PolygoneEmpreinte, type ParcelleCandidate,
} from './detectionRattachement';

/**
 * FUS-2 — le moteur PUR de rattachement, éprouvé sur les CINQ situations de la spec (les deux régimes × les trois issues) plus
 * les cas d'arbitrage particuliers (cardinalité, altitudes égales/distinctes, discriminant par étages). Aucune I/O : entrées
 * synthétiques déjà mesurées → sortie déterministe.
 */
const SEUILS: SeuilsRattachement = { seuilSurface: 0.8, seuilBordure: 0.6, margeAltitudeM: 0.1 };

const corps = (o: Partial<CorpsPermis> = {}): CorpsPermis => ({ repere: '2D1', altitudeSommetNgf: 88.91, nbEtages: null, ...o });
const poly = (o: Partial<PolygoneEmpreinte> = {}): PolygoneEmpreinte => ({ cleabs: 'BATIMENT0001', etat: 'nouveau', nbEtages: null, altitudeMaxToit: null, ...o });
const candidate = (o: Partial<ParcelleCandidate> = {}): ParcelleCandidate => ({ idu: '75120000DZ0099', ratioSurface: 0.95, partBordure: 0.9, ...o });

const base = (o: Partial<EntreesRattachement> = {}): EntreesRattachement => ({
  empreinteComplete: true, parcellesOrigineToujoursLa: true, parcelleCandidate: null,
  polygones: [], corpsPermis: [], seuils: SEUILS, ...o,
});

describe('detecterRattachement — régimes et issues', () => {
  it('AVEC fusion : surface+bordure franchis, 1 polygone nouveau, 1 corps → RATTACHEMENT_AUTOMATIQUE', () => {
    const r = detecterRattachement(base({
      parcellesOrigineToujoursLa: false, parcelleCandidate: candidate(), polygones: [poly()], corpsPermis: [corps()],
    }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.regime).toBe('avec_fusion');
    expect(r.criteres.surface).toMatchObject({ applicable: true, franchi: true });
    expect(r.criteres.bordure).toMatchObject({ applicable: true, franchi: true });
    expect(r.criteres.bati.franchi).toBe(true);
    expect(r.preuves.join(' ')).toMatch(/surface :.*empreinte recouverte/);
    expect(r.preuves.join(' ')).toMatch(/1 polygone nouveau/);
  });

  it('SANS fusion : la surface ne bouge pas, 1 polygone nouveau est le SEUL signal → RATTACHEMENT_AUTOMATIQUE (pas « rien »)', () => {
    const r = detecterRattachement(base({
      parcellesOrigineToujoursLa: true, polygones: [poly()], corpsPermis: [corps()],
    }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.regime).toBe('sans_fusion');
    expect(r.criteres.surface.applicable).toBe(false); // surface non applicable sans fusion
    expect(r.criteres.bordure.applicable).toBe(false);
    expect(r.criteres.bati.franchi).toBe(true);
  });

  it('plusieurs polygones, corps d’altitudes distinctes au-delà de la marge, pas d’étages BD TOPO → ARBITRAGE_DEMANDE', () => {
    const r = detecterRattachement(base({
      polygones: [poly({ cleabs: 'A' }), poly({ cleabs: 'B' })],
      corpsPermis: [corps({ repere: '2D1', altitudeSommetNgf: 88.91 }), corps({ repere: '2D2', altitudeSommetNgf: 87.13 })],
    }));
    expect(r.verdict).toBe('ARBITRAGE_DEMANDE');
    expect(r.motif).toMatch(/altitudes distinctes/);
  });

  it('plusieurs corps d’altitudes ÉGALES à la marge près → RATTACHEMENT_AUTOMATIQUE (ordre d’affectation indifférent)', () => {
    const r = detecterRattachement(base({
      polygones: [poly({ cleabs: 'A' }), poly({ cleabs: 'B' })],
      corpsPermis: [corps({ altitudeSommetNgf: 88.90 }), corps({ altitudeSommetNgf: 88.95 })], // diff 0,05 ≤ 0,10
    }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.motif).toMatch(/identiques à la marge/);
  });

  it('RIEN : sans fusion et aucun bâti nouveau (terrain nu, en attente) → aucun critère franchi', () => {
    const r = detecterRattachement(base({ parcellesOrigineToujoursLa: true, polygones: [], corpsPermis: [corps(), corps()] }));
    expect(r.verdict).toBe('RIEN');
    expect(r.regime).toBe('sans_fusion');
    expect(r.motif).toMatch(/aucun signal \(en attente\)/);
  });
});

describe('detecterRattachement — arbitrages et bonus', () => {
  it('cardinalité : 2 corps déclarés mais 1 seul polygone → ARBITRAGE_DEMANDE', () => {
    const r = detecterRattachement(base({ polygones: [poly()], corpsPermis: [corps({ repere: '2D1' }), corps({ repere: '2D2' })] }));
    expect(r.verdict).toBe('ARBITRAGE_DEMANDE');
    expect(r.motif).toMatch(/1 seul polygone/);
  });

  it('cardinalité : 1 corps pour 2 polygones → ARBITRAGE_DEMANDE', () => {
    const r = detecterRattachement(base({ polygones: [poly({ cleabs: 'A' }), poly({ cleabs: 'B' })], corpsPermis: [corps()] }));
    expect(r.verdict).toBe('ARBITRAGE_DEMANDE');
    expect(r.motif).toMatch(/2 polygones/);
  });

  it('bonus rare : 2 polygones, étages BD TOPO présents/distincts/concordants avec les corps → RATTACHEMENT_AUTOMATIQUE', () => {
    const r = detecterRattachement(base({
      polygones: [poly({ cleabs: 'A', nbEtages: 5 }), poly({ cleabs: 'B', nbEtages: 8 })],
      corpsPermis: [corps({ altitudeSommetNgf: 88.91, nbEtages: 8 }), corps({ altitudeSommetNgf: 87.13, nbEtages: 5 })],
    }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.motif).toMatch(/étages BD TOPO/);
  });

  it('un polygone MODIFIÉ (rénovation qui étend l’emprise) compte comme signal → RATTACHEMENT_AUTOMATIQUE', () => {
    const r = detecterRattachement(base({ polygones: [poly({ etat: 'modifie' })], corpsPermis: [corps()] }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.preuves.join(' ')).toMatch(/1 polygone modifie/);
  });

  it('empreinte incomplète → RIEN / régime indéterminé, quels que soient les polygones', () => {
    const r = detecterRattachement(base({ empreinteComplete: false, polygones: [poly()], corpsPermis: [corps()] }));
    expect(r.verdict).toBe('RIEN');
    expect(r.regime).toBe('indetermine');
    expect(r.motif).toMatch(/empreinte incomplète/);
  });

  it('AVEC fusion mais surface sous le seuil et aucun bâti → RIEN (candidate non concluante)', () => {
    const r = detecterRattachement(base({
      parcellesOrigineToujoursLa: false, parcelleCandidate: candidate({ ratioSurface: 0.5, partBordure: 0.3 }),
      polygones: [], corpsPermis: [corps()],
    }));
    expect(r.verdict).toBe('RIEN');
    expect(r.regime).toBe('avec_fusion');
    expect(r.criteres.surface.franchi).toBe(false);
  });

  it('AVEC fusion : surface+bordure franchis mais AUCUN bâti encore → RATTACHEMENT_AUTOMATIQUE (fusion parcellaire seule)', () => {
    const r = detecterRattachement(base({
      parcellesOrigineToujoursLa: false, parcelleCandidate: candidate(), polygones: [], corpsPermis: [corps(), corps()],
    }));
    expect(r.verdict).toBe('RATTACHEMENT_AUTOMATIQUE');
    expect(r.motif).toMatch(/fusion cadastrale concluante/);
  });

  it('seuil de surface piloté : une candidate à 82 % passe à 80 % mais échoue à 90 %', () => {
    const e = (seuil: number) => detecterRattachement(base({
      parcellesOrigineToujoursLa: false, parcelleCandidate: candidate({ ratioSurface: 0.82, partBordure: 0.9 }),
      polygones: [poly()], corpsPermis: [corps()], seuils: { ...SEUILS, seuilSurface: seuil },
    }));
    expect(e(0.8).criteres.surface.franchi).toBe(true);
    expect(e(0.9).criteres.surface.franchi).toBe(false);
    expect(e(0.9).verdict).toBe('RATTACHEMENT_AUTOMATIQUE'); // le bâti (1 polygone) suffit même si la surface échoue
  });
});
