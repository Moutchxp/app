import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * R1 — garde-fous STATIQUES de la migration 073 (schéma de l'entrant CRPA). DDL additive, idempotente, aucun DROP,
 * n'étend PAS demande_acheminement, ne touche PAS demande.statut ; demande_id NULLABLE, message_id UNIQUE (chevrons),
 * CHECK nommés, FK CASCADE des pièces, index partiel « à rattacher ». Aucune connexion DB.
 * `code` = migration SANS les lignes de commentaire `--` (les COMMENT ON restent, ce sont du vrai SQL).
 */
const migration = readFileSync('db/migrations/073_demande_reponse.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R1 — migration 073 : schéma de l’entrant', () => {
  it('DDL ADDITIVE : CREATE TABLE/INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_reponse\b/i.test(code)).toBe(true);
    expect(/CREATE TABLE IF NOT EXISTS demande_reponse_piece\b/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('n’étend PAS demande_acheminement (sortant) et ne touche PAS demande.statut', () => {
    expect(/ALTER TABLE\s+demande_acheminement|CREATE TABLE IF NOT EXISTS demande_acheminement|DROP[^;]*demande_acheminement/i.test(code)).toBe(false);
    expect(/ALTER TABLE\s+demande\b/i.test(code)).toBe(false); // \b après « demande » ne matche pas « demande_reponse »
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
  });

  it('demande_id NULLABLE (message non rattaché conservé) : FK sans NOT NULL', () => {
    expect(/demande_id\s+bigint\s+REFERENCES\s+demande\(id\)/i.test(code)).toBe(true);
    expect(/demande_id\s+bigint\s+NOT NULL/i.test(code)).toBe(false);
  });

  it('message_id NOT NULL UNIQUE (contrainte nommée) + profil_boite/rattachement_methode bornés par CHECK nommé', () => {
    expect(/message_id\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/CONSTRAINT\s+demande_reponse_message_id_key\s+UNIQUE/i.test(code)).toBe(true);
    expect(/CONSTRAINT\s+demande_reponse_profil_boite_chk/i.test(code)).toBe(true);
    expect(/CONSTRAINT\s+demande_reponse_rattachement_methode_chk/i.test(code)).toBe(true);
    const pb = code.match(/profil_boite\s+IN\s*\(([^)]*)\)/i);
    expect(pb).not.toBeNull();
    for (const v of ['entreprise', 'personne']) expect(pb![1]).toContain(`'${v}'`);
    const rm = code.match(/rattachement_methode\s+IN\s*\(([^)]*)\)/i);
    expect(rm).not.toBeNull();
    for (const v of ['message_id', 'reference_objet', 'reference_corps', 'manuel', 'aucun']) expect(rm![1]).toContain(`'${v}'`);
  });

  it('pièces : FK CASCADE vers demande_reponse, cle_stockage présente (NULLABLE)', () => {
    expect(/reponse_id\s+bigint\s+NOT NULL\s+REFERENCES\s+demande_reponse\(id\)\s+ON DELETE CASCADE/i.test(code)).toBe(true);
    expect(/cle_stockage\s+text\b/i.test(code)).toBe(true);
    expect(/motif_non_stocke\s+text\b/i.test(code)).toBe(true);
  });

  it('index attendus, dont l’index PARTIEL « à rattacher » (WHERE demande_id IS NULL)', () => {
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_reponse_demande_idx/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_reponse_recu_idx/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_reponse_a_rattacher_idx\s+ON demande_reponse\s*\(recu_le DESC\)\s+WHERE demande_id IS NULL/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS\s+demande_reponse_piece_reponse_idx/i.test(code)).toBe(true);
  });

  it('une seule transaction, aucun trigger', () => {
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
