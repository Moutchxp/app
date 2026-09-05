import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PL-C2 — 🔴 GARDE « SÉLECTION D'ABORD » dans figerEmpreinte (le point #1 du diff). Test UNITAIRE (db mockée, routée par fragment
 * SQL) : quand une sélection existe, figerEmpreinte calcule l'empreinte DEPUIS la sélection et NE re-snapshote PAS `permis_parcelle` ;
 * quand il n'y en a pas (ou table 202 absente), il reprend EXACTEMENT le chemin automatique. Le byte-identique sur rejeu réel est
 * prouvé en intégration (selectionParcelleRepo.itest.ts).
 */

let selRows: { total: number; avec: number }[] = [{ total: 0, avec: 0 }]; // réponse à la requête « sélection existe ? »
let selThrows = false;                                                    // simule migration 202 absente (42P01)
const emis: string[] = [];

vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => {
    emis.push(sql);
    if (/FROM permis_parcelle_selection WHERE dossier_id/.test(sql)) {
      if (selThrows) { const e = new Error('relation "permis_parcelle_selection" does not exist') as Error & { code: string }; e.code = '42P01'; throw e; }
      return { rows: selRows, rowCount: selRows.length };
    }
    if (/count\(\*\)::int AS total[\s\S]*FROM permis_parcelle WHERE dossier_id/.test(sql)) return { rows: [{ total: 3, avec: 3 }], rowCount: 1 }; // complétude AUTO
    if (/INSERT INTO permis_empreinte/.test(sql)) return { rows: [{ surface: 100, nb: 3, mill: '2026-06-01' }], rowCount: 1 };
    return { rows: [], rowCount: 0 }; // UPDATE permis_parcelle (snapshot auto), etc.
  }),
  withTransaction: vi.fn(),
}));
vi.mock('./editionBdTopo', () => ({ millesimeEditionCourante: vi.fn(async () => '2026-06-15'), MILLESIME_INCONNU: '__inconnu__' }));

import { figerEmpreinte } from './parcellesRepo';

beforeEach(() => { emis.length = 0; selRows = [{ total: 0, avec: 0 }]; selThrows = false; vi.clearAllMocks(); });
const sql = () => emis.join('\n').replace(/\s+/g, ' ');

describe('figerEmpreinte — garde « sélection d’abord »', () => {
  it('SÉLECTION présente → empreinte DEPUIS la sélection, et JAMAIS de re-snapshot de permis_parcelle', async () => {
    selRows = [{ total: 2, avec: 2 }];
    const r = await figerEmpreinte(7424, '2');
    const s = sql();
    expect(s).toContain('INSERT INTO permis_empreinte'); // l'empreinte est écrite…
    expect(s).toContain('FROM permis_parcelle_selection WHERE dossier_id = $1 AND geom_snapshot IS NOT NULL'); // …DEPUIS la sélection
    expect(s).not.toMatch(/UPDATE permis_parcelle pp/); // 🔴 le snapshot AUTO (re-snapshot de permis_parcelle) N'A PAS eu lieu
    expect(r.complete).toBe(true);
  });
  it('AUCUNE sélection → chemin AUTOMATIQUE : re-snapshot de permis_parcelle + union des parcelles d’origine', async () => {
    selRows = [{ total: 0, avec: 0 }];
    await figerEmpreinte(7424, '2');
    const s = sql();
    expect(s).toMatch(/UPDATE permis_parcelle pp\s+SET geom_snapshot/); // le snapshot AUTO a lieu
    expect(s).toContain("FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine' AND geom_snapshot IS NOT NULL");
    expect(s).not.toContain('FROM permis_parcelle_selection WHERE dossier_id = $1 AND geom_snapshot'); // pas le chemin sélection
  });
  it('migration 202 ABSENTE (42P01) → RÉSILIENT : chemin automatique, jamais une panne', async () => {
    selThrows = true;
    await figerEmpreinte(7424, '2');
    expect(sql()).toMatch(/UPDATE permis_parcelle pp\s+SET geom_snapshot/); // retombe sur l'automatique sans lever
  });
});
