import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAS_GOLDEN, PROFIL_GOLDEN_DIAG, SCORE_GOLDEN, jsonStable, normaliserPourJson, sqlNormalise } from './diagGolden';

/**
 * LOT DIAGNOSTIC-GOLDEN — l'outil `scripts/diag-golden.ts` ne vaut que s'il rejoue EXACTEMENT le golden et s'il imprime
 * les nombres SANS les arrondir. Ces épreuves tiennent les deux, sans base.
 */
const ITEST = readFileSync('app/lib/db/pipeline.itest.ts', 'utf8');

describe('le cas rejoué est EXACTEMENT celui du golden', () => {
  it('PROFIL_GOLDEN_DIAG est identique, clé par clé, au PROFIL_GOLDEN_REF de pipeline.itest.ts', () => {
    const debut = ITEST.indexOf('const PROFIL_GOLDEN_REF: ProfilDegagement = {');
    expect(debut).toBeGreaterThan(-1);
    const corps = ITEST.slice(ITEST.indexOf('{', debut), ITEST.indexOf('\n};', debut) + 2);
    // Littéral pur (aucune référence externe) : on l'évalue tel qu'écrit dans le fichier de test.
    const reference = new Function(`return (${corps});`)() as unknown;
    expect(PROFIL_GOLDEN_DIAG).toEqual(reference);
  });

  it('point, azimut, étage, dernier étage et score scellé : ceux du test golden', () => {
    expect(ITEST).toContain(`point: { lat: ${CAS_GOLDEN.point.lat}, lon: ${CAS_GOLDEN.point.lon} }`);
    expect(ITEST).toContain(`azimutPrincipalDeg: ${CAS_GOLDEN.azimutPrincipalDeg},`);
    expect(ITEST).toContain(`etage: ${CAS_GOLDEN.etage},`);
    expect(ITEST).toContain(`dernierEtage: ${CAS_GOLDEN.dernierEtage},`);
    expect(ITEST).toContain(`toBeCloseTo(${SCORE_GOLDEN}, 3)`);
  });
});

describe('JSON stable : clés triées, pleine précision, aucun arrondi', () => {
  it('clés triées à tous les niveaux, et la sortie relit EXACTEMENT les mêmes doubles', () => {
    const v = { z: 1, a: { y: 0.1 + 0.2, b: 29.107259068449615 }, m: [3, { d: 1e-17, c: 41.57033157348633 }] };
    const texte = jsonStable(v);
    expect(texte.indexOf('"a"')).toBeLessThan(texte.indexOf('"m"'));
    expect(texte.indexOf('"b"')).toBeLessThan(texte.indexOf('"y"'));
    expect(texte).toContain('0.30000000000000004'); // jamais « 0.3 »
    expect(JSON.parse(texte)).toEqual(v);
    expect(texte.endsWith('\n')).toBe(true);
  });

  it('les nombres que JSON perdrait sont écrits en clair ; Map, Set, Date, octets, bigint, undefined', () => {
    expect(normaliserPourJson([NaN, Infinity, -Infinity, -0, 0])).toEqual(['NaN', 'Infinity', '-Infinity', '-0', 0]);
    expect(normaliserPourJson(new Map([['b', 1], ['a', 2]]))).toEqual({ a: 2, b: 1 });
    expect(normaliserPourJson(new Set([2, 1]))).toEqual([2, 1]);
    expect(normaliserPourJson(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14T10:00:00.000Z');
    expect(normaliserPourJson(Buffer.from([0x0a, 0xff]))).toBe('0aff');
    expect(normaliserPourJson(BigInt('12345678901234567890'))).toBe('12345678901234567890');
    expect(normaliserPourJson({ a: undefined, b: [undefined] })).toEqual({ b: [null] });
  });

  it('même valeur, ordre d’insertion différent → même texte (stable d’une machine à l’autre)', () => {
    expect(jsonStable({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonStable({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('SQL : blancs réduits, rien d’autre de touché', () => {
    expect(sqlNormalise('  SELECT  a,\n\t b\n FROM t  WHERE x = $1 ')).toBe('SELECT a, b FROM t WHERE x = $1');
  });
});
