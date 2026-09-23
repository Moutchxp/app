import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_GESTION_DEFAUT } from './config';

/**
 * LOT 4b — garde-fous STATIQUES de la migration 232 (fenêtre d'activité de la file). Ce qui est protégé ici tient en une
 * phrase : la fenêtre borne l'AFFICHAGE, jamais la CAPTURE. Si elle touchait à ce qui est relevé ou conservé, elle
 * deviendrait une perte de données déguisée en confort.
 */
const prose = readFileSync('db/migrations/232_gestion_fenetre_activite.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('232 — un réglage d’AFFICHAGE, et rien d’autre', () => {
  it('ajoute une colonne à la configuration, avec son défaut et sa borne', () => {
    expect(/ADD COLUMN IF NOT EXISTS fenetre_activite_jours integer NOT NULL DEFAULT 30/.test(code)).toBe(true);
    expect(code).toContain('fenetre_activite_jours BETWEEN 1 AND 3650');
  });

  it('ne touche NI aux messages, NI aux fils, NI à quoi que ce soit d’autre', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alterees)).toEqual(new Set(['gestion_config']));
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false);
  });

  it('le repli du code dit la même chose que la base', () => {
    expect(CONFIG_GESTION_DEFAUT.fenetreActiviteJours).toBe(30);
    expect(new RegExp(`DEFAULT ${CONFIG_GESTION_DEFAUT.fenetreActiviteJours}\\b`).test(code)).toBe(true);
  });

  it('dit NOIR SUR BLANC que ce n’est ni une suppression ni un masquage silencieux', () => {
    expect(prose).toContain('CE N\'EST PAS UNE SUPPRESSION');
    expect(prose).toContain('MASQUAGE SILENCIEUX');
    expect(prose).toContain("l'écran annonce leur nombre");
  });

  it('dit aussi que la CAPTURE n’est pas concernée : tout continue d’être relevé et conservé', () => {
    expect(prose).toContain('Ne change RIEN à la capture');
  });

  it('une seule transaction, un bloc de vérification, un rollback, et livrée NON APPLIQUÉE', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/232_gestion_fenetre_activite.sql');
  });
});
