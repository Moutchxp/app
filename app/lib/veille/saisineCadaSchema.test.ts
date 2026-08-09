import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_VEILLE_DEFAUT } from '../sitadel/veilleConfig';

/**
 * X1 — garde-fous STATIQUES de la migration 083 (socle CADA). PAS strictement additive : recréation (DROP+ADD) de la SEULE
 * contrainte de TYPE de demande_relance pour élargir la liste fermée. Le reste est additif (colonnes avis_* + config CADA).
 * Aucune connexion DB (contrôle du texte, comme les autres *Schema.test.ts).
 */
const migration = readFileSync('db/migrations/083_saisine_cada.sql', 'utf8');
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('X1 — migration 083 : type élargi + avis CADA + config CADA', () => {
  it('type demande_relance : recréation DROP+ADD, liste fermée = relance + saisine_cada (une 3e valeur exclue)', () => {
    expect(/ALTER TABLE demande_relance\s+DROP CONSTRAINT IF EXISTS\s+demande_relance_type_chk/i.test(code)).toBe(true);
    expect(/ADD CONSTRAINT\s+demande_relance_type_chk\s+CHECK\s*\(\s*type IN/i.test(code)).toBe(true);
    const m = code.match(/type IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("'relance'");
    expect(m![1]).toContain("'saisine_cada'");
    expect(m![1]).not.toContain("'autre'"); // liste fermée aux deux seules valeurs → toute 3e valeur est refusée
  });

  it('avis CADA : avis_recu_le timestamptz + avis_sens text avec CHECK (NULL ou favorable/defavorable/sans_suite)', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+avis_recu_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/ADD COLUMN IF NOT EXISTS\s+avis_sens\s+text/i.test(code)).toBe(true);
    expect(/avis_sens IS NULL OR avis_sens IN\s*\(\s*'favorable',\s*'defavorable',\s*'sans_suite'\s*\)/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN demande_relance\.avis_recu_le/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN demande_relance\.avis_sens/i.test(code)).toBe(true);
  });

  it('config CADA : cada_email (NOT NULL DEFAULT \'\', CHECK vide-ou-email) + cada_url_formulaire (défaut = défaut du code)', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+cada_email\s+text\s+NOT NULL\s+DEFAULT\s+''/i.test(code)).toBe(true);
    expect(/config_veille_cada_email_check[\s\S]*cada_email = '' OR cada_email ~\*/i.test(code)).toBe(true);
    const urlDefaut = CONFIG_VEILLE_DEFAUT.cadaUrlFormulaire.replace(/[.]/g, '\\.').replace(/\//g, '/');
    expect(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+cada_url_formulaire\\s+text\\s+NOT NULL\\s+DEFAULT\\s+'${urlDefaut}'`, 'i').test(code)).toBe(true);
    expect(/COMMENT ON COLUMN config_veille\.cada_email/i.test(code)).toBe(true);
    expect(/COMMENT ON COLUMN config_veille\.cada_url_formulaire/i.test(code)).toBe(true);
  });

  it('le COMMENT de cada_email dit que vide = formulaire en ligne (et non « envoi impossible »)', () => {
    expect(/FORMULAIRE EN LIGNE/i.test(code)).toBe(true);
    expect(/envoi impossible/i.test(code)).toBe(true); // le COMMENT lève explicitement l'ambiguïté « vide ≠ envoi impossible »
  });

  it('sûreté : DROP CONSTRAINT seul (aucun DROP table/colonne/index), pas de DELETE/UPDATE, pas de SET statut, une transaction', () => {
    expect(/DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false); // le DROP CONSTRAINT (recréation du type) est le seul autorisé
    expect(/DELETE\s+FROM|TRUNCATE|UPDATE\s+/i.test(code)).toBe(false);
    expect(/SET\s+statut/i.test(code)).toBe(false);
    expect(/CREATE\s+TRIGGER/i.test(code)).toBe(false);
    expect(/BEGIN;/.test(code) && /COMMIT;/.test(code)).toBe(true);
  });
});
