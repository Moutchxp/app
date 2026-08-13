import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * T3 — garde-fous STATIQUES de la migration 096 (nature d'un message entrant + compteur d'accusés au journal). DDL additive :
 * demande_reponse.nature (liste fermée, défaut 'indetermine', CHECK recréé par DROP IF EXISTS + ADD) + releve_run.accuses.
 * Ne touche PAS demande.statut, ne pose aucun satisfait_le, ne bascule rien vers Archives. Aucune connexion DB (lecture du fichier).
 */
const migration = readFileSync('db/migrations/096_reponse_nature.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('T3 — migration 096 : nature du message entrant + accuses au journal', () => {
  it('demande_reponse.nature : ADD COLUMN IF NOT EXISTS, défaut indetermine, NOT NULL', () => {
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+nature\s+text\s+NOT NULL\s+DEFAULT\s+'indetermine'/i.test(code)).toBe(true);
  });

  it('CHECK nature RECRÉÉ (DROP IF EXISTS + ADD) avec les 5 valeurs de la liste fermée', () => {
    expect(/ALTER TABLE demande_reponse\s+DROP CONSTRAINT IF EXISTS\s+demande_reponse_nature_chk/i.test(code)).toBe(true);
    expect(/ADD CONSTRAINT\s+demande_reponse_nature_chk/i.test(code)).toBe(true);
    const m = code.match(/nature\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['accuse', 'documents', 'autre', 'indetermine', 'rebond']) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it('releve_run.accuses : ADD COLUMN IF NOT EXISTS (compteur d’événement)', () => {
    expect(/ALTER TABLE releve_run\s+ADD COLUMN IF NOT EXISTS\s+accuses\s+integer/i.test(code)).toBe(true);
  });

  it('additive : aucun DROP de table/colonne/index, aucun UPDATE/DELETE, ne touche pas demande.statut ; une seule transaction ; aucun trigger', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false); // seul le DROP CONSTRAINT (recréation du CHECK) est autorisé
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
