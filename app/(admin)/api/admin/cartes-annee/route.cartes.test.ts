import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test.
// Les DEUX routes (route.ts et [id]/route.ts) importent le même chemin depuis la même
// profondeur (`../../../../lib/db/client` vs `../../../../../lib/db/client`) : ce mock cible
// le module réel, donc les deux le reçoivent mocké.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

/** Les 2 cartes seed (comme la migration 006), avec id. */
function cartesExistantes() {
  return [
    { id: 1, borne_min: null, op_min: null, borne_max: 1900, op_max: '<=', cone: 1.5, flanc: 1.2, distmax_m: 300 },
    { id: 2, borne_min: 1900, op_min: '>', borne_max: 1935, op_max: '<=', cone: 1.2, flanc: 1.1, distmax_m: 200 },
  ];
}

/**
 * Le SELECT de lecture renvoie les cartes existantes ; toute écriture (CTE INSERT/UPDATE/DELETE)
 * renvoie une ligne plausible. Le paramètre permet de piloter la ligne RETURNING d'une écriture.
 */
function branche(ligneEcrite: Record<string, unknown> = cartesExistantes()[1]) {
  queryMock.mockImplementation((text: unknown) => {
    if (typeof text === 'string' && ecritureSql(text)) {
      return Promise.resolve({ rows: [ligneEcrite] });
    }
    // SELECT (liste complète, ou WHERE id = $1 pour le DELETE : on renvoie la carte 2).
    if (typeof text === 'string' && text.includes('WHERE id = $1') && text.includes('SELECT')) {
      return Promise.resolve({ rows: [cartesExistantes()[1]] });
    }
    return Promise.resolve({ rows: cartesExistantes() });
  });
}

/** Reconnaît une requête d'ÉCRITURE (jamais un simple SELECT de lecture). */
function ecritureSql(text: string): boolean {
  return (
    text.includes('INSERT INTO config_famille_annee') ||
    text.includes('UPDATE config_famille_annee') ||
    text.includes('DELETE FROM config_famille_annee')
  );
}

/** Vrai si un query d'écriture (INSERT/UPDATE/DELETE de cartes) a été émis. */
function ecritureEmise(): boolean {
  return queryMock.mock.calls.some((c) => typeof c[0] === 'string' && ecritureSql(c[0] as string));
}

/** Vrai si l'écriture émise consigne bien le journal `config_edit_log`. */
function journalEmis(): boolean {
  return queryMock.mock.calls.some(
    (c) => typeof c[0] === 'string' && ecritureSql(c[0] as string) && (c[0] as string).includes('config_edit_log'),
  );
}

/**
 * SELECT renvoie les cartes existantes (la validation applicative passe) ; toute ÉCRITURE rejette
 * avec le SQLSTATE donné — simule la contrainte DB EXCLUDE (migration 007) déclenchée par une
 * écriture CONCURRENTE (23P01 = exclusion_violation) que la validation applicative n'avait pas vue.
 */
function brancheErreurEcriture(code: string) {
  queryMock.mockImplementation((text: unknown) => {
    if (typeof text === 'string' && ecritureSql(text)) {
      return Promise.reject(Object.assign(new Error('contrainte DB'), { code }));
    }
    if (typeof text === 'string' && text.includes('WHERE id = $1') && text.includes('SELECT')) {
      return Promise.resolve({ rows: [cartesExistantes()[1]] });
    }
    return Promise.resolve({ rows: cartesExistantes() });
  });
}

function reqPost(body: unknown): Request {
  return new Request('http://localhost/api/admin/cartes-annee', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function reqPatch(body: unknown): Request {
  return new Request('http://localhost/api/admin/cartes-annee/2', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /api/admin/cartes-annee', () => {
  it('renvoie la liste des cartes (id + camelCase)', async () => {
    branche();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cartes).toHaveLength(2);
    expect(body.cartes[0]).toMatchObject({ id: 1, borneMax: 1900, opMax: '<=', cone: 1.5, distMaxM: 300 });
  });

  it('query rejette → 503', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(res.status).toBe(503);
  });
});

