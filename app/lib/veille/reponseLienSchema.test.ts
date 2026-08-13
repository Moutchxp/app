import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * L1 — garde-fous STATIQUES de la migration 097 (liens d'une réponse mairie). DDL additive : demande_reponse.corps_html +
 * table demande_reponse_lien (fort, expire_le nullable, expiration_source CHECK, UNIQUE(reponse_id,url), FK CASCADE).
 * Ne touche PAS demande.statut, ne pose aucun satisfait_le, ne bascule rien vers Archives. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/097_reponse_lien.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('L1 — migration 097 : liens d’une réponse mairie', () => {
  it('demande_reponse.corps_html : ADD COLUMN IF NOT EXISTS (nullable)', () => {
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+corps_html\s+text/i.test(code)).toBe(true);
  });

  it('table demande_reponse_lien : CREATE IF NOT EXISTS, FK CASCADE, fort bool, expire_le nullable, UNIQUE(reponse_id,url)', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_reponse_lien/i.test(code)).toBe(true);
    expect(/reponse_id\s+bigint\s+NOT NULL\s+REFERENCES demande_reponse\(id\)\s+ON DELETE CASCADE/i.test(code)).toBe(true);
    expect(/url\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/fort\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(/UNIQUE\s*\(reponse_id,\s*url\)/i.test(code)).toBe(true);
  });

  it('expiration_source : liste fermée absolue|relative (ou NULL)', () => {
    const m = code.match(/expiration_source\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("'absolue'");
    expect(m![1]).toContain("'relative'");
  });

  it('additive : aucun DROP/DELETE/TRUNCATE/UPDATE, ne touche pas demande.statut ni satisfait_le ; une transaction ; aucun trigger', () => {
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut|satisfait_le\s*=/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
