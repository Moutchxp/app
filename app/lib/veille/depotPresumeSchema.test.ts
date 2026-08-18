import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT A — garde-fous STATIQUES de la migration 124 (demande_depot_presume). DDL strictement ADDITIVE : une table neuve, deux
 * index partiels, une contrainte CHECK. Aucune connexion DB (lecture du fichier). Prouve surtout : LE VERROU (index partiel
 * par commune) et le fait qu'AUCUNE échéance ne peut courir (ni statut ni envoye_le écrits/portés par ce lot).
 */
const migration = readFileSync('db/migrations/124_demande_depot_presume.sql', 'utf8');
const brut = migration.split('\n').filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('\\echo')).join('\n');
// Corps TRANSACTIONNEL seul (BEGIN…COMMIT). Le bloc de vérification qui suit COMMIT (\echo + SELECT) est du diagnostic : il
// NOMME 'envoye_le'/'statut' justement pour PROUVER leur absence de la table — on ne l'inclut pas dans l'analyse de la DDL.
const code = brut.slice(0, brut.indexOf('COMMIT;') + 'COMMIT;'.length);
const norm = code.replace(/\s+/g, ' ');

describe('LOT A — migration 124 : demande_depot_presume + verrou d’unicité par commune', () => {
  it('CREATE TABLE IF NOT EXISTS demande_depot_presume, FK vers demande, colonnes de signal', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_depot_presume/i.test(code)).toBe(true);
    expect(/REFERENCES demande\(id\)/i.test(norm)).toBe(true);
    expect(norm).toContain('copie_texte_le timestamptz');
    expect(norm).toContain('copie_ref_le timestamptz');
    expect(norm).toContain('echeance_detection_le timestamptz NOT NULL');
  });

  it('LE VERROU : index unique PARTIEL sur (code_insee) WHERE resolu_le IS NULL', () => {
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS\s+demande_depot_presume_verrou_commune\s+ON demande_depot_presume \(code_insee\) WHERE resolu_le IS NULL/i.test(norm)).toBe(true);
  });

  it('idempotence de l’UPSERT : index unique partiel sur (demande_id) WHERE resolu_le IS NULL', () => {
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS\s+demande_depot_presume_demande_vivante\s+ON demande_depot_presume \(demande_id\) WHERE resolu_le IS NULL/i.test(norm)).toBe(true);
  });

  it('les DEUX issues de résolution ont leur place (resolu_le, resolution, resolu_par) + CHECK liste fermée', () => {
    expect(norm).toContain('resolu_le timestamptz');
    expect(norm).toContain('resolution text');
    expect(norm).toContain('resolu_par text');
    expect(/resolution IN \('deposee', 'renoncee'\)/i.test(norm)).toBe(true);
  });

  it('AUCUNE ÉCHÉANCE possible : le lot ne PORTE ni ne touche statut / envoye_le / acheminement', () => {
    expect(/envoye_le/i.test(code)).toBe(false);
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/demande_acheminement/i.test(code)).toBe(false);
  });

  it('additive PURE : aucun UPDATE/DELETE/TRUNCATE/INSERT métier, aucun DROP, aucun trigger ; une seule transaction', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
