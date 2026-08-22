import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Cascade lot 2 — garde-fous STATIQUES de la migration 136 (élargir la variante à la cascade + poser ses réglages). Aucune
 * connexion DB (lecture du fichier). On vérifie : la liste fermée élargie ('formelle' CONSERVÉE), les 4 colonnes config_veille
 * avec leurs défauts et bornes lisibles par parserBornesCheck, le report VESTIGIAL idempotent (gardé), et l'INNOCUITÉ (aucun
 * DROP table/colonne/index, aucun DELETE/TRUNCATE, aucun trigger ; l'index vivant_uniq JAMAIS modifié ; une seule transaction).
 */
const migration = readFileSync('db/migrations/136_relance_cascade_reglages.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const norm = code.replace(/\s+/g, ' ');

describe('cascade lot 2 — migration 136 : variante élargie + réglages', () => {
  it('variante : le CHECK NOMMÉ est droppé puis rétabli avec la liste fermée de la cascade', () => {
    expect(/ALTER TABLE demande_relance DROP CONSTRAINT IF EXISTS demande_relance_variante_check/i.test(norm)).toBe(true);
    expect(norm).toContain("ADD CONSTRAINT demande_relance_variante_check CHECK (variante IN ('rappel', 'avis', 'saisine', 'formelle'))");
  });

  it("'formelle' est CONSERVÉE dans la liste fermée (donnée héritée jamais réécrite)", () => {
    const m = /variante IN \(([^)]*)\)/i.exec(norm);
    expect(m).not.toBeNull();
    for (const v of ['rappel', 'avis', 'saisine', 'formelle']) expect(m![1]).toContain(`'${v}'`);
  });

  it('les 3 délais : ADD COLUMN IF NOT EXISTS integer NOT NULL DEFAULT + borne 1..30 (lisible par parserBornesCheck)', () => {
    for (const [col, def] of [['relance_rappel_jours_avant', '10'], ['relance_avis_jours_avant', '3'], ['relance_saisine_delai_jours', '4']] as const) {
      expect(norm).toContain(`ADD COLUMN IF NOT EXISTS ${col} integer NOT NULL DEFAULT ${def}`);
      expect(norm).toContain(`CHECK (${col} BETWEEN 1 AND 30)`);
    }
  });

  it('auto-saisine CADA : ADD COLUMN IF NOT EXISTS boolean NOT NULL DEFAULT false', () => {
    expect(norm).toContain('ADD COLUMN IF NOT EXISTS saisine_cada_auto_active boolean NOT NULL DEFAULT false');
  });

  it('report VESTIGIAL → successeur : UPDATE GARDÉ (idempotent, jamais un clobber)', () => {
    expect(norm).toContain('UPDATE config_veille SET relance_rappel_jours_avant = relance_jours_avant_echeance');
    expect(norm).toContain('WHERE id = 1 AND relance_rappel_jours_avant = 10 AND relance_jours_avant_echeance <> 10');
  });

  it('COMMENT marque relance_jours_avant_echeance VESTIGIAL (non supprimée)', () => {
    expect(/COMMENT ON COLUMN config_veille\.relance_jours_avant_echeance IS\s+'VESTIGIAL/i.test(code)).toBe(true);
  });

  it('l’index demande_relance_vivante_uniq n’est JAMAIS créé/droppé/altéré (seulement lu en vérification)', () => {
    expect(/(CREATE|DROP|ALTER)[^;]*demande_relance_vivante_uniq/i.test(norm)).toBe(false);
    expect(/DROP INDEX/i.test(norm)).toBe(false);
  });

  it('SÛR : aucun DROP table/colonne, aucun DELETE/TRUNCATE, aucun trigger ; DROP CONSTRAINT limité à variante ; une transaction', () => {
    expect(/DROP TABLE/i.test(norm)).toBe(false);
    expect(/DROP COLUMN/i.test(norm)).toBe(false);
    expect(/\bDELETE\s+FROM\b/i.test(norm)).toBe(false);
    expect(/TRUNCATE/i.test(norm)).toBe(false);
    expect(/CREATE TRIGGER/i.test(norm)).toBe(false);
    // le SEUL DROP CONSTRAINT porte sur le CHECK de variante (aucune autre contrainte touchée)
    const drops = norm.match(/DROP CONSTRAINT IF EXISTS \w+/gi) ?? [];
    expect(drops).toEqual(['DROP CONSTRAINT IF EXISTS demande_relance_variante_check']);
    expect((norm.match(/\bBEGIN\b/gi) ?? []).length).toBe(1);
    expect((norm.match(/\bCOMMIT\b/gi) ?? []).length).toBe(1);
  });
});
