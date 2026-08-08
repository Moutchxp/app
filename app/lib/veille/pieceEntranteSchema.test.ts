import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * R4 — garde-fous STATIQUES de la migration 079 (dépôt des pièces entrantes). DDL additive : config_veille.piece_taille_max_mo
 * (CHECK 1-200) + releve_run.pieces_deposees/pieces_non_deposees. Ne recrée PAS les colonnes de demande_reponse_piece (073).
 * Ne touche PAS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/079_piece_entrante.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('R4 — migration 079 : dépôt des pièces entrantes', () => {
  it('DDL ADDITIVE : ADD COLUMN IF NOT EXISTS, aucun DROP/DELETE/TRUNCATE', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+piece_taille_max_mo/i.test(code)).toBe(true);
    expect(/ALTER TABLE releve_run\s+ADD COLUMN IF NOT EXISTS\s+pieces_deposees/i.test(code)).toBe(true);
    expect(/ALTER TABLE releve_run\s+ADD COLUMN IF NOT EXISTS\s+pieces_non_deposees/i.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });

  it('borne de taille : CHECK 1-200, défaut = défaut du code', () => {
    expect(new RegExp(`piece_taille_max_mo\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.pieceTailleMaxMo}\\b`, 'i').test(code)).toBe(true);
    expect(/piece_taille_max_mo\s+BETWEEN\s+1\s+AND\s+200/i.test(code)).toBe(true);
  });

  it('NE recrée PAS les colonnes de demande_reponse_piece (déjà en 073)', () => {
    expect(/CREATE TABLE[^;]*demande_reponse_piece/i.test(code)).toBe(false);
    expect(/ALTER TABLE demande_reponse_piece/i.test(code)).toBe(false);
  });

  it('ne touche PAS demande.statut ; une seule transaction ; aucun trigger', () => {
    expect(/UPDATE\s+demande\b|SET\s+statut/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
