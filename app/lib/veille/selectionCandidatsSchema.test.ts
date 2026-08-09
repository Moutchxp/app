import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * V2 — garde-fous STATIQUES de la migration 081. Additive : config_veille.nb_candidats_examines (CHECK 100–50000) +
 * config_veille.tri_candidats (liste fermée). Ne touche PAS demande.statut, aucun DROP, une seule transaction. Aucune
 * connexion DB (contrôle du texte du fichier, comme les autres *Schema.test.ts).
 */
const migration = readFileSync('db/migrations/081_selection_candidats.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('V2 — migration 081 : profondeur d’examen + ordre de tri des candidats', () => {
  it('nb_candidats_examines : ADD COLUMN, CHECK 100–50000, défaut = défaut du code', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+nb_candidats_examines/i.test(code)).toBe(true);
    expect(new RegExp(`nb_candidats_examines\\s+integer\\s+NOT NULL\\s+DEFAULT\\s+${CONFIG_VEILLE_DEFAUT.nbCandidatsExamines}\\b`, 'i').test(code)).toBe(true);
    expect(/nb_candidats_examines\s+BETWEEN\s+100\s+AND\s+50000/i.test(code)).toBe(true);
  });

  it('tri_candidats : ADD COLUMN, défaut = défaut du code, CHECK liste fermée à 2 valeurs', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+tri_candidats/i.test(code)).toBe(true);
    expect(new RegExp(`tri_candidats\\s+text\\s+NOT NULL\\s+DEFAULT\\s+'${CONFIG_VEILLE_DEFAUT.triCandidats}'`, 'i').test(code)).toBe(true);
    const m = code.match(/tri_candidats\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['surface_puis_date', 'date_puis_surface']) expect(m![1]).toContain(`'${v}'`);
  });

  it('les deux colonnes sont documentées (COMMENT ON COLUMN)', () => {
    expect(/COMMENT ON COLUMN config_veille\.nb_candidats_examines/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN config_veille\.tri_candidats/i.test(code)).toBe(true);
  });

  it('additive : aucun DROP table/colonne/index, aucun UPDATE/DELETE, ne touche pas demande.statut, une transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
