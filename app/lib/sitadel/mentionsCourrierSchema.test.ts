import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT, MENTION_SOURCES_TEXTE_DEFAUT } from './veilleConfig';

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

/**
 * S-DWG — garde-fous STATIQUES de la migration 148 (3e tiret optionnel « fichiers sources DWG/DXF »). DDL additive, 2
 * colonnes (1 bool + 1 texte) NOT NULL. ⚠️ SEULE différence avec S40 : défaut ACTIF (opt-out) et texte PRÉ-RÉDIGÉ (arbitré
 * par le porteur). Le DEFAULT SQL du texte doit rester byte-identique à la constante applicative. Aucune connexion DB.
 */
const mig148 = readFileSync('db/migrations/148_mention_sources_graphiques.sql', 'utf8');
const code148 = mig148.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S-DWG — migration 148 : tiret « fichiers sources des pièces graphiques »', () => {
  it('DDL additive : 2 ADD COLUMN IF NOT EXISTS, aucun DROP/DELETE', () => {
    for (const col of ['mention_sources_active', 'mention_sources_texte']) {
      expect(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i').test(code148)).toBe(true);
    }
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)|DELETE\s+FROM|TRUNCATE/i.test(code148)).toBe(false);
  });

  it('booléen NOT NULL DEFAULT true (opt-out), texte NOT NULL DEFAULT = constante applicative (byte-identique)', () => {
    expect(/mention_sources_active\s+boolean\s+NOT NULL\s+DEFAULT\s+true/i.test(code148)).toBe(true);
    // le DEFAULT du texte (aucune apostrophe DROITE à l'intérieur → un seul groupe entre quotes) = la constante du code
    const m = /mention_sources_texte\s+text\s+NOT NULL\s+DEFAULT\s+'([^']*)'/i.exec(code148);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(MENTION_SOURCES_TEXTE_DEFAUT);
    // défauts du code alignés (actif + texte pré-rédigé) — l'opt-out se comporte pareil migration passée ou non
    expect(CONFIG_VEILLE_DEFAUT.mentionSourcesActive).toBe(true);
    expect(CONFIG_VEILLE_DEFAUT.mentionSourcesTexte).toBe(MENTION_SOURCES_TEXTE_DEFAUT);
  });

  it('texte : un tiret cadratin, se termine par un point, N’OBLIGE À RIEN (aucune référence d’article)', () => {
    expect(MENTION_SOURCES_TEXTE_DEFAUT.startsWith('—')).toBe(true);
    expect(MENTION_SOURCES_TEXTE_DEFAUT.endsWith('.')).toBe(true);
    expect(MENTION_SOURCES_TEXTE_DEFAUT).toContain('leur absence ne doit en rien retarder');
    expect(/R\.?\s*431|L\.?\s*311|article/i.test(MENTION_SOURCES_TEXTE_DEFAUT)).toBe(false); // pas de fondement d'article
  });

  it('trace la FRONTIÈRE (demandes seules : ni relance ni saisine CADA) + une seule transaction + aucun envoi', () => {
    expect(/relance/i.test(mig148) && /CADA/i.test(mig148)).toBe(true);
    expect(/N''OBLIGE À RIEN|n'oblige à rien/i.test(mig148)).toBe(true);
    expect(/BEGIN;/.test(code148) && /COMMIT;/.test(code148)).toBe(true);
    expect(/AUCUN ENVOI|aucun octet/i.test(mig148)).toBe(true);
  });
});
