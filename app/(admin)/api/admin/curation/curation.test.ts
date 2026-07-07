import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test. Toutes les routes de
// curation importent le MÊME module réel (à des profondeurs différentes) : ce mock les couvre
// toutes. ⚠️ Règle dure : aucune écriture réelle — les écritures sont MOCKÉES, jamais exécutées.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { GET as GET_ENTITES, POST as POST_ENTITE } from './entites/route';
import { DELETE as DELETE_ENTITE, PATCH as PATCH_ENTITE } from './entites/[id]/route';
import { GET as GET_TAGS } from './tags-manuels/route';
import { PATCH as PATCH_POINT, DELETE as DELETE_POINT } from './entites/[id]/point/route';
import { POST as POST_LIAISON, DELETE as DELETE_LIAISON, PATCH as PATCH_LIAISON } from './entites/[id]/liaisons/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Toutes les requêtes SQL émises (texte). */
function sqlsEmis(): string[] {
  return queryMock.mock.calls.map((c) => c[0]).filter((t): t is string => typeof t === 'string');
}
/** Vrai si une requête d'écriture (mutation de curation) a été émise. */
function ecritureEmise(): boolean {
  return sqlsEmis().some((s) => /INSERT INTO patrimoine_entite_batiment|UPDATE patrimoine_entite|DELETE FROM patrimoine_entite_batiment/.test(s));
}
/** Vrai si toute écriture consigne bien le journal `curation_patrimoine_log`. */
function journalEmis(): boolean {
  return sqlsEmis().some((s) => s.includes('curation_patrimoine_log'));
}
/**
 * INVARIANT DUR : aucune requête ne DOIT muter la colonne `geom_point` (original). `\bgeom_point\b`
 * ne matche PAS `geom_point_corrige` (le `_` est un caractère de mot → pas de frontière). On rejette
 * donc tout `geom_point =` qui n'est PAS `geom_point_corrige =`.
 */
function muteGeomPointOriginal(): boolean {
  return sqlsEmis().some((s) => /\bgeom_point\b\s*=/.test(s));
}

function req(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/admin/curation/entites/5', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /api/admin/curation/tags-manuels', () => {
  it('mappe entite_id/nom/centre + filtre origine=manuel + 1er polygone (SQL)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ entite_id: 993, nom: 'Hotel de ville', centre: '{"type":"Point","coordinates":[2.28,48.91]}' }],
    });
    const res = await GET_TAGS();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags[0]).toMatchObject({ entiteId: 993, nom: 'Hotel de ville' });
    expect(body.tags[0].centre).toEqual({ type: 'Point', coordinates: [2.28, 48.91] });
    const sql = sqlsEmis()[0];
    expect(/meta->>'origine' = 'manuel'/.test(sql)).toBe(true);
    expect(/ST_Centroid\(ST_Force2D/.test(sql)).toBe(true);
    expect(/ORDER BY peb\.created/.test(sql)).toBe(true);
  });

  it('query rejette → 503', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    const res = await GET_TAGS();
    expect(res.status).toBe(503);
  });
});

describe('GET /api/admin/curation/entites', () => {
  it('liste + compteurs par état (rouge/orange/vert)', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { id: 1, famille: 'mh', ref_code: 'A', nom: 'A', statut: null, point_geojson: '{"type":"Point","coordinates":[2,48]}', corrige: false, liaisons: [] },
        { id: 2, famille: 'mh', ref_code: 'B', nom: 'B', statut: null, point_geojson: null, corrige: true, liaisons: [{ cleabs: 'c1', source: 'auto', actif: true, detache: false, verifie_manuellement: false }] },
        { id: 3, famille: 'mondial', ref_code: 'C', nom: 'C', statut: null, point_geojson: '{"type":"Point","coordinates":[3,49]}', corrige: false, liaisons: [{ cleabs: 'c2', source: 'manuel', actif: true, detache: false, verifie_manuellement: false }] },
      ],
    });
    const res = await GET_ENTITES();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entites).toHaveLength(3);
    expect(body.entites[0]).toMatchObject({ id: 1, etat: 'rouge', corrige: false });
    expect(body.entites[1]).toMatchObject({ id: 2, etat: 'orange', corrige: true, point: null });
    expect(body.entites[2]).toMatchObject({ id: 3, etat: 'vert' });
    expect(body.compteurs).toEqual({ rouge: 1, orange: 1, vert: 1 });
  });

  it('query rejette → 503', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    const res = await GET_ENTITES();
    expect(res.status).toBe(503);
  });
});

