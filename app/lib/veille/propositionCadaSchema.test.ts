import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * X5 — garde-fous STATIQUES de la migration 084 (proposition CADA). STRICTEMENT additive : CREATE TABLE IF NOT EXISTS +
 * ADD COLUMN IF NOT EXISTS. La CONTRAINTE D'UNICITÉ sur demande_id est le garde-fou « une seule proposition par demande ».
 * Aucune connexion DB (contrôle du texte, comme les autres *Schema.test.ts).
 */
const migration = readFileSync('db/migrations/084_proposition_cada.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('X5 — migration 084 : table proposition_cada + interrupteur config', () => {
  it('crée la table proposition_cada (IF NOT EXISTS) avec demande_id FK vers demande', () => {
    expect(/CREATE TABLE IF NOT EXISTS\s+proposition_cada/i.test(code)).toBe(true);
    expect(/demande_id\s+bigint\s+NOT NULL\s+REFERENCES\s+demande\s*\(\s*id\s*\)/i.test(code)).toBe(true);
    expect(/envoyee_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/message_id\s+text/i.test(code)).toBe(true);
  });

  it('CONTRAINTE D’UNICITÉ sur demande_id (le garde « une seule proposition par demande ») + COMMENT sur ce rôle', () => {
    expect(/CONSTRAINT\s+proposition_cada_demande_id_uniq\s+UNIQUE\s*\(\s*demande_id\s*\)/i.test(code)).toBe(true);
    // Le COMMENT explique explicitement le rôle anti-doublon de cette unique.
    expect(/COMMENT ON CONSTRAINT\s+proposition_cada_demande_id_uniq/i.test(code)).toBe(true);
    const norm = code.replace(/\s+/g, ' ');
    expect(norm).toMatch(/une seule proposition par demande/i);
  });

  it('config_veille.proposition_cada_active : booléen NOT NULL DEFAULT false (opt-in) + COMMENT', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+proposition_cada_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN\s+config_veille\.proposition_cada_active/i.test(code)).toBe(true);
  });

  it('sûreté : strictement additive (aucun DROP), aucune mutation de données, une seule transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
