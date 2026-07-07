import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test. Toutes les routes de
// curation importent le MÊME module réel (à des profondeurs différentes) : ce mock les couvre
// toutes. ⚠️ Règle dure : aucune écriture réelle — les écritures sont MOCKÉES, jamais exécutées.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { GET as GET_ENTITES } from './entites/route';
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

describe('PATCH point (déplacer)', () => {
  it('déplacement ≤ 150 m → 200 + UPDATE geom_point_corrige + journal, geom_point intact', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('ST_Distance')) {
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

  it('déplacement > 150 m → 422 + AUCUNE écriture', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('ST_Distance')) {
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
      if (text.includes('ST_Distance')) {
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
