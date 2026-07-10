import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test. Toutes les routes de
// curation importent le MÊME module réel (à des profondeurs différentes) : ce mock les couvre
// toutes. ⚠️ Règle dure : aucune écriture réelle — les écritures sont MOCKÉES, jamais exécutées.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  // `withTransaction` : exécute `fn` avec une fonction de requête qui route vers `queryMock`
  // (mêmes appels observables ; l'atomicité BEGIN/COMMIT est une propriété runtime non testée ici).
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
// Garde de révocation (M3-0) neutralisé : ce fichier teste la LOGIQUE MÉTIER de la curation ; la révocation
// a ses propres tests (garde.test.ts + route.revocation.test.ts). No-op → autorise, aucune requête parasite.
vi.mock('../../../../lib/admin/garde', () => ({ exigerCompteActif: () => Promise.resolve(null) }));

import { GET as GET_ENTITES, POST as POST_ENTITE } from './entites/route';
import { DELETE as DELETE_ENTITE, PATCH as PATCH_ENTITE } from './entites/[id]/route';
import { POST as POST_ANNULER } from './entites/[id]/annuler-edition/route';
import { GET as GET_BORNE } from './entites/[id]/borne/route';
import { GET as GET_JOURNAL } from './journal/route';
import { GET as GET_ENTITE_JOURNAL } from './entites/[id]/journal/route';
import { versEntite, versEmprise, type LigneEntiteDB, type LigneEmpriseDB } from './partage';
import { GET as GET_TAGS } from './tags-manuels/route';
import { GET as GET_EMPRISES } from './emprises/route';
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

