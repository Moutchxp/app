import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * G1 — garde-fous STATIQUES de la migration 098 (journal d'idempotence des alertes GED). DDL additive : table alerte_ged
 * (reponse_id × dossier_id × type ∈ j3|h24), unique (reponse_id, coalesce(dossier_id,0), type), en_retard visible.
 * Ne touche PAS demande.statut, ne pose aucun satisfait_le. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/098_alerte_ged.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('G1 — migration 098 : journal alerte_ged', () => {
  it('table alerte_ged : CREATE IF NOT EXISTS, FK CASCADE vers réponse et dossier, dossier_id NULLABLE', () => {
    expect(/CREATE TABLE IF NOT EXISTS alerte_ged/i.test(code)).toBe(true);
    expect(/reponse_id\s+bigint\s+NOT NULL\s+REFERENCES demande_reponse\(id\)\s+ON DELETE CASCADE/i.test(code)).toBe(true);
    expect(/dossier_id\s+bigint\s+REFERENCES sitadel_dossier\(id\)\s+ON DELETE CASCADE/i.test(code)).toBe(true); // nullable (pas de NOT NULL)
  });

  it('type : liste fermée j3|h24 ; en_retard booléen ; seuil_le NOT NULL', () => {
    const m = code.match(/type\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("'j3'");
    expect(m![1]).toContain("'h24'");
    expect(/en_retard\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(/seuil_le\s+timestamptz\s+NOT NULL/i.test(code)).toBe(true);
  });

  it('idempotence : UNIQUE (reponse_id, coalesce(dossier_id, 0), type) — une réponse non rattachée n’a qu’une alerte par type', () => {
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS alerte_ged_unique ON alerte_ged \(reponse_id,\s*coalesce\(dossier_id,\s*0\),\s*type\)/i.test(code)).toBe(true);
  });

  it('additive : aucun DROP/DELETE/TRUNCATE/UPDATE, ne touche pas demande.statut ni satisfait_le ; une transaction ; aucun trigger', () => {
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut|satisfait_le\s*=/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
