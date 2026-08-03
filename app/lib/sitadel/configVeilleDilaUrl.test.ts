import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DILA_URL_DEFAUT } from './veilleConfig';

/**
 * S30 — garde-fous STATIQUES de la migration 069 (URL DILA éditable dans config_veille). DDL additive, colonne NOT NULL avec
 * le défaut = DILA_URL_DEFAUT (ancrage), CHECK de forme http(s), aucun DROP. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/069_config_veille_dila_url.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S30 — migration 069 : colonne dila_url éditable', () => {
  it('ADD COLUMN IF NOT EXISTS, NOT NULL, additive (aucun DROP/DELETE)', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+dila_url\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });
  it('le DEFAULT du SQL est EXACTEMENT DILA_URL_DEFAUT (ancrage code ↔ migration)', () => {
    expect(code).toContain(`DEFAULT '${DILA_URL_DEFAUT}'`);
  });
  it('CHECK de forme http(s):// présent, idempotent (duplicate_object)', () => {
    expect(/ADD CONSTRAINT\s+config_veille_dila_url_check\s+CHECK\s*\(\s*dila_url\s*~\*?\s*'\^https\?/i.test(code)).toBe(true);
    expect(/duplicate_object/i.test(code)).toBe(true);
  });
  it('une seule transaction', () => {
    expect(/BEGIN;/.test(code)).toBe(true);
    expect(/COMMIT;/.test(code)).toBe(true);
  });
});
