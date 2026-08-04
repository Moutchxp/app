import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from './veilleConfig';

/**
 * S40 — garde-fous STATIQUES de la migration 072 (mentions de courrier). DDL additive, aucun DROP, 4 colonnes (2 bool + 2
 * texte) NOT NULL avec défauts « désactivées / vides » (aucune valeur posée à la place d'Arno), et un commentaire qui trace
 * la FRONTIÈRE : phrases de pratique éditables vs socle juridique en dur. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/072_mentions_courrier.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S40 — migration 072 : mentions de courrier', () => {
  it('DDL additive : 4 ADD COLUMN IF NOT EXISTS, aucun DROP/DELETE', () => {
    for (const col of ['mention_service_active', 'mention_service_texte', 'mention_delai_active', 'mention_delai_texte']) {
      expect(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i').test(code)).toBe(true);
    }
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)|DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });
  it('booléens NOT NULL DEFAULT false, textes NOT NULL DEFAULT \'\' (rien posé à la place d’Arno) = défauts du code', () => {
    expect(/mention_service_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(/mention_delai_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    expect(/mention_service_texte\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
    expect(/mention_delai_texte\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
    // défauts du code alignés (désactivées, vides)
    expect(CONFIG_VEILLE_DEFAUT.mentionServiceActive).toBe(false);
    expect(CONFIG_VEILLE_DEFAUT.mentionDelaiActive).toBe(false);
    expect(CONFIG_VEILLE_DEFAUT.mentionServiceTexte).toBe('');
    expect(CONFIG_VEILLE_DEFAUT.mentionDelaiTexte).toBe('');
  });
  it('trace la FRONTIÈRE (pratique éditable vs socle L311 en dur) + une seule transaction', () => {
    expect(/FRONTIÈRE/i.test(migration)).toBe(true);
    expect(/L311-1|L311-9|fondement juridique|EN DUR/i.test(migration)).toBe(true);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/AUCUN ENVOI|aucun octet/i.test(migration)).toBe(true);
  });
});
