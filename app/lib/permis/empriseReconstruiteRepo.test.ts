import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * PROJ-2 — garde de l'emprise RECONSTITUÉE. Deux preuves :
 *  (1) COMPORTEMENT — `enregistrerEmprise` n'écrit QUE dans `permis_emprise_reconstruite` (jamais batiment / altitude / corps) ;
 *  (2) 🔴 GARDE MOTEUR (statique) — aucun fichier du moteur géométrique (verdict / obstacles / pipeline / hauteur / préséance
 *      d'altitude) ne référence la table ni le module de reconstitution → une reconstitution NE PEUT PAS entrer dans le moteur.
 * `db/client` est mocké ; aucune connexion réelle.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/INSERT INTO permis_emprise_reconstruite/i.test(sql)) return { rows: [{ id: 7 }], rowCount: 1 };
    if (/SELECT id FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: [{ id: 99 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  return { calls, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));

import { enregistrerEmprise, listerEmprises, supprimerEmprise, ignorerProjection, retablirProjection } from './empriseReconstruiteRepo';
import type { CalageTrace } from './empriseReconstruiteRepo';

const calage: CalageTrace = { paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 10, y: 0 }, lambert: { x: 20, y: 0 } }], ratioDeclare: null, ratioImplicite: 200, residuFitM: 0, residuEchelleM: null, douteux: false, raisons: [] };
const anneau = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

beforeEach(() => { H.calls.length = 0; });

describe('PROJ-2 — enregistrerEmprise : n’écrit QUE la table des reconstitutions', () => {
  it('INSERT dans permis_emprise_reconstruite, géométrie ST_GeomFromText(…, 2154), calage en jsonb, corps_id lié', async () => {
    const r = await enregistrerEmprise({ dossierId: 11434, corpsId: 3, libelle: '2D1', anneau, pieceId: 55, page: 2, calage, residuM: 0, creePar: 'admin' });
    expect(r).toEqual({ ok: true, id: 7 });
    const ins = H.calls.find((c) => /INSERT INTO permis_emprise_reconstruite/i.test(c.sql))!;
    expect(ins).toBeTruthy();
    expect(ins.sql).toMatch(/ST_GeomFromText\(\$3, 2154\)/);           // SRID Lambert-93 explicite
    expect(ins.sql).toMatch(/ST_Area\(ST_GeomFromText\(\$3, 2154\)\)/); // surface figée en base
    expect(ins.sql).toMatch(/corps_id/);                               // PROJ-2b — lien au bâtiment
    expect(ins.params[1]).toBe('2D1');
    expect(ins.params[8]).toBe(3);                                     // $9 = corpsId
    expect(String(ins.params[2])).toMatch(/^POLYGON\(\(0 0, 10 0, 10 10, 0 10, 0 0\)\)$/); // anneau FERMÉ
    // 🔴 aucune écriture vers une table du moteur
    const sqlTout = H.calls.map((c) => c.sql).join('\n');
    expect(sqlTout).not.toMatch(/INSERT INTO batiment|UPDATE batiment|permis_polygone_altitude|permis_corps/i);
  });

  it('refuse un contour < 3 sommets, un libellé vide, des coordonnées non finies (aucune écriture)', async () => {
    expect((await enregistrerEmprise({ dossierId: 1, corpsId: 3, libelle: 'X', anneau: [{ x: 0, y: 0 }, { x: 1, y: 1 }], pieceId: null, page: null, calage, residuM: null, creePar: null })).ok).toBe(false);
    expect((await enregistrerEmprise({ dossierId: 1, corpsId: 3, libelle: '  ', anneau, pieceId: null, page: null, calage, residuM: null, creePar: null })).ok).toBe(false);
    expect((await enregistrerEmprise({ dossierId: 1, corpsId: 3, libelle: 'X', anneau: [{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 1, y: 1 }], pieceId: null, page: null, calage, residuM: null, creePar: null })).ok).toBe(false);
    expect(H.calls.some((c) => /INSERT/i.test(c.sql))).toBe(false);
  });

  it('supprimerEmprise est SCOPÉE au dossier (jamais un id seul)', async () => {
    await supprimerEmprise(7, 11434);
    const del = H.calls.find((c) => /DELETE FROM permis_emprise_reconstruite/i.test(c.sql))!;
    expect(del.sql).toMatch(/WHERE id = \$1 AND dossier_id = \$2/);
    expect(del.params).toEqual([7, 11434]);
  });

  it('listerEmprises lit la géométrie en GeoJSON (ST_AsGeoJSON) scopée au dossier', async () => {
    await listerEmprises(11434);
    const sel = H.calls.find((c) => /SELECT[\s\S]*FROM permis_emprise_reconstruite/i.test(c.sql))!;
    expect(sel.sql).toMatch(/ST_AsGeoJSON\(geom\)/);
    expect(sel.sql).toMatch(/WHERE dossier_id = \$1/);
  });
});

