import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FUS — garde-fous STATIQUES de la migration 127 (réparation de données). Elle REJOUE l'invariant « envoye_le d'un dépôt
 * téléservice jamais postérieur au premier accusé » sur les lignes déjà écrites (le clamp posé à l'écriture ne pouvait rien
 * quand l'accusé était rattaché APRÈS le clic — cas 000157). UPDATE BORNÉ au canal 'formulaire' (l'e-mail n'est jamais touché),
 * ne touche PAS demande_journal, IDEMPOTENT, dry-run par ROLLBACK. Aucune connexion DB.
 */
const migration = readFileSync('db/migrations/127_reparation_envoye_le_formulaire.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
const n = code.replace(/\s+/g, ' ');

describe('FUS — migration 127 : réparation envoye_le formulaire, bornée à l’accusé', () => {
  it('UPDATE envoye_le = premier accusé (min recu_le nature=accuse) sur demande_acheminement', () => {
    expect(/UPDATE demande_acheminement/i.test(code)).toBe(true);
    expect(n).toContain('SET envoye_le = (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = \'accuse\')');
  });

  it('BORNÉ : canal formulaire + statut envoye + SEULEMENT les lignes envoye_le > premier accusé (idempotent)', () => {
    expect(n).toContain("a.canal = 'formulaire'");
    expect(n).toContain("a.statut = 'envoye'");
    // le prédicat de sélection EST aussi la garantie d'idempotence : après correction, envoye_le = accusé ⇒ « > » faux ⇒ plus rien.
    expect(/a\.envoye_le > \(SELECT min\(r\.recu_le\) FROM demande_reponse r WHERE r\.demande_id = a\.demande_id AND r\.nature = 'accuse'\)/i.test(n)).toBe(true);
  });

  it('canal E-MAIL jamais touché : filtre canal=formulaire, aucune mention de canal email dans l’écriture', () => {
    expect(n).toContain("a.canal = 'formulaire'");
    expect(n.includes("'email'")).toBe(false);
  });

  it('demande_journal NON touché (piste d’audit du clic préservée) ; seule colonne écrite = envoye_le (+ maj_a)', () => {
    expect(/demande_journal/i.test(code)).toBe(false);
    expect(/UPDATE\s+demande\b(?!_acheminement)/i.test(code)).toBe(false); // ne touche pas la table demande
    expect(/SET\s+statut/i.test(code)).toBe(false);
  });

  it('sûre : aucun DROP/CREATE/DELETE/TRUNCATE, une transaction, dry-run documenté par ROLLBACK', () => {
    expect(/DROP\s+|DELETE\s+FROM|TRUNCATE|CREATE\s+(TABLE|INDEX|TRIGGER)/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
    expect(/ROLLBACK/i.test(migration)).toBe(true); // le mode dry-run est explicitement décrit
  });

  it('contrôle AVANT/APRÈS émis (encadré vérifiable, restantes attendues = 0)', () => {
    expect(/AVANT — lignes formulaire dont envoye_le > premier accusé/i.test(migration)).toBe(true);
    expect(/APRÈS[\s\S]*attendu\s*:\s*0/i.test(migration)).toBe(true);
    expect(n).toContain('count(*) AS restantes');
  });
});
