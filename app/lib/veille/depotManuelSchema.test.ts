import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * N1-A — garde-fous STATIQUES de la migration 102 (versement automatique en GED). DDL strictement ADDITIVE : une colonne
 * config_veille, une table journal, un index unique — tous IF NOT EXISTS. Aucun UPDATE/DROP/trigger, une seule transaction, ne
 * touche pas demande.statut. Aucune connexion DB (lecture du fichier).
 */
const migration = readFileSync('db/migrations/102_depot_manuel_ged.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const norm = code.replace(/\s+/g, ' ');

describe('N1-A — migration 102 : depot_adresses_connues + depot_manuel_journal + index unique GED', () => {
  it('config_veille.depot_adresses_connues : ADD COLUMN IF NOT EXISTS text NOT NULL DEFAULT vide', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+depot_adresses_connues\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
  });

  it('depot_manuel_journal : CREATE TABLE IF NOT EXISTS, PK sur message_id (idempotence au grain message)', () => {
    expect(/CREATE TABLE IF NOT EXISTS depot_manuel_journal/i.test(code)).toBe(true);
    expect(norm).toContain('message_id text PRIMARY KEY');
    expect(norm).toContain('issue text NOT NULL');
  });

  it('index UNIQUE (dossier_id, empreinte_sha256) sur dossier_document : CREATE UNIQUE INDEX IF NOT EXISTS', () => {
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS\s+dossier_document_dossier_empreinte_key\s+ON dossier_document \(dossier_id, empreinte_sha256\)/i.test(norm)).toBe(true);
  });

  it('additive PURE : aucun UPDATE/DELETE/TRUNCATE, aucun DROP, aucun trigger, aucun backfill ; une seule transaction', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });

  it('ne touche NI demande.statut NI le moteur de score', () => {
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/config_scoring|batiment_vue|score/i.test(code)).toBe(false);
  });
});
