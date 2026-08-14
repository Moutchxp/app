import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * T7-A — garde-fous STATIQUES de la migration 099 (distinguer documents/autre + ancre T7-B). Contrairement à 096, ce fichier
 * CONTIENT deux UPDATE (le backfill rétroactif) : on ne les interdit donc pas, mais on borne strictement leur portée. On vérifie
 * l'ADD COLUMN de l'ancre, que le backfill ne touche QUE des `indetermine`, qu'il n'écrit PAS nature_classee_le (l'ancre reste
 * NULL en rétro), et qu'il ne touche NI demande.statut NI satisfait_le NI Archives. Aucune connexion DB (lecture du fichier).
 */
const migration = readFileSync('db/migrations/099_reponse_nature_documents.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const norm = code.replace(/\s+/g, ' ');

describe('T7-A — migration 099 : documents/autre + ancre nature_classee_le', () => {
  it('demande_reponse.nature_classee_le : ADD COLUMN IF NOT EXISTS timestamptz (nullable)', () => {
    expect(/ALTER TABLE demande_reponse\s+ADD COLUMN IF NOT EXISTS\s+nature_classee_le\s+timestamptz/i.test(code)).toBe(true);
    // nullable : jamais NOT NULL sur cette colonne (l'ancre DOIT pouvoir rester NULL pour le backfill).
    expect(/nature_classee_le\s+timestamptz\s+NOT NULL/i.test(code)).toBe(false);
  });

  it('BACKFILL documents : indetermine → documents si pièce OU lien fort (ligne demande_reponse_piece, indépendante de cle_stockage)', () => {
    expect(norm).toContain("SET nature = 'documents'");
    expect(/nature = 'documents'[\s\S]*WHERE r\.nature = 'indetermine'/i.test(code)).toBe(true);
    expect(norm).toContain('EXISTS (SELECT 1 FROM demande_reponse_piece p WHERE p.reponse_id = r.id)');
    expect(norm).toContain('EXISTS (SELECT 1 FROM demande_reponse_lien l WHERE l.reponse_id = r.id AND l.fort)');
    // la présence d'une ligne pièce SUFFIT : le backfill ne filtre JAMAIS sur cle_stockage.
    expect(/demande_reponse_piece[\s\S]*cle_stockage/i.test(code)).toBe(false);
  });

  it('BACKFILL autre : le reste des indetermine → autre (aucun indetermine historique ne subsiste)', () => {
    expect(norm).toContain("SET nature = 'autre'");
    expect(/nature = 'autre'\s+WHERE r\.nature = 'indetermine'/i.test(norm)).toBe(true);
  });

  it('les DEUX backfills sont bornés à nature = indetermine (accuse/rebond jamais touchés)', () => {
    const updates = norm.match(/UPDATE demande_reponse r SET nature = '(?:documents|autre)'[^;]*/gi) ?? [];
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(/WHERE r\.nature = 'indetermine'/i.test(u)).toBe(true);
  });

  it('ANCRE : le backfill n’écrit JAMAIS nature_classee_le (reste NULL en rétroactif)', () => {
    expect(/UPDATE[\s\S]*SET[\s\S]*nature_classee_le/i.test(code)).toBe(false);
  });

  it('SÛR : aucun DROP table/colonne/index, aucun DELETE/TRUNCATE ; ne touche pas demande.statut, ni satisfait_le, ni Archives ; une seule transaction ; aucun trigger', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false);
    expect(/SET\s+statut|UPDATE\s+demande\b/i.test(code)).toBe(false);
    expect(/satisfait_le/i.test(code)).toBe(false);
    expect(/dossier_document|demande_dossier/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
  });
});
