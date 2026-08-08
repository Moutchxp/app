import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * R6 — garde-fous STATIQUES de la migration 075 (échéance + relève approfondie). DDL additive/idempotente, aucun DROP :
 * releve_run.demande_id NULLABLE (FK demande, index partiel) ; deux réglages config_veille avec bornes dans les CHECK et
 * défauts ancrés au code. Ne touche PAS demande.statut. Aucune connexion DB.
 * `code` = migration SANS les lignes de commentaire `--` (les COMMENT ON restent, c'est du vrai SQL).
 */
const migration = readFileSync('db/migrations/075_echeance.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R6 — migration 075 : échéance + relève approfondie', () => {
  it('DDL ADDITIVE : ADD COLUMN / CREATE INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE releve_run\s+ADD COLUMN IF NOT EXISTS\s+demande_id/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+echeance_alerte_jours/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+releve_fraicheur_heures/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('releve_run.demande_id : NULLABLE (pas de NOT NULL), FK vers demande, index partiel', () => {
    expect(/demande_id\s+bigint\s+REFERENCES\s+demande\(id\)/i.test(code)).toBe(true);
    expect(/demande_id\s+bigint\s+NOT NULL/i.test(code)).toBe(false); // renseigné seulement pour l'approfondie
    expect(/CREATE INDEX IF NOT EXISTS\s+releve_run_demande_idx\s+ON releve_run\s*\(demande_id\)\s+WHERE demande_id IS NOT NULL/i.test(code)).toBe(true);
  });

  it('deux réglages config_veille : bornes (CHECK BETWEEN) + défauts = ceux du code', () => {
    expect(new RegExp(`echeance_alerte_jours\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.echeanceAlerteJours}\\b`, 'i').test(code)).toBe(true);
    expect(/echeance_alerte_jours\s+BETWEEN\s+1\s+AND\s+30/i.test(code)).toBe(true);
    expect(new RegExp(`releve_fraicheur_heures\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.releveFraicheurHeures}\\b`, 'i').test(code)).toBe(true);
    expect(/releve_fraicheur_heures\s+BETWEEN\s+1\s+AND\s+720/i.test(code)).toBe(true);
  });

  it('ne touche PAS demande.statut ; une seule transaction ; aucun trigger', () => {
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
