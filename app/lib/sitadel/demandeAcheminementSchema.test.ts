import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from './veilleConfig';

/**
 * S37 — garde-fous STATIQUES de la migration 070 (acheminement des demandes + caps d'envoi). DDL additive, aucun DROP,
 * colonnes de PREUVE présentes, commentaire « émission ≠ réception », CHECK des deux caps avec bornes, défauts ancrés au
 * code. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/070_demande_acheminement.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S37 — migration 070 : acheminement + caps', () => {
  it('DDL ADDITIVE : CREATE/ADD ... IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/CREATE TABLE IF NOT EXISTS demande_acheminement/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP/i.test(code)).toBe(false);
  });

  it('table d’acheminement calquée sur certificat_acheminement + FK demande + colonnes de PREUVE', () => {
    expect(/demande_id\s+bigint\s+NOT NULL\s+REFERENCES\s+demande\(id\)/i.test(code)).toBe(true);
    for (const col of ['envoye_le', 'message_id', 'retour_fournisseur', 'rebond_le', 'rebond_motif', 'derniere_erreur']) {
      expect(code).toContain(col); // colonne de preuve présente
    }
    // statut d'acheminement borné
    const s = code.match(/statut\s+IN\s*\(([^)]*)\)/i);
    expect(s).not.toBeNull();
    for (const v of ['en_attente', 'envoye', 'rebond', 'echec']) expect(s![1]).toContain(`'${v}'`);
  });

  it('COMMENTE explicitement que envoye_le prouve l’ÉMISSION, jamais la RÉCEPTION (délai CADA)', () => {
    // le garde-fou juridique est dans un COMMENT (donc dans la prose, pas dans `code`) : on lit le fichier entier
    expect(/ÉMISSION.*JAMAIS LA RÉCEPTION/i.test(migration)).toBe(true);
    expect(/CADA/.test(migration)).toBe(true);
    expect(/envoye_le/.test(migration)).toBe(true);
  });

  it('CAPS d’envoi : deux colonnes NOT NULL, CHECK de plage, défauts = ceux du code', () => {
    expect(new RegExp(`envois_max_par_run\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.envoisMaxParRun}\\b`, 'i').test(code)).toBe(true);
    expect(new RegExp(`envois_max_par_jour\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.envoisMaxParJour}\\b`, 'i').test(code)).toBe(true);
    expect(/envois_max_par_run\s+BETWEEN\s+1\s+AND\s+200/i.test(code)).toBe(true);
    expect(/envois_max_par_jour\s+BETWEEN\s+1\s+AND\s+500/i.test(code)).toBe(true);
    // ADD COLUMN IF NOT EXISTS (idempotent, additif)
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+envois_max_par_run/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+envois_max_par_jour/i.test(code)).toBe(true);
  });

  it('une seule transaction, aucun envoi', () => {
    expect(/BEGIN;/.test(code)).toBe(true);
    expect(/COMMIT;/.test(code)).toBe(true);
    expect(/AUCUN ENVOI|AUCUN CODE D'ENVOI|aucun octet/i.test(migration)).toBe(true);
  });
});
