import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S19 — garde-fous statiques : migration 067 (additive/idempotente) et seed 2026-08-03c (pose SEULEMENT email_type, sans
 * écraser l'e-mail). cwd de vitest = racine du dépôt.
 */
const migration = readFileSync('db/migrations/067_mairie_coordonnees.sql', 'utf8');
const seed = readFileSync('db/seed/2026-08-03c_email_type.sql', 'utf8');

describe('S19 — migration 067 (additive, idempotente)', () => {
  it('ADD COLUMN IF NOT EXISTS + CHECK gardée, aucun DROP réel, un seul BEGIN/COMMIT', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS telephone_standard');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS email_type');
    expect(migration).toContain("email_type IN ('urbanisme','accueil','prada','inconnu')");
    expect(migration).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/); // contrainte idempotente
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|VIEW)/i);
    expect((migration.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });
});

describe('S19 — seed email_type', () => {
  const set = seed.slice(seed.indexOf('DO UPDATE SET'));
  const clause = set.slice(0, set.indexOf(';'));
  it('le DO UPDATE SET ne pose QUE email_type (n’écrase ni email ni canal)', () => {
    expect(clause).toContain('email_type = EXCLUDED.email_type');
    expect(clause).not.toMatch(/\bemail\s*=\s*EXCLUDED/); // pas d'email = ... (le mot email_type ne compte pas : \bemail\s*=)
    expect(clause).not.toMatch(/\bcanal\s*=/);
  });
  it('9 communes urbanisme + Flins (78238) accueil', () => {
    for (const code of ['78646', '78322', '78575', '78571', '78475', '92004', '93001', '93063', '93015']) expect(seed).toContain(`'${code}'`);
    expect(seed).toContain("'78238'");
    expect(seed).toContain("'accueil'");
    expect(seed).toContain("'urbanisme'");
  });
  it('idempotence : marqueur email_type IS DISTINCT FROM, un seul BEGIN/COMMIT', () => {
    expect(seed).toContain('email_type IS DISTINCT FROM');
    expect((seed.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((seed.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });
});
