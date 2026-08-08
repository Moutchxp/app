import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * R7 — garde-fous STATIQUES de la migration 074 (relève automatique). DDL additive/idempotente, aucun DROP, OPT-IN
 * (releve_active défaut false), bornes de l'intervalle + liste fermée du profil dans les CHECK, journal releve_run (deux
 * temps, compteurs, index par date) et sa RAISON D'ÊTRE écrite en clair. Ne touche JAMAIS demande.statut. Aucune connexion DB.
 * `code` = migration SANS les lignes de commentaire `--` (les COMMENT ON restent, c'est du vrai SQL).
 */
const migration = readFileSync('db/migrations/074_releve_auto.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R7 — migration 074 : relève automatique', () => {
  it('DDL ADDITIVE : ADD COLUMN / CREATE TABLE|INDEX IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+releve_active/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+releve_intervalle_minutes/i.test(code)).toBe(true);
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+releve_profil/i.test(code)).toBe(true);
    expect(/CREATE TABLE IF NOT EXISTS releve_run\b/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('OPT-IN : releve_active booléen NOT NULL défaut false (= défaut du code)', () => {
    expect(/releve_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(CONFIG_VEILLE_DEFAUT.releveActive).toBe(false);
  });

  it('bornes de l’intervalle (CHECK BETWEEN) + défaut = défaut du code ; liste fermée du profil', () => {
    expect(new RegExp(`releve_intervalle_minutes\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.releveIntervalleMinutes}\\b`, 'i').test(code)).toBe(true);
    expect(/releve_intervalle_minutes\s+BETWEEN\s+15\s+AND\s+1440/i.test(code)).toBe(true);
    const p = code.match(/releve_profil\s+IN\s*\(([^)]*)\)/i);
    expect(p).not.toBeNull();
    for (const v of ['entreprise', 'personne']) expect(p![1]).toContain(`'${v}'`);
    expect(code).toContain(`DEFAULT '${CONFIG_VEILLE_DEFAUT.releveProfil}'`); // défaut du profil = défaut du code
  });

  it('journal releve_run : deux temps (resultat borné, défaut en_cours), compteurs présents, index par date', () => {
    const r = code.match(/resultat\s+IN\s*\(([^)]*)\)/i);
    expect(r).not.toBeNull();
    for (const v of ['en_cours', 'ok', 'erreur', 'ignore']) expect(r![1]).toContain(`'${v}'`);
    expect(/resultat\s+text\s+NOT NULL\s+DEFAULT\s+'en_cours'/i.test(code)).toBe(true);
    for (const col of ['demarre_le', 'termine_le', 'profil', 'declencheur', 'vus', 'retenus', 'rattaches', 'rebonds_rattaches', 'enregistrees', 'plafond_atteint', 'erreur']) {
      expect(code).toContain(col); // colonne de compteur / trace présente
    }
    expect(/CREATE INDEX IF NOT EXISTS\s+releve_run_demarre_idx\s+ON releve_run\s*\(demarre_le DESC\)/i.test(code)).toBe(true);
  });

  it('la RAISON D’ÊTRE du journal est écrite en clair (launchd = agent de session, machine éteinte)', () => {
    // Ces garde-fous vivent dans la PROSE (commentaires + COMMENT ON) → on lit le fichier ENTIER, pas `code`.
    expect(/launchd/i.test(migration)).toBe(true);
    expect(/agent de session/i.test(migration)).toBe(true);
    expect(/machine éteinte/i.test(migration)).toBe(true);
  });

  it('ne touche PAS demande.statut ; une seule transaction ; aucun trigger', () => {
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
