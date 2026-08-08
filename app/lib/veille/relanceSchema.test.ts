import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * R6b — garde-fous STATIQUES de la migration 076 (brouillon de relance). DDL additive/idempotente, aucun DROP :
 * demande_relance (FK demande, listes fermées type/profil/statut, colonnes objet/corps NOT NULL), index sur demande_id, et
 * UNIQUE PARTIEL « une seule relance vivante » (statut <> 'abandonnee'). `type` limité à 'relance' (CADA = chantier séparé).
 * Ne touche PAS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/076_relance.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R6b — migration 076 : brouillon de relance', () => {
  it('DDL ADDITIVE : CREATE TABLE/INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_relance\b/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('FK demande + objet/corps NOT NULL + generee_le par défaut', () => {
    expect(/demande_id\s+bigint\s+NOT NULL\s+REFERENCES\s+demande\(id\)/i.test(code)).toBe(true);
    expect(/objet\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/corps\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/generee_le\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i.test(code)).toBe(true);
  });

  it('listes fermées : type=relance uniquement, profil et statut bornés', () => {
    const t = code.match(/type\s+IN\s*\(([^)]*)\)/i);
    expect(t).not.toBeNull();
    expect(t![1]).toContain(`'relance'`);
    expect(t![1]).not.toMatch(/cada|saisine/i); // la CADA sera un type SÉPARÉ : la liste reste fermée à 'relance'
    const p = code.match(/profil_demandeur\s+IN\s*\(([^)]*)\)/i);
    expect(p).not.toBeNull();
    for (const v of ['entreprise', 'personne']) expect(p![1]).toContain(`'${v}'`);
    const s = code.match(/statut\s+IN\s*\(([^)]*)\)/i);
    expect(s).not.toBeNull();
    for (const v of ['brouillon', 'envoyee', 'abandonnee']) expect(s![1]).toContain(`'${v}'`);
  });

  it('index sur demande_id + UNIQUE PARTIEL « une seule relance vivante » (exclut les abandonnées)', () => {
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_relance_demande_idx\s+ON demande_relance\s*\(demande_id\)/i.test(code)).toBe(true);
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS\s+demande_relance_vivante_uniq\s+ON demande_relance\s*\(demande_id,\s*type\)\s+WHERE statut <> 'abandonnee'/i.test(code)).toBe(true);
  });

  it('ne touche PAS demande.statut ; une seule transaction ; aucun trigger', () => {
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
