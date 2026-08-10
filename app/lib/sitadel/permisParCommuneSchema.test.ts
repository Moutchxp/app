import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Q1 — garde-fous STATIQUES de la migration 087 (plafond mensuel en PERMIS). DDL additive, idempotente, aucun DROP de
 * table/colonne, ne touche PAS demande.statut ; seed depuis les colonnes EN BASE (jamais un chiffre en dur) ; l'ancien
 * `demandes_par_commune_par_mois` CONSERVÉ (jamais supprimé/renommé). Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/087_permis_par_commune.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const norm = code.replace(/\s+/g, ' ');

describe('Q1 — migration 087 : permis_par_commune_par_mois (schéma)', () => {
  it('DDL ADDITIVE : ADD COLUMN IF NOT EXISTS, aucun DROP de table/colonne, aucun DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS permis_par_commune_par_mois integer/i.test(norm)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('SEED calculé DEPUIS la base (jamais en dur) : permis = demandes × dossiers, uniquement là où NULL', () => {
    expect(/UPDATE config_veille SET permis_par_commune_par_mois = demandes_par_commune_par_mois \* dossiers_par_demande WHERE permis_par_commune_par_mois IS NULL/i.test(norm)).toBe(true);
  });

  it('CHECK nommé BETWEEN 1 AND 200 (satisfait « > 0 » et donne une plage parseable à l’UI)', () => {
    expect(/CONSTRAINT config_veille_permis_par_commune_chk CHECK \(permis_par_commune_par_mois BETWEEN 1 AND 200\)/i.test(norm)).toBe(true);
    expect(/SET NOT NULL/i.test(norm)).toBe(true);
    expect(/SET DEFAULT 5/i.test(norm)).toBe(true);
  });

  it('l’ancien `demandes_par_commune_par_mois` est CONSERVÉ (jamais DROP/RENAME) et marqué VESTIGIAL par un COMMENT', () => {
    expect(/DROP COLUMN[^;]*demandes_par_commune_par_mois|RENAME[^;]*demandes_par_commune_par_mois/i.test(code)).toBe(false);
    expect(/COMMENT ON COLUMN config_veille\.demandes_par_commune_par_mois IS[^;]*VESTIGIAL/i.test(code)).toBe(true);
  });

  it('COMMENT sur la nouvelle colonne (mesure des permis) et ne touche pas demande.statut', () => {
    expect(/COMMENT ON COLUMN config_veille\.permis_par_commune_par_mois IS/i.test(code)).toBe(true);
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
  });

  it('une seule transaction', () => {
    expect((code.match(/BEGIN;/g) ?? []).length).toBe(1);
    expect((code.match(/COMMIT;/g) ?? []).length).toBe(1);
  });
});
