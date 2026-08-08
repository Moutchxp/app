import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * R8 — garde-fous STATIQUES de la migration 078 (alertes e-mail). DDL additive/idempotente, aucun DROP : config_veille
 * reçoit alerte_active (opt-in) / alerte_email / alerte_heure_locale (CHECK 0-23) ; table alerte_run (deux temps, résultat
 * borné, index par date) avec la RAISON D'ÊTRE anti-doublon. Ne touche PAS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/078_alertes.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R8 — migration 078 : alertes e-mail', () => {
  it('DDL ADDITIVE : ADD COLUMN / CREATE TABLE|INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+alerte_active/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+alerte_email/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+alerte_heure_locale/i.test(code)).toBe(true);
    expect(/CREATE TABLE IF NOT EXISTS alerte_run\b/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('OPT-IN + défauts = ceux du code ; e-mail vide par défaut ; heure bornée 0-23', () => {
    expect(/alerte_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(CONFIG_VEILLE_DEFAUT.alerteActive).toBe(false);
    expect(/alerte_email\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
    expect(CONFIG_VEILLE_DEFAUT.alerteEmail).toBe('');
    expect(new RegExp(`alerte_heure_locale\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.alerteHeureLocale}\\b`, 'i').test(code)).toBe(true);
    expect(/alerte_heure_locale\s+BETWEEN\s+0\s+AND\s+23/i.test(code)).toBe(true);
  });

  it('alerte_run : résultat borné (deux temps), défaut en_cours, index par date', () => {
    const r = code.match(/resultat\s+IN\s*\(([^)]*)\)/i);
    expect(r).not.toBeNull();
    for (const v of ['en_cours', 'envoyee', 'rien_a_dire', 'erreur']) expect(r![1]).toContain(`'${v}'`);
    expect(/resultat\s+text\s+NOT NULL\s+DEFAULT\s+'en_cours'/i.test(code)).toBe(true);
    for (const col of ['demarre_le', 'envoye_le', 'destinataire', 'sujet', 'corps', 'erreur']) expect(code).toContain(col);
    expect(/CREATE INDEX IF NOT EXISTS\s+alerte_run_demarre_idx\s+ON alerte_run\s*\(demarre_le DESC\)/i.test(code)).toBe(true);
  });

  it('la RAISON D’ÊTRE anti-doublon est écrite ; ne touche PAS demande.statut ; une transaction ; aucun trigger', () => {
    expect(/ANTI-DOUBLON/i.test(migration)).toBe(true);
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