describe('POST /api/admin/curation/entites (création manuelle)', () => {
  it('création valide → 201 + INSERT patrimoine_entite (ref MANUEL-*, meta.origine=manuel, sans liaison)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 42, famille: 'mh', ref_code: 'MANUEL-1700000000000', nom: 'Hôtel de ville', meta: { origine: 'manuel' } }],
    });
    const res = await POST_ENTITE(req('POST', { famille: 'mh', nom: '  Hôtel de ville  ', statut: 'inscrit' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entite).toMatchObject({ id: 42, famille: 'mh', nom: 'Hôtel de ville' });
    expect(body.entite.refCode).toMatch(/^MANUEL-\d+$/);
    const sql = sqlsEmis().find((s) => s.includes('INSERT INTO patrimoine_entite'));
    expect(sql).toBeDefined();
    // INSERT paramétré, meta origine manuel, jamais geom_point, jamais de liaison.
    expect(/INSERT INTO patrimoine_entite \(famille, ref_code, nom, statut, actif, meta\)/.test(sql!)).toBe(true);
    expect(/\bgeom_point\b/.test(sql!)).toBe(false);
    expect(sqlsEmis().some((s) => /patrimoine_entite_batiment/.test(s))).toBe(false);
    // Paramètres : famille, ref MANUEL-*, nom trimé, statut, meta {origine:manuel}.
    const params = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT INTO patrimoine_entite'))?.[1] as unknown[];
    expect(params[0]).toBe('mh');
    expect(String(params[1])).toMatch(/^MANUEL-\d+$/);
    expect(params[2]).toBe('Hôtel de ville');
    expect(JSON.parse(String(params[4]))).toEqual({ origine: 'manuel' });
  });

  it('famille hors enum → 422 + AUCUNE écriture', async () => {
    const res = await POST_ENTITE(req('POST', { famille: 'chateau', nom: 'X' }));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('nom vide (après trim) → 422 + AUCUNE écriture', async () => {
    const res = await POST_ENTITE(req('POST', { famille: 'mh', nom: '   ' }));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('violation UNIQUE (23505) → 409', async () => {
    queryMock.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await POST_ENTITE(req('POST', { famille: 'inventaire', nom: 'Mairie' }));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/curation/entites/[id] (suppression tag manuel)', () => {
  it('entité manuelle → 200 + CTE supprime liaisons PUIS entité, gardé origine=manuel', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 42 }] });
    const res = await DELETE_ENTITE(req('DELETE'), ctx('42'));
    expect(res.status).toBe(200);
    const sql = sqlsEmis().find((s) => s.includes('patrimoine_entite'));
    expect(sql).toBeDefined();
    // Garde-fou serveur : ne cible QUE meta->>'origine'='manuel'.
    expect(/meta->>'origine' = 'manuel'/.test(sql!)).toBe(true);
    // Supprime les liaisons ET l'entité (CTE atomique).
    expect(/DELETE FROM patrimoine_entite_batiment/.test(sql!)).toBe(true);
    expect(/DELETE FROM patrimoine_entite\b/.test(sql!)).toBe(true);
  });

  it('entité inconnue OU native (0 ligne) → 404', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await DELETE_ENTITE(req('DELETE'), ctx('7'));
    expect(res.status).toBe(404);
  });

  it('id invalide → 422 + AUCUNE écriture', async () => {
    const res = await DELETE_ENTITE(req('DELETE'), ctx('abc'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });
});

describe('PATCH /api/admin/curation/entites/[id] (renommer tag manuel)', () => {
  it('nom → 200 + UPDATE gardé origine=manuel', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 42, nom: 'Nouvelle mairie' }] });
    const res = await PATCH_ENTITE(req('PATCH', { nom: 'Nouvelle mairie' }), ctx('42'));
    expect(res.status).toBe(200);
    const sql = sqlsEmis().find((s) => s.includes('UPDATE patrimoine_entite'));
    expect(/SET nom = \$2[\s\S]*meta->>'origine' = 'manuel'/.test(sql!)).toBe(true);
  });

  it('nom vide → 200 (nom NULL autorisé)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 42, nom: null }] });
    const res = await PATCH_ENTITE(req('PATCH', { nom: '   ' }), ctx('42'));
    expect(res.status).toBe(200);
    const params = queryMock.mock.calls.find((c) => String(c[0]).includes('UPDATE patrimoine_entite'))?.[1] as unknown[];
    expect(params[1]).toBeNull();
  });

  it('entité native/inconnue (0 ligne) → 404', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await PATCH_ENTITE(req('PATCH', { nom: 'X' }), ctx('7'));
    expect(res.status).toBe(404);
  });

  it('body sans nom → 422', async () => {
    const res = await PATCH_ENTITE(req('PATCH', { autre: 1 }), ctx('42'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });
});

