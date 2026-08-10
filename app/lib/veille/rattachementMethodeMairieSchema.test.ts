import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * R3f — garde-fous STATIQUES de la migration 091. Additive : RECRÉATION de la contrainte des méthodes de rattachement pour
 * AJOUTER 'reference_mairie' (élargissement de la liste fermée, jamais un rétrécissement). Ne touche PAS demande.statut.
 * Aucune connexion DB (lecture du fichier de migration).
 */
const migration = readFileSync('db/migrations/091_rattachement_reference_mairie.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R3f — migration 091 : méthode de rattachement reference_mairie', () => {
  it('contrainte RECRÉÉE (DROP IF EXISTS + ADD) avec les 7 valeurs, dont reference_mairie', () => {
    expect(/ALTER TABLE demande_reponse\s+DROP CONSTRAINT IF EXISTS\s+demande_reponse_rattachement_methode_chk/i.test(code)).toBe(true);
    expect(/ADD CONSTRAINT\s+demande_reponse_rattachement_methode_chk/i.test(code)).toBe(true);
    const m = code.match(/rattachement_methode\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['message_id', 'reference_objet', 'reference_corps', 'numero_dossier', 'reference_mairie', 'manuel', 'aucun']) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it('additif : aucun DROP de table/colonne/index, aucun UPDATE, ne touche pas demande.statut ; une seule transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false); // seul le DROP CONSTRAINT (recréation) est autorisé
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
