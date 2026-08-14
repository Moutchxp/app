import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * T7-C — garde-fous STATIQUES de la migration 101 (pré-cochage « répondu » : ancre anti-résurrection repondu_auto_le).
 * DDL strictement ADDITIVE : une colonne nullable, aucun backfill, aucun UPDATE, aucun CHECK, aucun trigger. Ne touche NI
 * demande.statut NI satisfait_le NI Archives. Aucune connexion DB (lecture du fichier).
 */
const migration = readFileSync('db/migrations/101_reponse_repondu_auto.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('T7-C — migration 101 : repondu_auto_le (ancre anti-résurrection)', () => {
  it('repondu_auto_le : ADD COLUMN IF NOT EXISTS timestamptz, nullable', () => {
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+repondu_auto_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/repondu_auto_le\s+timestamptz\s+NOT NULL/i.test(code)).toBe(false); // DOIT rester nullable (NULL = candidat)
  });

  it('additive PURE : aucun UPDATE/DELETE/backfill/INSERT, aucun DROP, aucun CHECK, aucun trigger', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/\bCHECK\b|CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });

  it('ne touche NI demande.statut NI satisfait_le NI Archives ; une seule transaction', () => {
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/satisfait_le\s*=/i.test(code)).toBe(false);
    expect(/UPDATE[\s\S]*(dossier_document|demande_dossier)/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