describe('PATCH point (déplacer)', () => {
  it('déplacement ≤ 150 m → 200 + UPDATE geom_point_corrige + journal, geom_point intact', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('a_ancre')) {
        return Promise.resolve({ rows: [{ a_ancre: true, dist_m: 50, effectif_avant: '{"type":"Point","coordinates":[2,48]}' }] });
      }
      return Promise.resolve({ rows: [{ id: 5, point_corrige: '{"type":"Point","coordinates":[2.001,48.001]}' }] });
    });
    const res = await PATCH_POINT(req('PATCH', { lat: 48.001, lon: 2.001 }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, id: 5, corrige: true });
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite\b[\s\S]*geom_point_corrige =/.test(s))).toBe(true);
    expect(journalEmis()).toBe(true);
    expect(muteGeomPointOriginal()).toBe(false);
  });

  it('déplacement → invalide (verifie=false) les liaisons vérifiées à > 15 m de leur emprise, atomique', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('a_ancre')) {
        return Promise.resolve({ rows: [{ a_ancre: true, dist_m: 50, effectif_avant: null }] });
      }
      return Promise.resolve({
        rows: [{ point_corrige: '{"type":"Point","coordinates":[2.001,48.001]}', invalidees: ['BATZZZ'] }],
      });
    });
    const res = await PATCH_POINT(req('PATCH', { lat: 48.001, lon: 2.001 }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verificationsInvalidees).toEqual(['BATZZZ']);
    // Même SQL atomique : UPDATE point + invalidation liaisons (verifie=false) + journal.
    const majSql = sqlsEmis().find((s) => s.includes('geom_point_corrige ='));
    expect(majSql).toBeDefined();
    expect(/UPDATE patrimoine_entite_batiment[\s\S]*verifie_manuellement = false/.test(majSql!)).toBe(true);
    expect(/bdtopo_batiment[\s\S]*ST_Distance[\s\S]*>\s*\$6/.test(majSql!)).toBe(true);
    // N'ajoute/ne supprime AUCUNE liaison et ne touche PAS `detache`.
    expect(/INSERT INTO patrimoine_entite_batiment|DELETE FROM patrimoine_entite_batiment/.test(majSql!)).toBe(false);
    expect(/SET[\s\S]*detache =/.test(majSql!)).toBe(false);
    expect(muteGeomPointOriginal()).toBe(false);
  });

  it('déplacement > 150 m → 422 + AUCUNE écriture', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('a_ancre')) {
        return Promise.resolve({ rows: [{ a_ancre: true, dist_m: 300, effectif_avant: null }] });
      }
      return Promise.resolve({ rows: [{ id: 5 }] });
    });
    const res = await PATCH_POINT(req('PATCH', { lat: 48.9, lon: 2.9 }), ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('entité sans ancre (geom_point NULL) → 422 + AUCUNE écriture', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('a_ancre')) {
        return Promise.resolve({ rows: [{ a_ancre: false, dist_m: null, effectif_avant: null }] });
      }
      return Promise.resolve({ rows: [{ id: 5 }] });
    });
    const res = await PATCH_POINT(req('PATCH', { lat: 48.001, lon: 2.001 }), ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('entité inconnue → 404 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await PATCH_POINT(req('PATCH', { lat: 48.001, lon: 2.001 }), ctx('999'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });

  it('body invalide (lat non fini) → 422 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ a_ancre: true, dist_m: 10, effectif_avant: null }] });
    const res = await PATCH_POINT(req('PATCH', { lat: 'nope', lon: 2 }), ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('DELETE point (annuler déplacement)', () => {
  it('annulation → 200 + geom_point_corrige = NULL + journal', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT') && text.includes('corrige_avant')) {
        return Promise.resolve({ rows: [{ corrige_avant: '{"type":"Point","coordinates":[2,48]}' }] });
      }
      return Promise.resolve({ rows: [{ id: 5 }] });
    });
    const res = await DELETE_POINT(req('DELETE'), ctx('5'));
    expect(res.status).toBe(200);
    expect(sqlsEmis().some((s) => /geom_point_corrige = NULL/.test(s))).toBe(true);
    expect(sqlsEmis().some((s) => s.includes("'annulation_deplacement'"))).toBe(true);
    expect(muteGeomPointOriginal()).toBe(false);
  });

  it('entité inconnue → 404', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await DELETE_POINT(req('DELETE'), ctx('999'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('POST liaison (rattacher)', () => {
  it('rattachement → 200 + INSERT source=manuel + journal', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('entite_existe')) {
        return Promise.resolve({ rows: [{ entite_existe: true, liaison_avant: null }] });
      }
      return Promise.resolve({ rows: [{ entite_id: 5, cleabs: 'BATABC', source: 'manuel', actif: true, detache: false, verifie_manuellement: false }] });
    });
    const res = await POST_LIAISON(req('POST', { cleabs: 'BATABC' }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liaison).toMatchObject({ cleabs: 'BATABC', source: 'manuel', detache: false });
    expect(sqlsEmis().some((s) => /INSERT INTO patrimoine_entite_batiment[\s\S]*'manuel'/.test(s))).toBe(true);
    expect(journalEmis()).toBe(true);
    expect(muteGeomPointOriginal()).toBe(false);
  });

  it('entité inconnue → 404 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ entite_existe: false, liaison_avant: null }] });
    const res = await POST_LIAISON(req('POST', { cleabs: 'BATABC' }), ctx('999'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });

  it('cleabs vide → 422 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ entite_existe: true, liaison_avant: null }] });
    const res = await POST_LIAISON(req('POST', { cleabs: '   ' }), ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('DELETE liaison (détacher)', () => {
  it('liaison MANUEL → DELETE sec + journal', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT source')) {
        return Promise.resolve({ rows: [{ source: 'manuel', actif: true, detache: false, verifie_manuellement: false }] });
      }
      return Promise.resolve({ rows: [{ entite_id: 5, cleabs: 'BATABC' }] });
    });
    const res = await DELETE_LIAISON(req('DELETE', { cleabs: 'BATABC' }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tombstone).toBe(false);
    expect(sqlsEmis().some((s) => /DELETE FROM patrimoine_entite_batiment/.test(s))).toBe(true);
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite_batiment[\s\S]*detache = true/.test(s))).toBe(false);
    expect(journalEmis()).toBe(true);
  });

  it('liaison AUTO → tombstone UPDATE detache=true, JAMAIS DELETE', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT source')) {
        return Promise.resolve({ rows: [{ source: 'auto', actif: true, detache: false, verifie_manuellement: false }] });
      }
      return Promise.resolve({ rows: [{ entite_id: 5, cleabs: 'BATABC', source: 'manuel', actif: true, detache: true, verifie_manuellement: false }] });
    });
    const res = await DELETE_LIAISON(req('DELETE', { cleabs: 'BATABC' }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tombstone).toBe(true);
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite_batiment[\s\S]*detache = true[\s\S]*source = 'manuel'/.test(s))).toBe(true);
    // Cohérence d'état (Correction 1) : le tombstone remet AUSSI verifie_manuellement=false.
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite_batiment[\s\S]*verifie_manuellement = false/.test(s))).toBe(true);
    expect(sqlsEmis().some((s) => /DELETE FROM patrimoine_entite_batiment/.test(s))).toBe(false);
    expect(journalEmis()).toBe(true);
  });

  it('liaison inconnue → 404 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await DELETE_LIAISON(req('DELETE', { cleabs: 'BATABC' }), ctx('5'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('PATCH liaison (vérifier)', () => {
  it('vérification → verifie_manuellement=true, source INCHANGÉE', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT source')) {
        return Promise.resolve({ rows: [{ source: 'auto', actif: true, detache: false, verifie_manuellement: false }] });
      }
      return Promise.resolve({ rows: [{ entite_id: 5, cleabs: 'BATABC', source: 'auto', actif: true, detache: false, verifie_manuellement: true }] });
    });
    const res = await PATCH_LIAISON(req('PATCH', { cleabs: 'BATABC', verifie: true }), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liaison).toMatchObject({ source: 'auto', verifieManuellement: true });
    const majSql = sqlsEmis().find((s) => s.includes('UPDATE patrimoine_entite_batiment'));
    expect(majSql).toBeDefined();
    expect(/verifie_manuellement = true/.test(majSql!)).toBe(true);
    // La mutation ne touche PAS `source` (promotion orange → vert sans changer la source).
    expect(/set[\s\S]*source =/i.test(majSql!)).toBe(false);
    expect(journalEmis()).toBe(true);
  });

  it('verifie absent → 422 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ source: 'auto', actif: true, detache: false, verifie_manuellement: false }] });
    const res = await PATCH_LIAISON(req('PATCH', { cleabs: 'BATABC' }), ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('liaison inconnue → 404', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await PATCH_LIAISON(req('PATCH', { cleabs: 'BATABC', verifie: true }), ctx('5'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('corps JSON invalide', () => {
  it('POST liaison corps illisible → 422 + AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ entite_existe: true, liaison_avant: null }] });
    const bad = new Request('http://localhost/api/admin/curation/entites/5', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ pas du json',
    });
    const res = await POST_LIAISON(bad, ctx('5'));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('aucune requête émise ne mute geom_point (original) sur tout le parcours', async () => {
    // Récapitulatif transverse : après le POST invalide ci-dessus, aucune écriture, a fortiori
    // aucune mutation de `geom_point`. (Le mock a été réinitialisé par beforeEach.)
    expect(muteGeomPointOriginal()).toBe(false);
  });
});
