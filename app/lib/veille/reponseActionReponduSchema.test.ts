import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * T7-B — garde-fous STATIQUES de la migration 100 (cas ③ : alerte_action_le + repondu_le/repondu_par, au grain MESSAGE).
 * DDL strictement ADDITIVE : trois colonnes nullables, aucun backfill, aucun UPDATE, aucun CHECK, aucun trigger. Ne touche NI
 * demande.statut NI satisfait_le NI Archives. Aucune connexion DB (lecture du fichier).
 */
const migration = readFileSync('db/migrations/100_reponse_action_repondu.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('T7-B — migration 100 : alerte_action_le + repondu_le/repondu_par', () => {
  it('les trois colonnes sont ajoutées en ADD COLUMN IF NOT EXISTS (timestamptz / text), nullables', () => {
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+alerte_action_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+repondu_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+repondu_par\s+text/i.test(code)).toBe(true);
    // jamais NOT NULL (l'idempotence et le « pas encore répondu » EXIGENT NULL comme état initial).
    for (const col of ['alerte_action_le', 'repondu_le', 'repondu_par']) {
      expect(new RegExp(`${col}\\s+(?:timestamptz|text)\\s+NOT NULL`, 'i').test(code)).toBe(false);
    }
  });

  it('additive PURE : aucun UPDATE/DELETE/backfill, aucun DROP, aucun CHECK, aucun trigger', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/\bCHECK\b|CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });

  it('ne touche NI demande.statut NI satisfait_le NI Archives ; une seule transaction', () => {
    // Migration additive PURE : aucune ÉCRITURE (le mot « satisfait_le » n'apparaît que dans un COMMENT explicatif, jamais dans
    //   une affectation). On interdit donc les ASSIGNATIONS, pas la mention documentaire.
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/satisfait_le\s*=/i.test(code)).toBe(false);
    expect(/UPDATE[\s\S]*(dossier_document|demande_dossier)/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
