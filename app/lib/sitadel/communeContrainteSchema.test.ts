import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * P3 — garde-fous STATIQUES de la migration 086 (contraintes de téléservice par commune). DDL additive, idempotente, aucun
 * DROP, ne touche PAS demande.statut ; DEUX colonnes NULLABLE sur mairie_contact (NULL = comportement actuel), CHECK nommés,
 * AUCUNE valeur posée. Aucune connexion DB. `code` = migration SANS les lignes de commentaire `--` (les COMMENT ON restent).
 */
const migration = readFileSync('db/migrations/086_commune_contrainte_teleservice.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const norm = code.replace(/\s+/g, ' ');

describe('P3 — migration 086 : contraintes de téléservice (schéma)', () => {
  it('DDL ADDITIVE : ADD COLUMN IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE mairie_contact\s+ADD COLUMN IF NOT EXISTS max_dossiers_par_demande/i.test(norm)).toBe(true);
    expect(/ALTER TABLE mairie_contact\s+ADD COLUMN IF NOT EXISTS profil_demandeur_impose/i.test(norm)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('les deux colonnes sont NULLABLE (aucun NOT NULL, aucun DEFAULT) → NULL = comportement actuel', () => {
    expect(/max_dossiers_par_demande\s+integer\s+NOT NULL/i.test(norm)).toBe(false);
    expect(/profil_demandeur_impose\s+text\s+NOT NULL/i.test(norm)).toBe(false);
    expect(/DEFAULT/i.test(code)).toBe(false);
  });

  it('max_dossiers_par_demande : CHECK > 0 (nommé)', () => {
    expect(/CONSTRAINT mairie_contact_max_dossiers_chk CHECK \(max_dossiers_par_demande > 0\)/i.test(norm)).toBe(true);
  });

  it('profil_demandeur_impose : CHECK IN (entreprise, personne) (nommé)', () => {
    expect(/CONSTRAINT mairie_contact_profil_impose_chk CHECK/i.test(norm)).toBe(true);
    const m = norm.match(/profil_demandeur_impose\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['entreprise', 'personne']) expect(m![1]).toContain(`'${v}'`);
  });

  it('AUCUNE valeur posée (pas d’INSERT/UPDATE de données) et ne touche PAS demande.statut', () => {
    expect(/INSERT\s+INTO|UPDATE\s+mairie_contact\s+SET|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
  });

  it('COMMENT ON COLUMN grave le POURQUOI (contrainte du téléservice)', () => {
    expect(/COMMENT ON COLUMN mairie_contact\.max_dossiers_par_demande IS/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN mairie_contact\.profil_demandeur_impose IS/i.test(code)).toBe(true);
    expect(/TÉLÉSERVICE/i.test(code)).toBe(true);
  });

  it('une seule transaction', () => {
    expect((code.match(/BEGIN;/g) ?? []).length).toBe(1);
    expect((code.match(/COMMIT;/g) ?? []).length).toBe(1);
  });
});
