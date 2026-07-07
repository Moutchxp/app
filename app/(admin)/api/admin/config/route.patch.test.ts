import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { PATCH } from './route';

/** Ligne actuelle (id=1) minimale, cohérente (mode valide, dmax ≤ portée). */
function ligneActuelle(): Record<string, unknown> {
  return {
    id: 1,
    mode_combinaison: 'max',
    distance_max_m: 200,
    analysis_range_m: 200,
    plafond_degagement: 80,
  };
}

/** Renvoie la ligne actuelle au SELECT et la ligne fusionnée au UPDATE (CTE). */
function branche(patchApplique: Record<string, unknown> = {}) {
  queryMock.mockImplementation((text: unknown) => {
    if (typeof text === 'string' && text.includes('UPDATE config_scoring')) {
      return Promise.resolve({ rows: [{ ...ligneActuelle(), ...patchApplique }] });
    }
    return Promise.resolve({ rows: [ligneActuelle()] });
  });
}

/** Vrai si un query d'écriture (UPDATE) a été émis. */
function ecritureEmise(): boolean {
  return queryMock.mock.calls.some(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE config_scoring'),
  );
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('PATCH /api/admin/config', () => {
  it('VIVE valide → 200 + un UPDATE émis + journal (CTE) + ligne MAJ', async () => {
    branche({ plafond_degagement: 85 });
    const res = await PATCH(req({ plafond_degagement: 85 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.valeurs.plafond_degagement).toBe(85);
    expect(body.repli.actif).toBe(true);
    expect(ecritureEmise()).toBe(true);
    // La CTE d'écriture insère bien dans le journal.
    const ecriture = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE config_scoring'),
    )!;
    expect(ecriture[0] as string).toContain('config_edit_log');
  });

  it('hors plage → 422 + AUCUN query d’écriture', async () => {
    branche();
    const res = await PATCH(req({ plafond_degagement: 5000 }));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('VESTIGIALE (boost_f2) → 422 + aucune écriture', async () => {
    branche();
    const res = await PATCH(req({ boost_f2: 0.5 }));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('borne_annee_1900 (neutralisée VESTIGIALE) → 422 « non éditable » + aucune écriture (EX-19)', async () => {
    branche();
    const res = await PATCH(req({ borne_annee_1900: 1899 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreurs.some((e: { message: string }) => e.message.includes('non éditable'))).toBe(true);
    expect(ecritureEmise()).toBe(false);
  });

  it('mode_combinaison hors liste → 422', async () => {
    branche();
    const res = await PATCH(req({ mode_combinaison: 'xyz' }));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('distance_max_m > portée (résultant) → 422 (anti-repli)', async () => {
    branche();
    const res = await PATCH(req({ distance_max_m: 300 }));
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });

  it('paire {distance_max_m, analysis_range_m} groupée valide → 200 + 2 colonnes dans le SET', async () => {
    branche({ distance_max_m: 300, analysis_range_m: 300 });
    const res = await PATCH(req({ distance_max_m: 300, analysis_range_m: 300 }));
    expect(res.status).toBe(200);
    const ecriture = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE config_scoring'),
    )!;
    const sql = ecriture[0] as string;
    expect(sql).toContain('"distance_max_m"');
    expect(sql).toContain('"analysis_range_m"');
  });

  it('paire groupée menant à dmax > portée → 422 + aucune écriture', async () => {
    branche();
    // Les deux champs présents, mais la ligne résultante viole distance_max_m ≤ analysis_range_m.
    const res = await PATCH(req({ distance_max_m: 300, analysis_range_m: 200 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(Array.isArray(body.erreurs)).toBe(true);
    // Anti-repli : AUCUN UPDATE émis (seul le SELECT de lecture a pu partir).
    expect(ecritureEmise()).toBe(false);
  });

  it('clé de body hors allowlist (injection) → 422 « colonne inconnue » + aucune écriture', async () => {
    branche();
    const cleInjection = 'distance_max_m = 1; DROP TABLE config_scoring --';
    const res = await PATCH(req({ [cleInjection]: 5 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreurs.some((e: { message: string }) => e.message.includes('colonne inconnue'))).toBe(
      true,
    );
    // La clé brute n'est jamais atteinte par une écriture.
    expect(ecritureEmise()).toBe(false);
  });

  it('corps JSON invalide → 422 + aucune écriture', async () => {
    branche();
    const bad = new Request('http://localhost/api/admin/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{ pas du json',
    });
    const res = await PATCH(bad);
    expect(res.status).toBe(422);
    expect(ecritureEmise()).toBe(false);
  });
});
