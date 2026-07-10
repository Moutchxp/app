import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * M2 — LOT 1. Analyse STATIQUE de la migration (aucune exécution DB, comme exigé). Prouve les
 * garanties structurelles : idempotence, transactionnalité, additivité (zéro couplage moteur), et
 * IMPOSSIBILITÉ STRUCTURELLE de stocker IP / seconde / coordonnée / cleabs / identité.
 */
const BRUT = readFileSync(
  resolve(__dirname, '../../../db/migrations/018_m2_analytics_fondation.sql'),
  'utf8',
);
// Les vérifications structurelles portent sur le DDL, PAS sur les commentaires d'en-tête (qui, eux,
// MENTIONNENT légitimement les termes interdits pour expliquer qu'ils sont absents). On retire donc
// les commentaires `-- …` avant analyse. (Aucun commentaire de bloc, aucun `--` dans une chaîne SQL.)
const SQL = BRUT.replace(/--.*$/gm, '');
const sqlBas = SQL.toLowerCase();

describe('migration 018 — transactionnelle & idempotente', () => {
  it('est encadrée par BEGIN … COMMIT', () => {
    expect(/\bbegin\s*;/i.test(SQL)).toBe(true);
    expect(/\bcommit\s*;/i.test(SQL)).toBe(true);
  });

  it('toutes les tables sont créées en IF NOT EXISTS (rejouable)', () => {
    const creations = SQL.match(/create table[^(]*/gi) ?? [];
    expect(creations.length).toBeGreaterThanOrEqual(5); // 5 tables analytics
    for (const c of creations) expect(c.toLowerCase()).toContain('if not exists');
  });

  it('le seed utilise ON CONFLICT DO NOTHING (rejouable)', () => {
    const inserts = SQL.match(/insert into[\s\S]*?;/gi) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    for (const ins of inserts) expect(ins.toLowerCase()).toContain('on conflict');
  });
});

describe('migration 018 — additive, aucun couplage moteur', () => {
  it('ne contient AUCUN DROP / TRUNCATE / DELETE / ALTER de données', () => {
    expect(/\bdrop\s+table\b/i.test(SQL)).toBe(false);
    expect(/\btruncate\b/i.test(SQL)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(SQL)).toBe(false);
    expect(/\balter\s+table\b/i.test(SQL)).toBe(false);
  });

  it('ne crée AUCUN trigger (aucun couplage à une table de calcul)', () => {
    expect(/\btrigger\b/i.test(SQL)).toBe(false);
  });

  it('ne référence AUCUNE table de calcul existante', () => {
    for (const t of ['bdtopo_batiment', 'mns_lidar_brut', 'mnt_lidar_brut', 'patrimoine_entite', 'config_scoring', 'adresse_ban']) {
      expect(sqlBas.includes(t), `ne doit pas référencer ${t}`).toBe(false);
    }
  });
});

describe('migration 018 — impossibilité STRUCTURELLE de stocker des données personnelles', () => {
  it('aucune colonne IP (ni inet, ni ip_hash sous aucune forme)', () => {
    expect(/\binet\b/i.test(SQL)).toBe(false);
    expect(/ip_hash/i.test(SQL)).toBe(false);
    expect(/\bip_/i.test(SQL)).toBe(false);
  });

  it('aucun timestamp/timestamptz/time au repos : le seul temps est `date`', () => {
    // Aucune colonne de type temps avec seconde. (Le seul « temps » est `jour_paris date`.)
    expect(/\btimestamptz\b/i.test(SQL)).toBe(false);
    expect(/\btimestamp\b/i.test(SQL)).toBe(false);
    expect(/\btime\b(?!\s+zone)/i.test(SQL)).toBe(false); // « time » sauf « TIME ZONE » du DO-block
    expect(/jour_paris\s+date/i.test(SQL)).toBe(true); // le grain temporel EST le jour
  });

  it('aucune coordonnée / géométrie / cleabs / identité', () => {
    expect(/\bgeometry\b/i.test(SQL)).toBe(false);
    expect(/\bgeography\b/i.test(SQL)).toBe(false);
    expect(/cleabs/i.test(SQL)).toBe(false);
    expect(/\blat(itude)?\b/i.test(SQL)).toBe(false);
    expect(/\blon(gitude)?\b/i.test(SQL)).toBe(false);
    expect(/\bemail\b/i.test(SQL)).toBe(false);
  });

  it('la SEULE géo (commune_insee) est bornée à un code INSEE 5 caractères', () => {
    expect(/commune_insee\s+text\s+check/i.test(SQL)).toBe(true);
    expect(SQL).toContain("^(2[AB]|[0-9]{2})[0-9]{3}$");
  });
});

describe('migration 018 — sémantique correcte', () => {
  it("nom d'événement contraint par FK vers le catalogue (extensible au runtime, inconnu rejeté)", () => {
    expect(/references\s+analytics_catalogue_evenement\(nom\)/i.test(SQL)).toBe(true);
  });

  it('verdict est une liste fermée par CHECK', () => {
    expect(/verdict\s+text\s+check\s*\(verdict in \('sans_vis_a_vis', 'vis_a_vis', 'indetermine'\)\)/i.test(SQL)).toBe(true);
  });

  it('les compteurs utilisent UNIQUE NULLS NOT DISTINCT (agrégation correcte des dimensions nulles)', () => {
    const occurrences = (SQL.match(/unique nulls not distinct/gi) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2); // compteur public + compteur interne
  });

  it('analytics_session est partitionnée par mois (purge par DROP)', () => {
    expect(/partition by range \(jour_paris\)/i.test(SQL)).toBe(true);
    expect(/partition of analytics_session/i.test(SQL)).toBe(true);
  });

  it('les rétentions naissent en table de config (jamais en dur)', () => {
    expect(/create table if not exists analytics_retention/i.test(SQL)).toBe(true);
    expect(/insert into analytics_retention/i.test(SQL)).toBe(true);
  });
});
