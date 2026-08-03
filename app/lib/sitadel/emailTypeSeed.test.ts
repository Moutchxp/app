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
  // SQL réel (hors lignes de commentaire `--`, qui citent volontairement « ON CONFLICT » pour l'expliquer).
  const code = seed.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  it('CAUSE VERROUILLÉE : ne crée JAMAIS de ligne — UPDATE, pas INSERT ... ON CONFLICT dans mairie_contact', () => {
    expect(code).not.toContain('ON CONFLICT');                 // un INSERT..ON CONFLICT échouait sur le CHECK de cohérence
    expect(code).not.toContain('INSERT INTO mairie_contact ('); // seule écriture INSERT tolérée : mairie_contact_journal
    expect(code).toContain('UPDATE mairie_contact');
    expect(code).toMatch(/SET\s+email_type\s*=\s*c\.email_type/); // pose SEULEMENT email_type
    expect(code).not.toMatch(/SET[^;]*\bcanal\s*=/);             // n'écrase pas le canal
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
