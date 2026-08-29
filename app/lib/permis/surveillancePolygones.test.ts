import { describe, it, expect } from 'vitest';
import { surveillerPolygones, type EntreeSurveillance } from './surveillancePolygones';

/**
 * SURV-1 — moteur PUR de surveillance des polygones après validation. Faits synthétiques : aucun dossier réel n'est validé aujourd'hui
 * (0 en fenêtre), donc ces cas construisent des entrées à la main. On éprouve : nouveau / disparu / contour au-delà et en deçà de la
 * tolérance / hors fenêtre / anti-doublon / indifférence manuel-vs-auto.
 */
const entree = (over: Partial<EntreeSurveillance> = {}): EntreeSurveillance => ({
  footprintsValides: [{ cleabs: 'A' }, { cleabs: 'B' }],
  footprintsCourants: [
    { cleabs: 'A', changementRelatif: 0 },
    { cleabs: 'B', changementRelatif: 0 },
  ],
  toleranceContourPct: 0,
  fenetreJours: 730,
  dateValidation: '2026-01-01',
  aujourdhui: '2026-08-29',
  dejaAlertes: [],
  ...over,
});

describe('surveillerPolygones', () => {
  it('aucun changement (mêmes polygones, contour identique) → aucune alerte', () => {
    expect(surveillerPolygones(entree())).toEqual([]);
  });

  it('polygone NOUVEAU (présent aujourd’hui, absent de la référence) → alerte nouveau', () => {
    const r = surveillerPolygones(
      entree({
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0 },
          { cleabs: 'B', changementRelatif: 0 },
          { cleabs: 'C', changementRelatif: null }, // apparu
        ],
      }),
    );
    expect(r).toEqual([{ cleabs: 'C', type: 'nouveau' }]);
  });

  it('polygone DISPARU (dans la référence, absent aujourd’hui) → alerte disparu', () => {
    const r = surveillerPolygones(
      entree({ footprintsCourants: [{ cleabs: 'A', changementRelatif: 0 }] }), // B disparu
    );
    expect(r).toEqual([{ cleabs: 'B', type: 'disparu' }]);
  });

  it('CONTOUR modifié AU-DELÀ de la tolérance → alerte contour_modifie', () => {
    const r = surveillerPolygones(
      entree({
        toleranceContourPct: 2, // seuil 0,02
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0.03 }, // 3 % > 2 %
          { cleabs: 'B', changementRelatif: 0 },
        ],
      }),
    );
    expect(r).toEqual([{ cleabs: 'A', type: 'contour_modifie' }]);
  });

  it('CONTOUR modifié EN DEÇÀ de la tolérance → ignoré', () => {
    const r = surveillerPolygones(
      entree({
        toleranceContourPct: 2, // seuil 0,02
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0.01 }, // 1 % < 2 %
          { cleabs: 'B', changementRelatif: 0 },
        ],
      }),
    );
    expect(r).toEqual([]);
  });

  it('CONTOUR strictement ÉGAL au seuil → ignoré (« au-delà » = strictement supérieur)', () => {
    const r = surveillerPolygones(
      entree({
        toleranceContourPct: 2, // seuil 0,02
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0.02 }, // exactement le seuil
          { cleabs: 'B', changementRelatif: 0 },
        ],
      }),
    );
    expect(r).toEqual([]);
  });

  it('tolérance 0 (défaut) → tout écart de contour strictement positif alerte', () => {
    const r = surveillerPolygones(
      entree({
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0.0001 }, // minuscule mais > 0
          { cleabs: 'B', changementRelatif: 0 },
        ],
      }),
    );
    expect(r).toEqual([{ cleabs: 'A', type: 'contour_modifie' }]);
  });

  it('HORS FENÊTRE (aujourd’hui > validation + fenêtre) → aucune alerte, quelle que soit l’ampleur', () => {
    const r = surveillerPolygones(
      entree({
        dateValidation: '2026-01-01',
        fenetreJours: 730, // fin de fenêtre = 2028-01-01
        aujourdhui: '2028-06-01', // après la fenêtre
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: 0.9 }, // changement massif ignoré : hors fenêtre
          { cleabs: 'Z', changementRelatif: null }, // nouveau ignoré : hors fenêtre
        ],
      }),
    );
    expect(r).toEqual([]);
  });

  it('DERNIER jour de fenêtre (aujourd’hui = validation + fenêtre) → encore surveillé', () => {
    const r = surveillerPolygones(
      entree({
        dateValidation: '2026-01-01',
        fenetreJours: 730, // fin de fenêtre = 2028-01-01
        aujourdhui: '2028-01-01', // pile le dernier jour
        footprintsCourants: [{ cleabs: 'A', changementRelatif: 0 }], // B disparu
      }),
    );
    expect(r).toEqual([{ cleabs: 'B', type: 'disparu' }]);
  });

  it('date de VALIDATION absente → aucune surveillance (pas de base pour situer la fenêtre)', () => {
    expect(surveillerPolygones(entree({ dateValidation: null }))).toEqual([]);
    expect(surveillerPolygones(entree({ dateValidation: undefined }))).toEqual([]);
    expect(surveillerPolygones(entree({ dateValidation: '' }))).toEqual([]);
  });

  it('{dossier, cleabs, type} DÉJÀ alerté → pas de doublon', () => {
    const r = surveillerPolygones(
      entree({
        footprintsCourants: [{ cleabs: 'A', changementRelatif: 0 }], // B disparu…
        dejaAlertes: [{ cleabs: 'B', type: 'disparu' }], // …mais déjà signalé
      }),
    );
    expect(r).toEqual([]);
  });

  it('anti-doublon ciblé sur le TYPE : un autre type du même cleabs alerte encore', () => {
    // 'A' déjà alerté en 'contour_modifie' ; ici 'A' devient nouveau (absent de la référence) → alerte quand même.
    const r = surveillerPolygones(
      entree({
        footprintsValides: [{ cleabs: 'B' }],
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: null }, // nouveau
          { cleabs: 'B', changementRelatif: 0 },
        ],
        dejaAlertes: [{ cleabs: 'A', type: 'contour_modifie' }],
      }),
    );
    expect(r).toEqual([{ cleabs: 'A', type: 'nouveau' }]);
  });

  it('plusieurs changements simultanés → triés de façon déterministe (cleabs puis type)', () => {
    const r = surveillerPolygones(
      entree({
        toleranceContourPct: 0,
        footprintsValides: [{ cleabs: 'B' }, { cleabs: 'D' }],
        footprintsCourants: [
          { cleabs: 'A', changementRelatif: null }, // nouveau
          { cleabs: 'B', changementRelatif: 0.5 }, // contour_modifie
          // D disparu
        ],
      }),
    );
    expect(r).toEqual([
      { cleabs: 'A', type: 'nouveau' },
      { cleabs: 'B', type: 'contour_modifie' },
      { cleabs: 'D', type: 'disparu' },
    ]);
  });

  it('cleabs vides ignorés de part et d’autre (sans identité, aucune comparaison)', () => {
    const r = surveillerPolygones(
      entree({
        footprintsValides: [{ cleabs: 'B' }, { cleabs: '  ' }],
        footprintsCourants: [
          { cleabs: 'B', changementRelatif: 0 },
          { cleabs: '', changementRelatif: null },
        ],
      }),
    );
    expect(r).toEqual([]);
  });

  it('indifférent au canal de validation : mêmes faits (manuelle OU auto) → même décision', () => {
    // Le module ne connaît PAS l'auteur de la validation : il ne consomme que la DATE. Une validation 'moteur:auto' produit
    // exactement les mêmes alertes qu'une validation humaine dès lors que la date et les footprints sont identiques.
    const faits = {
      footprintsCourants: [
        { cleabs: 'A', changementRelatif: 0 },
        { cleabs: 'B', changementRelatif: 0 },
        { cleabs: 'C', changementRelatif: null }, // nouveau
      ],
    };
    expect(surveillerPolygones(entree(faits))).toEqual([{ cleabs: 'C', type: 'nouveau' }]);
  });
});
