import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT B — garde-fous STATIQUES de la migration 128 (réglages de relance + marqueur de variante). DDL strictement ADDITIVE :
 * deux colonnes config_veille (booléen + entier borné 1..30) et une colonne demande_relance (texte, liste fermée), toutes en
 * ADD COLUMN IF NOT EXISTS avec CHECK EN LIGNE (idempotents). Aucune connexion DB (lecture du fichier). Prouve : additivité,
 * bornes/liste lisibles par parserBornesCheck/parserListeCheck, et surtout que l'index unique et le CHECK de type NE SONT PAS
 * touchés (l'ajout de variante ne doit rien changer à « une relance vivante par (demande_id, type) »).
 */
const migration = readFileSync('db/migrations/128_relance_reglages_et_variante.sql', 'utf8');
const brut = migration.split('\n').filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('\\echo')).join('\n');
const code = brut.slice(0, brut.indexOf('COMMIT;') + 'COMMIT;'.length); // corps transactionnel seul (hors bloc de vérification)
const norm = code.replace(/\s+/g, ' ');

describe('LOT B — migration 128 : config_veille (relance_auto_active + relance_jours_avant_echeance)', () => {
  it('relance_auto_active : booléen additif, NOT NULL DEFAULT false', () => {
    expect(/ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_auto_active boolean NOT NULL DEFAULT false/i.test(norm)).toBe(true);
  });

  it('relance_jours_avant_echeance : entier additif, NOT NULL DEFAULT 10, borné 1..30 (CHECK en ligne)', () => {
    expect(/ADD COLUMN IF NOT EXISTS relance_jours_avant_echeance integer NOT NULL DEFAULT 10/i.test(norm)).toBe(true);
    expect(/relance_jours_avant_echeance BETWEEN 1 AND 30/i.test(norm)).toBe(true);
  });

  it('COMMENT sur les deux colonnes, et dit que relance_auto_active n’est lu par AUCUN code d’envoi dans ce lot', () => {
    expect(/COMMENT ON COLUMN config_veille\.relance_auto_active/i.test(norm)).toBe(true);
    expect(/COMMENT ON COLUMN config_veille\.relance_jours_avant_echeance/i.test(norm)).toBe(true);
    expect(norm).toMatch(/AUCUN CODE D''ENVOI/i); // le booléen ne pilote rien dans ce lot
  });
});

describe('LOT B — migration 128 : demande_relance.variante (liste fermée, sens limité à type=relance)', () => {
  it('variante : texte additif, NOT NULL DEFAULT ’formelle’, liste fermée (rappel, formelle)', () => {
    expect(/ALTER TABLE demande_relance ADD COLUMN IF NOT EXISTS variante text NOT NULL DEFAULT 'formelle'/i.test(norm)).toBe(true);
    expect(/variante IN \('rappel', 'formelle'\)/i.test(norm)).toBe(true);
  });

  it('le COMMENT dit que variante n’a de sens que pour type=relance (valeur par défaut, sans signification, sur une saisine CADA)', () => {
    expect(/COMMENT ON COLUMN demande_relance\.variante/i.test(norm)).toBe(true);
    expect(norm).toMatch(/type=''relance''/i);
    expect(norm).toMatch(/saisine_cada/i);
  });
});

describe('LOT B — migration 128 : additive PURE, n’altère ni le CHECK de type ni l’index unique', () => {
  it('aucun UPDATE/DELETE/TRUNCATE/INSERT, aucun DROP, aucun trigger ; une seule transaction', () => {
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO/i.test(code)).toBe(false);
    expect(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });

  it('ne recrée NI le CHECK de demande_relance.type NI l’index « une relance vivante » (demande_relance_vivante_uniq)', () => {
    // Aucune contrainte NOMMÉE ajoutée/retirée → le CHECK de type (076) est intact (le seul CHECK ici est EN LIGNE sur les colonnes ajoutées).
    expect(/ADD\s+CONSTRAINT|DROP\s+CONSTRAINT/i.test(code)).toBe(false);
    expect(/demande_relance_vivante_uniq/i.test(code)).toBe(false); // l'index unique n'est ni cité ni recréé dans le corps transactionnel
    expect(/CREATE\s+(UNIQUE\s+)?INDEX/i.test(code)).toBe(false);
  });

  it('ne touche NI demande.statut NI le moteur de score', () => {
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/config_scoring|batiment_vue|\bscore\b/i.test(code)).toBe(false);
  });
});
