import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from './veilleConfig';

/**
 * S38 — garde-fous STATIQUES de la migration 071 (adresse de réponse). DDL additive, aucun DROP, colonne NOT NULL DEFAULT ''
 * (non configurée), CHECK « vide OU e-mail », commentaire disant pourquoi (reply-to des mairies). Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/071_adresse_reponse.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S38 — migration 071 : adresse de réponse', () => {
  it('ADD COLUMN IF NOT EXISTS, NOT NULL DEFAULT \'\' (non configurée), additive', () => {
    expect(/ALTER TABLE config_veille\s+ADD COLUMN IF NOT EXISTS\s+adresse_reponse\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
    expect(CONFIG_VEILLE_DEFAUT.adresseReponse).toBe(''); // défaut du code = défaut de la migration
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)|DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
  });
  it('CHECK « vide OU adresse e-mail », idempotent', () => {
    expect(/adresse_reponse\s*=\s*''\s*OR\s*adresse_reponse\s*~\*/i.test(code)).toBe(true);
    expect(/duplicate_object/i.test(code)).toBe(true);
  });
  it('commente le motif reply-to (réponse des mairies) + une seule transaction', () => {
    expect(/reply-to|adresse de réponse/i.test(migration)).toBe(true);
    expect(/noreply|répond/i.test(migration)).toBe(true);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/AUCUN ENVOI|aucun octet/i.test(migration)).toBe(true);
  });
});
