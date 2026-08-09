import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * W1 — garde-fous STATIQUES de la migration 082. Additive : demande_acheminement.relance_id (bigint NULL, FK →
 * demande_relance) + index. NULL = émission initiale, non-NULL = relance. Ne touche PAS demande.statut, aucun DROP, une
 * transaction. Aucune connexion DB (contrôle du texte du fichier, comme les autres *Schema.test.ts).
 */
const migration = readFileSync('db/migrations/082_acheminement_relance.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('W1 — migration 082 : demande_acheminement.relance_id', () => {
  it('ADD COLUMN relance_id bigint NULLABLE, FK vers demande_relance(id)', () => {
    expect(/ALTER TABLE demande_acheminement\s+ADD COLUMN IF NOT EXISTS\s+relance_id\s+bigint\s+REFERENCES\s+demande_relance\s*\(\s*id\s*\)/i.test(code)).toBe(true);
    expect(/relance_id[^;]*NOT NULL/i.test(code)).toBe(false); // nullable : NULL = émission initiale
  });

  it('index sur relance_id', () => {
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_acheminement_relance_idx\s+ON\s+demande_acheminement\s*\(\s*relance_id\s*\)/i.test(code)).toBe(true);
  });

  it('COMMENT documente NULL = émission INITIALE (et rappel émission ≠ réception)', () => {
    expect(/COMMENT ON COLUMN demande_acheminement\.relance_id/i.test(code)).toBe(true);
    expect(/NULL\s*=\s*émission INITIALE/i.test(code)).toBe(true);
    expect(/ÉMISSION[\s\S]*jamais[\s\S]*RÉCEPTION/i.test(code)).toBe(true);
  });

  it('additive : aucun DROP/UPDATE/DELETE/TRUNCATE, ne touche pas demande.statut, une transaction, aucun trigger', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