describe('GET /api/admin/curation/emprises (bbox + année de construction)', () => {
  const reqEmprises = (qs: string) =>
    new Request(`http://localhost/api/admin/curation/emprises${qs}`, { method: 'GET' });
  const BBOX = '?minlon=2.26&minlat=48.90&maxlon=2.29&maxlat=48.92';

  it('SELECT : annee (LEFT JOIN) + etages (colonne, AUCUN join nouveau), une seule requête, aucun N+1', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await GET_EMPRISES(reqEmprises(BBOX));
    // UNE seule requête SQL (la donnée voyage avec le GeoJSON, jamais une requête par polygone).
    expect(sqlsEmis().length).toBe(1);
    const sql = sqlsEmis()[0];
    // LEFT JOIN (n'exclut aucun bâtiment sans année) + colonne année, patron `obstacles.ts`.
    expect(/LEFT JOIN bdnb_annee_batiment ba ON ba\.cleabs = b\.cleabs/.test(sql)).toBe(true);
    expect(/ba\.annee_construction AS annee/.test(sql)).toBe(true);
    // Étages : colonne de bdtopo_batiment lue avec geom → AUCUN LEFT JOIN nouveau (un SEUL dans la requête).
    expect(/b\.nombre_d_etages AS etages/.test(sql)).toBe(true);
    expect((sql.match(/LEFT JOIN/g) ?? []).length).toBe(1);
    // JAMAIS un INNER JOIN (exclurait les bâtiments sans année).
    expect(/INNER JOIN bdnb_annee_batiment/.test(sql)).toBe(false);
    // ST_Force2D conservé (invariant), lecture seule (aucune écriture).
    expect(/ST_Force2D/.test(sql)).toBe(true);
    expect(ecritureEmise()).toBe(false);
  });

  it('renvoie annee (number) quand renseignée, et null quand absente — sans exclure la ligne', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { cleabs: 'BAT_AVEC', geom: '{"type":"Point","coordinates":[2.27,48.91]}', annee: 1954 },
        { cleabs: 'BAT_SANS', geom: '{"type":"Point","coordinates":[2.28,48.91]}', annee: null },
      ],
    });
    const res = await GET_EMPRISES(reqEmprises(BBOX));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Les DEUX bâtiments sont présents (le sans-année n'est jamais filtré).
    expect(body.emprises).toHaveLength(2);
    expect(body.emprises[0]).toMatchObject({ cleabs: 'BAT_AVEC', annee: 1954 });
    expect(body.emprises[1]).toMatchObject({ cleabs: 'BAT_SANS', annee: null });
  });

  it('renvoie etages, y compris 0 (vraie valeur, jamais exclue ni transformée en null)', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { cleabs: 'BAT_5', geom: '{"type":"Point","coordinates":[2.27,48.91]}', annee: 1954, etages: 5 },
        { cleabs: 'BAT_0', geom: '{"type":"Point","coordinates":[2.28,48.91]}', annee: null, etages: 0 },
        { cleabs: 'BAT_NULL', geom: '{"type":"Point","coordinates":[2.29,48.91]}', annee: null, etages: null },
      ],
    });
    const res = await GET_EMPRISES(reqEmprises(BBOX));
    const body = await res.json();
    expect(body.emprises).toHaveLength(3);
    expect(body.emprises[0]).toMatchObject({ cleabs: 'BAT_5', etages: 5 });
    // ⚠️ Le 0 SURVIT au transport JSON (pas avalé en null), même quand l'année manque.
    expect(body.emprises[1].etages).toBe(0);
    expect(body.emprises[2].etages).toBeNull();
  });

  it('bbox invalide → 422 + AUCUNE requête', async () => {
    const res = await GET_EMPRISES(reqEmprises('?minlon=nope'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('query rejette → 503', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    expect((await GET_EMPRISES(reqEmprises(BBOX))).status).toBe(503);
  });
});

describe('versEmprise (mapping année + étages)', () => {
  it('mappe annee et etages renseignés', () => {
    const r: LigneEmpriseDB = { cleabs: 'C1', geom: null, annee: 1900, etages: 3 };
    expect(versEmprise(r).annee).toBe(1900);
    expect(versEmprise(r).etages).toBe(3);
  });
  it('colonnes absentes du SELECT (undefined) → null (route emprises rattachées)', () => {
    const r: LigneEmpriseDB = { cleabs: 'C1', geom: null };
    expect(versEmprise(r).annee).toBeNull();
    expect(versEmprise(r).etages).toBeNull();
  });
  it('null explicite → null', () => {
    const r: LigneEmpriseDB = { cleabs: 'C1', geom: null, annee: null, etages: null };
    expect(versEmprise(r).annee).toBeNull();
    expect(versEmprise(r).etages).toBeNull();
  });
  it('⚠️ etages = 0 → 0 (le `?? null` ne touche PAS le 0)', () => {
    const r: LigneEmpriseDB = { cleabs: 'C1', geom: null, etages: 0 };
    expect(versEmprise(r).etages).toBe(0);
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
    // Journalisé dans la MÊME requête (CTE) : action creation_entite_manuelle, apres = famille/nom/ref_code.
    expect(journalEmis()).toBe(true);
    expect(/curation_patrimoine_log[\s\S]*'creation_entite_manuelle'/.test(sql!)).toBe(true);
    expect(/jsonb_build_object\('famille', mut.famille, 'nom', mut.nom, 'ref_code', mut.ref_code\)/.test(sql!)).toBe(true);
  });

  it('famille hors enum → 422 + AUCUNE écriture', async () => {
    const res = await POST_ENTITE(req('POST', { famille: 'chateau', nom: 'X' }));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('nom vide (après trim) → 201, nom inséré NULL (B1 : nom optionnel)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 44, famille: 'mh', ref_code: 'MANUEL-1700000000001', nom: null, meta: { origine: 'manuel' } }],
    });
    const res = await POST_ENTITE(req('POST', { famille: 'mh', nom: '   ' }));
    expect(res.status).toBe(201);
    const params = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT INTO patrimoine_entite'))?.[1] as unknown[];
    expect(params[2]).toBeNull(); // nom → NULL
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
    // Journalisé (CTE) : action suppression_entite_manuelle + snapshot AVANT (famille/nom/ref_code/liaisons).
    expect(journalEmis()).toBe(true);
    expect(/curation_patrimoine_log[\s\S]*'suppression_entite_manuelle'/.test(sql!)).toBe(true);
    expect(/snap AS \(/.test(sql!)).toBe(true);
    expect(/'liaisons', snap\.liaisons/.test(sql!)).toBe(true);
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
    // Journalisé (CTE) : action renommage, avant={nom:ancien} / apres={nom:nouveau}.
    expect(journalEmis()).toBe(true);
    expect(/curation_patrimoine_log[\s\S]*'renommage'/.test(sql!)).toBe(true);
    expect(/jsonb_build_object\('nom', snap.ancien\), jsonb_build_object\('nom', mut.nom\)/.test(sql!)).toBe(true);
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

describe('POST /entites/[id]/annuler-edition (rollback édition)', () => {
  // Mocke le SELECT des lignes de journal (ORDER BY id DESC) ; inverses/journal → {rows:[]}.
  function mockJournal(lignes: unknown[]) {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('FROM curation_patrimoine_log') && text.includes('ORDER BY id DESC')) {
        return Promise.resolve({ rows: lignes });
      }
      return Promise.resolve({ rows: [] });
    });
  }
  const LIAISON_AVANT = { source: 'auto', actif: true, detache: false, verifie_manuellement: false };

  it('borne invalide (non entière) → 422', async () => {
    const res = await POST_ANNULER(req('POST', { borne: 'x' }), ctx('5'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('aucune mutation depuis la borne → no-op, aucune ligne annulation_edition', async () => {
    mockJournal([]);
    const res = await POST_ANNULER(req('POST', { borne: 100 }), ctx('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, nbLignes: 0 });
    expect(sqlsEmis().some((s) => s.includes("'annulation_edition'"))).toBe(false);
  });

  it('renommage → UPDATE nom = avant + 1 seule ligne annulation_edition', async () => {
    mockJournal([{ id: 12, action: 'renommage', cleabs: null, avant: { nom: 'Ancien' }, apres: { nom: 'Nouveau' } }]);
    const res = await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect(await res.json()).toMatchObject({ nbLignes: 1, jusquA: 12 });
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite SET nom = \$2 WHERE id = \$1/.test(s))).toBe(true);
    expect(sqlsEmis().filter((s) => s.includes("'annulation_edition'")).length).toBe(1);
  });

  it('rattachement (avant null) → DELETE la liaison créée', async () => {
    mockJournal([{ id: 20, action: 'rattachement', cleabs: 'BATX', avant: null, apres: { source: 'manuel' } }]);
    await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect(sqlsEmis().some((s) => /DELETE FROM patrimoine_entite_batiment WHERE entite_id = \$1 AND cleabs = \$2/.test(s))).toBe(true);
  });

  it('détachement → INSERT … ON CONFLICT DO UPDATE (restaure la liaison, manuel ou auto)', async () => {
    mockJournal([{ id: 20, action: 'detachement', cleabs: 'BATX', avant: { ...LIAISON_AVANT }, apres: null }]);
    await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect(sqlsEmis().some((s) => /INSERT INTO patrimoine_entite_batiment[\s\S]*ON CONFLICT \(entite_id, cleabs\)[\s\S]*DO UPDATE/.test(s))).toBe(true);
  });

  it('vérification → UPDATE verifie_manuellement = avant', async () => {
    mockJournal([{ id: 20, action: 'verification', cleabs: 'BATX', avant: { ...LIAISON_AVANT }, apres: { verifie_manuellement: true } }]);
    await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect(sqlsEmis().some((s) => /UPDATE patrimoine_entite_batiment SET verifie_manuellement = \$3/.test(s))).toBe(true);
  });

  it('déplacement → UPDATE geom_point_corrige (CASE/ST_DWithin) ; ne mute JAMAIS geom_point original', async () => {
    mockJournal([{ id: 20, action: 'deplacement', cleabs: null, avant: { type: 'Point', coordinates: [2, 48] }, apres: {} }]);
    await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    const sql = sqlsEmis().find((s) => s.includes('geom_point_corrige'));
    expect(sql).toBeDefined();
    expect(/ST_DWithin/.test(sql!)).toBe(true);
    expect(muteGeomPointOriginal()).toBe(false);
  });

  it('création → DELETE liaisons + DELETE entité', async () => {
    mockJournal([{ id: 20, action: 'creation_entite_manuelle', cleabs: null, avant: null, apres: { famille: 'mh' } }]);
    await POST_ANNULER(req('POST', { borne: 5 }), ctx('7'));
    expect(sqlsEmis().some((s) => /DELETE FROM patrimoine_entite_batiment WHERE entite_id = \$1/.test(s))).toBe(true);
    expect(sqlsEmis().some((s) => /DELETE FROM patrimoine_entite WHERE id = \$1/.test(s))).toBe(true);
  });

  it('suppression seule → IGNORÉE (hors périmètre), no-op, pas de journal', async () => {
    mockJournal([{ id: 20, action: 'suppression_entite_manuelle', cleabs: null, avant: { famille: 'mh' }, apres: null }]);
    const res = await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect((await res.json()).nbLignes).toBe(0);
    expect(sqlsEmis().some((s) => s.includes("'annulation_edition'"))).toBe(false);
  });

  it('séquence MIXTE (déplacer > renommer > rattacher) → 3 inverses DESC + 1 journal', async () => {
    mockJournal([
      { id: 30, action: 'deplacement', cleabs: null, avant: { type: 'Point', coordinates: [2, 48] }, apres: {} },
      { id: 25, action: 'renommage', cleabs: null, avant: { nom: 'Ancien' }, apres: { nom: 'X' } },
      { id: 22, action: 'rattachement', cleabs: 'BATX', avant: null, apres: {} },
    ]);
    const res = await POST_ANNULER(req('POST', { borne: 5 }), ctx('5'));
    expect(await res.json()).toMatchObject({ nbLignes: 3, jusquA: 30 });
    expect(sqlsEmis().filter((s) => s.includes("'annulation_edition'")).length).toBe(1);
    expect(muteGeomPointOriginal()).toBe(false);
  });
});

describe('GET /entites/[id]/borne (capture d’ouverture de carte)', () => {
  it('renvoie le max(id) du journal de l’entité (nombre)', async () => {
    queryMock.mockResolvedValue({ rows: [{ borne: '42' }] }); // MAX(id) bigint → string côté pg
    const res = await GET_BORNE(req('GET'), ctx('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ borne: 42 });
    const sql = sqlsEmis().find((s) => s.includes('curation_patrimoine_log'));
    expect(/COALESCE\(MAX\(id\), 0\)[\s\S]*WHERE entite_id = \$1/.test(sql!)).toBe(true);
  });

  it('aucune ligne → borne 0', async () => {
    queryMock.mockResolvedValue({ rows: [{ borne: '0' }] });
    const res = await GET_BORNE(req('GET'), ctx('9'));
    expect(await res.json()).toEqual({ borne: 0 });
  });

  it('id invalide → 422', async () => {
    const res = await GET_BORNE(req('GET'), ctx('abc'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Historique du journal (Lot 1 backend — HJ-1..24). LECTURE SEULE.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/curation/journal (historique global)', () => {
  const reqJournal = (qs: string) => new Request(`http://localhost/api/admin/curation/journal${qs}`, { method: 'GET' });
  const LIGNE = {
    id: '10', ts: '2026-07-08T10:00:00Z', action: 'rattachement', entite_id: 5, cleabs: 'BATX',
    avant: null, apres: { source: 'manuel' }, nom_affiche: 'Maison', famille_affiche: 'mh', supprimee: false, total: '3',
  };

  it('défauts (toutes/desc/50/0) + shape { lignes, total, … } + total retiré des lignes', async () => {
    queryMock.mockResolvedValue({ rows: [LIGNE] });
    const res = await GET_JOURNAL(reqJournal(''));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ total: 3, limit: 50, offset: 0, ordre: 'desc', famille: 'toutes' });
    expect(body.lignes).toHaveLength(1);
    expect(body.lignes[0]).not.toHaveProperty('total');
    expect(body.lignes[0]).toMatchObject({ action: 'rattachement', nom_affiche: 'Maison', famille_affiche: 'mh', supprimee: false });
    expect(queryMock.mock.calls[0][1]).toEqual(['toutes', 50, 0]);
    const sql = sqlsEmis()[0];
    expect(/ORDER BY l\.id DESC/.test(sql)).toBe(true);
    expect(/LEFT JOIN LATERAL/.test(sql)).toBe(true);
    expect(/suppression_entite_manuelle/.test(sql)).toBe(true);
  });

  it('famille/ordre/limit/offset respectés + clamp limit à 200', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await GET_JOURNAL(reqJournal('?famille=mh&ordre=asc&limit=999&offset=20'));
    const body = await res.json();
    expect(body).toMatchObject({ famille: 'mh', ordre: 'asc', limit: 200, offset: 20, total: 0 });
    expect(queryMock.mock.calls[0][1]).toEqual(['mh', 200, 20]);
    expect(/ORDER BY l\.id ASC/.test(sqlsEmis()[0])).toBe(true);
  });

  it('famille invalide → toutes ; limit aberrant → 50 ; offset négatif → 0', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await GET_JOURNAL(reqJournal('?famille=chateau&limit=-3&offset=-1'));
    expect(queryMock.mock.calls[0][1]).toEqual(['toutes', 50, 0]);
  });

  it('entité supprimée : nom/famille résolus en SQL (COALESCE e/sup/fallback) + supprimee', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...LIGNE, nom_affiche: 'Hotel de ville', famille_affiche: 'inconnue', supprimee: true }] });
    const body = await (await GET_JOURNAL(reqJournal(''))).json();
    expect(body.lignes[0]).toMatchObject({ supprimee: true, famille_affiche: 'inconnue' });
    const sql = sqlsEmis()[0];
    expect(/COALESCE\(e\.nom, sup\.nom, 'entité supprimée #' \|\| l\.entite_id\)/.test(sql)).toBe(true);
    expect(/COALESCE\(e\.famille, sup\.famille, 'inconnue'\)/.test(sql)).toBe(true);
    expect(/\(e\.id IS NULL\) AS supprimee/.test(sql)).toBe(true);
    // filtre famille : une entité 'inconnue' n'apparaît que sous 'toutes'
    expect(/WHERE \(\$1 = 'toutes' OR COALESCE\(e\.famille, sup\.famille\) = \$1\)/.test(sql)).toBe(true);
  });

  it('LECTURE STRICTE : aucune écriture émise', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await GET_JOURNAL(reqJournal(''));
    expect(ecritureEmise()).toBe(false);
    expect(sqlsEmis().some((s) => /INSERT INTO|UPDATE |DELETE FROM/.test(s))).toBe(false);
  });

  it('erreur SQL → 503', async () => {
    queryMock.mockRejectedValue(new Error('boom'));
    expect((await GET_JOURNAL(reqJournal(''))).status).toBe(503);
  });
});

describe('GET /api/admin/curation/entites/[id]/journal', () => {
  it('id invalide → 422, aucune requête', async () => {
    const res = await GET_ENTITE_JOURNAL(req('GET'), ctx('abc'));
    expect(res.status).toBe(422);
    expect(sqlsEmis().length).toBe(0);
  });

  it('filtré entite_id, tri id DESC, LIMIT 200, entite dérivée de la 1re ligne', async () => {
    queryMock.mockResolvedValue({ rows: [
      { id: '20', ts: 't2', action: 'renommage', entite_id: 5, cleabs: null, avant: { nom: null }, apres: { nom: 'X' }, nom_affiche: 'X', famille_affiche: 'mh', supprimee: false },
      { id: '12', ts: 't1', action: 'creation_entite_manuelle', entite_id: 5, cleabs: null, avant: null, apres: { nom: 'X' }, nom_affiche: 'X', famille_affiche: 'mh', supprimee: false },
    ] });
    const body = await (await GET_ENTITE_JOURNAL(req('GET'), ctx('5'))).json();
    expect(body.lignes).toHaveLength(2);
    expect(body.entite).toEqual({ id: 5, nom_affiche: 'X', famille_affiche: 'mh', supprimee: false });
    const sql = sqlsEmis()[0];
    expect(/WHERE l\.entite_id = \$1/.test(sql)).toBe(true);
    expect(/ORDER BY l\.id DESC/.test(sql)).toBe(true);
    expect(/LIMIT 200/.test(sql)).toBe(true);
    expect(queryMock.mock.calls[0][1]).toEqual([5]);
  });

  it('aucune ligne → entite fallback (inconnue, non supprimée)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const body = await (await GET_ENTITE_JOURNAL(req('GET'), ctx('7'))).json();
    expect(body.entite).toMatchObject({ id: 7, famille_affiche: 'inconnue', supprimee: false });
  });

  it('erreur SQL → 503', async () => {
    queryMock.mockRejectedValue(new Error('boom'));
    expect((await GET_ENTITE_JOURNAL(req('GET'), ctx('5'))).status).toBe(503);
  });
});

describe('a_historique (flag liste + mapping versEntite)', () => {
  it('GET /entites : SELECT expose a_historique via EXISTS corrélé sans filtre d’action', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await GET_ENTITES();
    expect(/EXISTS\(SELECT 1 FROM curation_patrimoine_log l WHERE l\.entite_id = e\.id\) AS a_historique/.test(sqlsEmis()[0])).toBe(true);
  });

  it('versEntite mappe a_historique → aHistorique', () => {
    const base: LigneEntiteDB = {
      id: 1, famille: 'mh', ref_code: 'X', nom: 'N', statut: null, origine: null,
      point_geojson: null, corrige: false, a_historique: true, liaisons: null,
    };
    expect(versEntite(base).aHistorique).toBe(true);
    expect(versEntite({ ...base, a_historique: false }).aHistorique).toBe(false);
  });
});
