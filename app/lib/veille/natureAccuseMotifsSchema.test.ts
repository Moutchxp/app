import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FUS-4 — garde-fous STATIQUES de la migration 125 (nature_accuse_motifs). DDL strictement ADDITIVE : une colonne texte,
 * IF NOT EXISTS, NOT NULL DEFAULT. Aucune connexion DB (lecture du fichier). Prouve : additivité, défaut couvrant Paris,
 * aucune touche au statut ni au moteur de score.
 */
const migration = readFileSync('db/migrations/125_config_veille_nature_accuse_motifs.sql', 'utf8');
const brut = migration.split('\n').filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('\\echo')).join('\n');
const code = brut.slice(0, brut.indexOf('COMMIT;') + 'COMMIT;'.length); // corps transactionnel seul (hors bloc de vérification)
const norm = code.replace(/\s+/g, ' ');

describe('FUS-4 — migration 125 : config_veille.nature_accuse_motifs', () => {
  it('ADD COLUMN IF NOT EXISTS nature_accuse_motifs text NOT NULL DEFAULT (défaut couvrant Paris)', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+nature_accuse_motifs\s+text\s+NOT NULL\s+DEFAULT/i.test(norm)).toBe(true);
    expect(norm).toContain("DEFAULT 'accusé de réception'"); // motif Paris par défaut, éditable ensuite
  });

  it('additive PURE : aucun UPDATE/DELETE/TRUNCATE/INSERT, aucun DROP, aucun trigger ; une seule transaction', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });

  it('ne touche NI demande.statut NI le moteur de score', () => {
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/config_scoring|batiment_vue|\bscore\b/i.test(code)).toBe(false);
  });
});