describe('POST /api/admin/cartes-annee', () => {
  it('carte valide (≥ 2020, disjointe) → 200 + INSERT + journal', async () => {
    branche({ id: 3, borne_min: 2020, op_min: '>=', borne_max: null, op_max: null, cone: 1.1, flanc: 1.05, distmax_m: 150 });
    const res = await POST(
      reqPost({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.carte).toMatchObject({ id: 3, borneMin: 2020, opMin: '>=' });
    expect(ecritureEmise()).toBe(true);
    expect(journalEmis()).toBe(true);
  });

  it('carte chevauchant une existante (≥ 1900 vs ≤ 1900) → 422 + AUCUNE écriture', async () => {
    branche();
    const res = await POST(
      reqPost({ borneMin: 1900, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
    );
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('écriture concurrente rejetée par la contrainte DB (23P01) → 422 non-chevauchement', async () => {
    brancheErreurEcriture('23P01');
    const res = await POST(
      reqPost({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreurs?.[0]?.message).toMatch(/chevauchement/i);
  });

  it('autre erreur DB (non 23P01) → 503', async () => {
    brancheErreurEcriture('08006');
    const res = await POST(
      reqPost({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
    );
    expect(res.status).toBe(503);
  });

  it('carte à intervalle vide (> 1935 et < 1930) → 422 + AUCUNE écriture', async () => {
    branche();
    const res = await POST(
      reqPost({ borneMin: 1935, opMin: '>', borneMax: 1930, opMax: '<', cone: 1.1, flanc: 1.05, distMaxM: 150 }),
    );
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('coefficient hors plage (distMaxM = 0) → 422 + AUCUNE écriture', async () => {
    branche();
    const res = await POST(
      reqPost({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 0 }),
    );
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('corps JSON invalide → 422 + AUCUNE écriture', async () => {
    branche();
    const bad = new Request('http://localhost/api/admin/cartes-annee', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ pas du json',
    });
    const res = await POST(bad);
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('PATCH /api/admin/cartes-annee/[id]', () => {
  it('modif valide de la carte #2 → 200 + UPDATE + journal', async () => {
    branche({ id: 2, borne_min: 1900, op_min: '>', borne_max: 1935, op_max: '<=', cone: 1.3, flanc: 1.1, distmax_m: 200 });
    const res = await PATCH(
      reqPatch({ borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=', cone: 1.3, flanc: 1.1, distMaxM: 200 }),
      ctx('2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.carte).toMatchObject({ id: 2, cone: 1.3 });
    expect(ecritureEmise()).toBe(true);
    expect(journalEmis()).toBe(true);
  });

  it('modif concurrente rejetée par la contrainte DB (23P01) → 422 non-chevauchement', async () => {
    brancheErreurEcriture('23P01');
    const res = await PATCH(
      reqPatch({ borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=', cone: 1.2, flanc: 1.1, distMaxM: 200 }),
      ctx('2'),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreurs?.[0]?.message).toMatch(/chevauchement/i);
  });

  it('modif rendant la carte #2 chevauchante (≤ 1900) → 422 + AUCUNE écriture', async () => {
    branche();
    const res = await PATCH(
      reqPatch({ borneMin: null, opMin: null, borneMax: 1900, opMax: '<=', cone: 1.2, flanc: 1.1, distMaxM: 200 }),
      ctx('2'),
    );
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('carte inconnue → 404 + AUCUNE écriture', async () => {
    branche();
    const res = await PATCH(
      reqPatch({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
      ctx('999'),
    );
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });

  it('identifiant invalide → 422 + AUCUNE écriture', async () => {
    branche();
    const res = await PATCH(
      reqPatch({ borneMin: 2020, opMin: '>=', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 }),
      ctx('abc'),
    );
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });
});

describe('DELETE /api/admin/cartes-annee/[id]', () => {
  it('suppression de la carte #2 → 200 + DELETE + journal', async () => {
    branche({ id: 2 });
    const res = await DELETE(new Request('http://localhost/api/admin/cartes-annee/2', { method: 'DELETE' }), ctx('2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(ecritureEmise()).toBe(true);
    expect(journalEmis()).toBe(true);
  });

  it('carte inconnue → 404 + AUCUNE écriture', async () => {
    queryMock.mockImplementation((text: unknown) => {
      if (typeof text === 'string' && ecritureSql(text)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] }); // SELECT WHERE id → aucune ligne
    });
    const res = await DELETE(new Request('http://localhost/api/admin/cartes-annee/999', { method: 'DELETE' }), ctx('999'));
    expect(res.status).toBe(404);
    expect(ecritureEmise()).toBe(false);
  });
});

// NOTE : la garde de session (proxy.ts, sans session → 401) s'applique en amont au niveau
// du proxy Next et n'est PAS testable unitairement sur ces handlers (elle n'entre jamais ici).
