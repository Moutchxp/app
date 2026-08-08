import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * R6c — garde-fous STATIQUES de la migration 077 (satisfaction au dossier). DDL additive/idempotente, aucun DROP :
 * demande_dossier reçoit satisfait_le (NULL), satisfait_par (liste fermée automatique/manuel) et reponse_id (FK
 * demande_reponse) ; index PARTIEL des dossiers encore à obtenir. Ne touche PAS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/077_dossier_satisfait.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R6c — migration 077 : satisfaction au dossier', () => {
  it('DDL ADDITIVE : ADD COLUMN / CREATE INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE demande_dossier\s+ADD COLUMN IF NOT EXISTS\s+satisfait_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/ALTER TABLE demande_dossier\s+ADD COLUMN IF NOT EXISTS\s+satisfait_par\s+text/i.test(code)).toBe(true);
    expect(/ALTER TABLE demande_dossier\s+ADD COLUMN IF NOT EXISTS\s+reponse_id\s+bigint\s+REFERENCES\s+demande_reponse\(id\)/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('satisfait_par : liste fermée (automatique | manuel), nullable (pas de NOT NULL)', () => {
    const p = code.match(/satisfait_par\s+IN\s*\(([^)]*)\)/i);
    expect(p).not.toBeNull();
    for (const v of ['automatique', 'manuel']) expect(p![1]).toContain(`'${v}'`);
    expect(/satisfait_par\s+text\s+NOT NULL/i.test(code)).toBe(false); // NULL tant que non satisfait
  });

  it('index PARTIEL « à obtenir » (WHERE satisfait_le IS NULL) — la question posée à chaque relance', () => {
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_dossier_a_obtenir_idx\s+ON demande_dossier\s*\(demande_id\)\s+WHERE satisfait_le IS NULL/i.test(code)).toBe(true);
  });

  it('la satisfaction se suit au DOSSIER (COMMENT), ne touche PAS demande.statut, une seule transaction', () => {
    expect(/au DOSSIER/i.test(migration)).toBe(true); // COMMENT : suivi au dossier, pas à la demande
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