describe('PROJ-2b — ignorer / rétablir la projection : état courant + journal append-only', () => {
  it('ignorer : motif OBLIGATOIRE ; upsert l’état + événement « projection_ignoree » PORTANT le motif', async () => {
    expect((await ignorerProjection(11434, 5, '   ', 'admin')).ok).toBe(false); // motif vide refusé, aucune écriture
    expect(H.calls.some((c) => /INSERT INTO permis_projection_ignoree/i.test(c.sql))).toBe(false);
    H.calls.length = 0;
    const r = await ignorerProjection(11434, 5, 'bâtiment déjà bâti, hors projet', 'admin');
    expect(r.ok).toBe(true);
    const up = H.calls.find((c) => /INSERT INTO permis_projection_ignoree/i.test(c.sql))!;
    expect(up.sql).toMatch(/ON CONFLICT \(corps_id\) DO UPDATE/);
    expect(up.params).toEqual([11434, 5, 'bâtiment déjà bâti, hors projet', 'admin']);
    const evt = H.calls.find((c) => /INSERT INTO permis_rattachement_evenement/i.test(c.sql))!;
    expect(evt.sql).toMatch(/'projection_ignoree'/);                 // type = littéral dans le SQL
    expect(evt.params[0]).toBe(99);                                  // $1 = rattachement_id résolu
    expect(evt.params[2]).toBe('admin');                            // $3 = par
    // le motif voyage dans les détails jsonb ($2)
    const details = JSON.parse(String(evt.params[1]));
    expect(details).toEqual({ corpsId: 5, motif: 'bâtiment déjà bâti, hors projet' });
  });

  it('rétablir : supprime l’état courant (scopé au dossier) + événement « projection_retablie »', async () => {
    const r = await retablirProjection(11434, 5, 'admin');
    expect(r.ok).toBe(true);
    const del = H.calls.find((c) => /DELETE FROM permis_projection_ignoree/i.test(c.sql))!;
    expect(del.sql).toMatch(/WHERE corps_id = \$1 AND dossier_id = \$2/);
    expect(del.params).toEqual([5, 11434]);
    expect(H.calls.some((c) => /projection_retablie/i.test(c.sql))).toBe(true);
  });
});

describe('PROJ-2 — 🔴 GARDE MOTEUR : la reconstitution n’entre JAMAIS dans le moteur', () => {
  const MOTEUR = [
    'app/lib/svv/verdict.ts', 'app/lib/svv/scoreTotal.ts',
    'app/lib/db/obstacles.ts', 'app/lib/db/pipeline.ts', 'app/lib/db/hauteurLidar.ts',
    'app/lib/permis/preseanceAltitude.ts',
  ];
  it('aucun fichier du moteur ne référence la table ni le module de reconstitution', () => {
    for (const f of MOTEUR) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} ne doit PAS connaître la reconstitution`).not.toMatch(/emprise_reconstruite|empriseReconstruite|calageEmprise/i);
    }
  });
});
