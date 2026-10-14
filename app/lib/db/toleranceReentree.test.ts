import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Option A d'Arno (14/10/2026) — la tolérance de contact de la réentrée : lecture à repli sûr, et transport jusqu'à la
 * requête de `candidatReentreeOrigine`. Base simulée : rien n'est lu ni écrit pour de vrai. SQL asserté par FRAGMENTS.
 */
const queryMock = vi.fn();
vi.mock('./client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { toleranceContactValide, lireToleranceContactReentree } from './toleranceReentree';
import { candidatReentreeOrigine } from './obstacles';
import { REENTREE_TOLERANCE_CONTACT_DEFAUT_M } from '../svv/config';

beforeEach(() => { queryMock.mockReset(); });
const plat = (s: string) => s.replace(/\s+/g, ' ');

describe('toleranceContactValide — la valeur lue, sinon le défaut 0,01 m', () => {
  it('dans la plage [0,001 ; 0,10] (bornes incluses) : gardée telle quelle, sans arrondi', () => {
    expect(REENTREE_TOLERANCE_CONTACT_DEFAUT_M).toBe(0.01);
    for (const v of [0.001, 0.0123456789, 0.05, 0.1]) expect(toleranceContactValide(v)).toBe(v);
    expect(toleranceContactValide('0.02')).toBe(0.02); // numeric renvoyé en texte par pg
  });
  it('absente, nulle, non numérique, non finie ou hors plage : le défaut', () => {
    for (const v of [undefined, null, '', 'abc', NaN, Infinity, 0, 0.0009, 0.11, -0.01, {}]) {
      expect(toleranceContactValide(v)).toBe(0.01);
    }
  });
});

describe('lireToleranceContactReentree — tourne sur le schéma actuel (migration 352 non appliquée)', () => {
  it('lit la colonne par to_jsonb : une colonne absente rend NULL, jamais une erreur → défaut', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ t: null }] });
    expect(await lireToleranceContactReentree()).toBe(0.01);
    expect(plat(queryMock.mock.calls[0][0] as string)).toContain("to_jsonb(c) -> 'reentree_tolerance_contact_m'");
  });
  it('valeur réglée → retenue ; table indisponible → défaut, sans exception', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ t: 0.03 }] });
    expect(await lireToleranceContactReentree()).toBe(0.03);
    queryMock.mockRejectedValueOnce(new Error('relation "config_scoring" does not exist'));
    expect(await lireToleranceContactReentree()).toBe(0.01);
  });
});

describe('candidatReentreeOrigine — le polygone rétréci CLASSE, le polygone réel MESURE ; ST_Force2D conservé', () => {
  const params = { point: { lat: 48.9, lon: 2.26 }, azimutDeg: 45, batimentOrigineId: 244601, batimentOriginePolygoneWkt: 'POLYGON((0 0,1 0,1 1,0 1,0 0))' };
  it('la tolérance transportée est passée en $8 ; la règle des 0,5 m reste en $7', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await candidatReentreeOrigine({ ...params, toleranceContactReentreeM: 0.02 })).toBeNull();
    const [sql, p] = queryMock.mock.calls[0] as [string, unknown[]];
    // Le polygone RÉEL (ST_Force2D conservé) donne les distances ; le rétréci ne sert qu'à CLASSER.
    expect(plat(sql)).toContain('poly AS (SELECT ST_Force2D(ST_GeomFromText($5, 2154)) AS g)');
    expect(plat(sql)).toContain('polyc AS (SELECT ST_Buffer(p.g, -$8::float8) AS g FROM poly p)');
    expect(plat(sql)).toContain('FROM axe a, polyc p');
    expect(p[6]).toBe(0.5);
    expect(p[7]).toBe(0.02);
  });
  it('sans tolérance transportée : le défaut 0,01 m', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await candidatReentreeOrigine(params);
    expect((queryMock.mock.calls[0] as [string, unknown[]])[1][7]).toBe(0.01);
  });
  it('sans polygone d’origine : aucune requête', async () => {
    expect(await candidatReentreeOrigine({ ...params, batimentOriginePolygoneWkt: undefined })).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
