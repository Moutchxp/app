import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 3-quater — garde-fous STATIQUES de la migration 230 (réglages de reprise après coupure). Ce qui est protégé : que la
 * migration reste purement ADDITIVE sur un singleton déjà en service, que ses bornes vivent EN BASE, et que `0` reste une
 * valeur acceptée — c'est la porte de sortie si la reprise se révélait indésirable.
 */
const prose = readFileSync('db/migrations/230_gestion_reconnexion.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('230 — additive, et rien d’autre', () => {
  it('n’ajoute que deux colonnes, en IF NOT EXISTS, sur gestion_config', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alterees)).toEqual(new Set(['gestion_config']));
    expect(/ADD COLUMN IF NOT EXISTS reconnexions_max integer NOT NULL DEFAULT 3/.test(code)).toBe(true);
    expect(/ADD COLUMN IF NOT EXISTS reconnexion_delai_s integer NOT NULL DEFAULT 5/.test(code)).toBe(true);
  });

  it('n’écrit AUCUNE donnée, ne détruit rien, ne crée aucune table', () => {
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|TRIGGER|FUNCTION)/i.test(code)).toBe(false);
    expect(/CREATE\s+(TABLE|TYPE|TRIGGER)/i.test(code)).toBe(false);
  });

  it('le seul DROP est celui de la contrainte qu’elle repose — seule façon idempotente de la mettre à jour', () => {
    expect(/DROP CONSTRAINT IF EXISTS gestion_config_reconnexion_chk/.test(code)).toBe(true);
    expect(/ADD CONSTRAINT gestion_config_reconnexion_chk/.test(code)).toBe(true);
  });

  it('les bornes sont EN BASE, et ZÉRO est accepté (couper la reprise doit rester possible)', () => {
    expect(code).toContain('reconnexions_max BETWEEN 0 AND 10');
    expect(code).toContain('reconnexion_delai_s BETWEEN 1 AND 300');
  });

  it('une seule transaction, un bloc de vérification, un rollback', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
  });

  it('est livrée NON APPLIQUÉE, avec sa commande', () => {
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/230_gestion_reconnexion.sql');
  });
});

describe('230 — le POURQUOI est écrit, avec les faits qui l’ont motivée', () => {
  it('cite les deux coupures mesurées, à des endroits différents', () => {
    expect(prose).toContain('363');
    expect(prose).toContain('131');
    expect(prose).toContain('VARIABLE');
  });

  it('dit que la relève fonctionne SANS elle, et que 0 rend le comportement d’avant', () => {
    expect(prose).toContain('LA RELÈVE FONCTIONNE SANS CETTE MIGRATION');
    expect(prose).toContain('42703');
    expect(prose).toContain('COMPORTEMENT D\'AVANT');
  });

  it('ne touche ni le module Permis, ni le moteur', () => {
    for (const interdite of ['config_veille', 'config_scoring', 'demande', 'releve_run', 'batiment']) {
      expect(new RegExp(`(ALTER TABLE|INSERT INTO|UPDATE)\\s+${interdite}\\b`, 'i').test(code)).toBe(false);
    }
  });
});
