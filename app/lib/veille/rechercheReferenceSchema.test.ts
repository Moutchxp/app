import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * R3e — garde-fous STATIQUES de la migration 080. Additive : config_veille.recherche_references_max (CHECK 1-500) +
 * RECRÉATION de la contrainte des méthodes de rattachement pour AJOUTER 'numero_dossier' (élargissement, jamais un
 * rétrécissement). Ne touche PAS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/080_recherche_reference.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R3e — migration 080 : recherche par référence + méthode numero_dossier', () => {
  it('plafond de références : ADD COLUMN, CHECK 1-500, défaut = défaut du code', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+recherche_references_max/i.test(code)).toBe(true);
    expect(new RegExp(`recherche_references_max\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.rechercheReferencesMax}\\b`, 'i').test(code)).toBe(true);
    expect(/recherche_references_max\s+BETWEEN\s+1\s+AND\s+500/i.test(code)).toBe(true);
  });

  it('méthodes de rattachement : contrainte RECRÉÉE avec les 6 valeurs, dont numero_dossier', () => {
    // recréation = DROP CONSTRAINT IF EXISTS puis ADD CONSTRAINT (la SEULE contrainte concernée ; aucun DROP de table/colonne).
    expect(/ALTER TABLE demande_reponse\s+DROP CONSTRAINT IF EXISTS\s+demande_reponse_rattachement_methode_chk/i.test(code)).toBe(true);
    expect(/ADD CONSTRAINT\s+demande_reponse_rattachement_methode_chk/i.test(code)).toBe(true);
    const m = code.match(/rattachement_methode\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['message_id', 'reference_objet', 'reference_corps', 'numero_dossier', 'manuel', 'aucun']) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it('additif : aucun DROP de table/colonne/index ; ne touche pas demande.statut ; une transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false); // le DROP CONSTRAINT (recréation) est le seul autorisé
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
