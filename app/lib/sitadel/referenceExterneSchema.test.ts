import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * P1 — garde-fous STATIQUES de la migration 085 (référence interne de la mairie). DDL additive, idempotente, aucun DROP, ne
 * touche PAS demande.statut ; table DÉDIÉE (pas une colonne sur `demande`) ; demande_id NOT NULL (FK CASCADE), dossier_id
 * NULLABLE (FK), reference NOT NULL SANS CHECK de forme, source bornée par CHECK, UNIQUE (demande_id, reference), index
 * normalisé pour la recherche. Aucune connexion DB.
 * `code` = migration SANS les lignes de commentaire `--` (les COMMENT ON restent, ce sont du vrai SQL).
 */
const migration = readFileSync('db/migrations/085_reference_externe.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('P1 — migration 085 : référence externe (schéma)', () => {
  it('DDL ADDITIVE : CREATE TABLE/INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_reference_externe\b/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('table DÉDIÉE : ne touche PAS `demande` (aucune ALTER / UPDATE / SET statut)', () => {
    expect(/ALTER TABLE\s+demande\b/i.test(code)).toBe(false); // \b après « demande » ne matche pas « demande_reference_externe »
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
  });

  it('demande_id NOT NULL + FK demande ON DELETE CASCADE', () => {
    expect(/demande_id\s+bigint\s+NOT NULL\s+REFERENCES\s+demande\(id\)\s+ON DELETE CASCADE/i.test(code)).toBe(true);
  });

  it('dossier_id NULLABLE (FK sitadel_dossier) — renseigné quand le dépôt ne porte que sur un dossier', () => {
    expect(/dossier_id\s+bigint\s+REFERENCES\s+sitadel_dossier\(id\)/i.test(code)).toBe(true);
    expect(/dossier_id\s+bigint\s+NOT NULL/i.test(code)).toBe(false); // NULLABLE
  });

  it('reference NOT NULL et AUCUN CHECK sur la FORME de la référence (format libre)', () => {
    expect(/reference\s+text\s+NOT NULL/i.test(code)).toBe(true);
    // aucun CHECK ne mentionne « reference » (le seul CHECK porte sur `source`)
    expect(/CHECK\s*\([^)]*reference[^)]*\)/i.test(code)).toBe(false);
  });

  it('source bornée par un CHECK nommé (liste fermée, NULL toléré)', () => {
    expect(/CONSTRAINT\s+demande_reference_externe_source_chk\s+CHECK/i.test(code)).toBe(true);
    const m = code.match(/source\s+IS NULL\s+OR\s+source\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['accuse_reception', 'saisie_manuelle', 'autre']) expect(m![1]).toContain(`'${v}'`);
  });

  it('UNIQUE (demande_id, reference) nommée — jamais deux fois la même', () => {
    expect(/CONSTRAINT\s+demande_reference_externe_demande_id_reference_key\s+UNIQUE\s*\(demande_id,\s*reference\)/i.test(code)).toBe(true);
  });

  it('index sur la forme NORMALISÉE (upper + suppression espaces/tirets) pour la recherche', () => {
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_reference_externe_norm_idx\s+ON demande_reference_externe\s*\(\s*upper\(regexp_replace\(reference,\s*'\[\[:space:\]-\]',\s*'',\s*'g'\)\)\s*\)/i.test(code.replace(/\s+/g, ' '))).toBe(true);
  });

  it('COMMENT ON TABLE grave la raison d’être (preuve de dépôt + appel mairie)', () => {
    expect(/COMMENT ON TABLE demande_reference_externe IS/i.test(code)).toBe(true);
    expect(/PREUVE DE DÉPÔT/i.test(code)).toBe(true);
  });

  it('une seule transaction', () => {
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect((code.match(/BEGIN;/g) ?? []).length).toBe(1);
    expect((code.match(/COMMIT;/g) ?? []).length).toBe(1);
  });
});
