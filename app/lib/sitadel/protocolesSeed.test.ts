import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S18 — garde-fous statiques des scripts SQL (migration 066 + seed protocoles). Un script SQL ne s'exécute pas ici, mais on
 * verrouille ses propriétés critiques : additivité/idempotence de la migration, et le fait que le seed n'écrase JAMAIS un
 * e-mail existant. cwd de vitest = racine du dépôt.
 */
const migration = readFileSync('db/migrations/066_mairie_protocole.sql', 'utf8');
const seed = readFileSync('db/seed/2026-08-03_protocoles_communes.sql', 'utf8');

describe('S18 — migration 066 (additive, idempotente)', () => {
  it('ADD COLUMN IF NOT EXISTS pour les 4 colonnes, aucun DROP, un seul BEGIN/COMMIT', () => {
    for (const col of ['telephone', 'responsable_nom', 'protocole_verifie_le', 'protocole_source']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|VIEW)/i); // aucune instruction DROP réelle
    expect((migration.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });
});

describe('S18 — seed protocoles', () => {
  const set = seed.slice(seed.indexOf('DO UPDATE SET'));
  const clause = set.slice(0, set.indexOf(';'));

  it('le DO UPDATE SET n’écrase NI email NI adresse_postale NI protocole_source', () => {
    expect(clause).not.toMatch(/\bemail\s*=/);
    expect(clause).not.toMatch(/adresse_postale\s*=/);
    expect(clause).not.toMatch(/protocole_source\s*=/);
  });

  it('mais enrichit bien telephone / responsable_nom / url_formulaire / canal / protocole_verifie_le', () => {
    for (const col of ['telephone', 'responsable_nom', 'url_formulaire', 'canal', 'protocole_verifie_le']) {
      expect(clause).toContain(`${col} = EXCLUDED.${col}`);
    }
  });

  it('idempotence : marqueur « protocole_verifie_le IS DISTINCT FROM », un seul BEGIN/COMMIT', () => {
    expect(seed).toContain("protocole_verifie_le IS DISTINCT FROM DATE '2026-08-03'");
    expect((seed.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((seed.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });

  it('exclut les codes INSEE absents du référentiel (aucune ligne VALUES pour 78074 / 78279)', () => {
    expect(seed).not.toContain("('78074'"); // pas de ligne de données (le commentaire d'en-tête peut, lui, les citer)
    expect(seed).not.toContain("('78279'");
  });

  it('Paris (75056) et Montreuil (93048) passent en canal formulaire', () => {
    expect(seed).toContain("'75056'");
    expect(seed).toContain("'93048'");
    expect(seed).toMatch(/'formulaire'/);
  });
});
