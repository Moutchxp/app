import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * B2 — garde-fous STATIQUES de la migration 093. (a) RECRÉATION de la contrainte des canaux d'acheminement pour AJOUTER
 * 'formulaire' (téléservice) — élargissement d'une liste fermée, jamais un rétrécissement. (b) RÉPARATION : crée la ligne
 * d'acheminement manquante des dépôts téléservice déjà passés en 'envoyee', en ancrant envoye_le sur l'horodatage du dépôt
 * lu dans demande_journal (source, pas une date devinée). N'écrit JAMAIS demande.statut. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/093_acheminement_formulaire.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('B2 — migration 093 : canal formulaire + réparation ancrée sur le journal', () => {
  it('contrainte des canaux RECRÉÉE (DROP IF EXISTS + ADD) avec email, recommande, formulaire', () => {
    expect(/ALTER TABLE demande_acheminement\s+DROP CONSTRAINT IF EXISTS\s+demande_acheminement_canal_chk/i.test(code)).toBe(true);
    expect(/ADD CONSTRAINT\s+demande_acheminement_canal_chk/i.test(code)).toBe(true);
    const m = code.match(/canal\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    for (const v of ['email', 'recommande', 'formulaire']) expect(m![1]).toContain(`'${v}'`);
  });

  it('réparation : INSERT une ligne canal=formulaire statut=envoye, envoye_le ancré sur demande_journal (dépôt), idempotent', () => {
    const n = code.replace(/\s+/g, ' ');
    expect(n).toContain('INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le)');
    expect(n).toContain("'formulaire'");
    expect(n).toContain("'envoye'");
    // ancre = horodatage du journal (statut_apres envoyee, motif « dépôt manuel … »), pas une date inventée
    expect(/FROM demande_journal[\s\S]*statut_apres = 'envoyee'[\s\S]*motif LIKE 'dépôt manuel/i.test(code)).toBe(true);
    // idempotent + borné : ne cible que les demandes formulaire envoyées SANS ligne d'acheminement
    expect(/NOT EXISTS\s*\(SELECT 1 FROM demande_acheminement/i.test(code)).toBe(true);
    expect(/dest_canal = 'formulaire'[\s\S]*statut = 'envoyee'/i.test(code)).toBe(true);
  });

  it('sûre : le SEUL DROP est le DROP CONSTRAINT (recréation) ; aucun UPDATE/DELETE, ne touche pas demande.statut, une transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false); // jamais un DROP destructeur
    expect(/UPDATE\s+|DELETE\s+FROM|TRUNCATE/i.test(code)).toBe(false); // la réparation est un INSERT borné, pas un UPDATE
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
