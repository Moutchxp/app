import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { compacter, gererPartitions, purgerCompteur, lireEntier, jourParis, poolMaintenance, type Requete } from './maintenance';

/**
 * M2 — LOT 3. Tests d'INTÉGRATION (vraie base ; migration 018 appliquée). Prouvent, sur données RÉELLES,
 * les propriétés de sûreté : idempotence, concurrence sans double comptage, purge qui ne perd jamais une
 * session, rétention lue depuis la base. Le DML porte sur `analytics_session`/compteurs (jours passés
 * isolés 2019/2020, nettoyés en beforeEach ET afterEach → aucun résidu). Le DERNIER bloc exécute du VRAI
 * DDL de partitionnement, mais UNIQUEMENT sur une table JETABLE (`zzz_maint_ddl_test`, DROP CASCADE
 * avant/après) — jamais sur `analytics_session` : le schéma réel n'est donc jamais modifié.
 */
const q: Requete = (t, p) =>
  poolMaintenance.query(t, p as never) as Promise<{ rows: unknown[]; rowCount: number | null }>;

const JOUR_A = '2020-01-15';
const JOUR_B = '2020-01-16';
const JOUR_VIEUX = '2019-06-10';

async function nettoyer(): Promise<void> {
  await q(`DELETE FROM analytics_session WHERE jour_paris IN ($1,$2)`, [JOUR_A, JOUR_B]);
  await q(`DELETE FROM analytics_session WHERE source = 'testunseal'`, []);
  await q(`DELETE FROM analytics_compteur_jour WHERE jour_paris IN ($1,$2,$3)`, [JOUR_A, JOUR_B, JOUR_VIEUX]);
  await q(`DELETE FROM analytics_compteur_jour WHERE source = 'testrecent'`, []);
}

async function insererSessions(jour: string, n: number, etape: string, source: string, device: string, complete: boolean): Promise<void> {
  await q(
    `INSERT INTO analytics_session (session_id, jour_paris, etape_max, source, device_type, complete)
     SELECT gen_random_uuid(), $1::date, $2, $3, $4, $5 FROM generate_series(1, $6)`,
    [jour, etape, source, device, complete, n],
  );
}
async function compteur(jour: string, etape: string, source: string): Promise<number> {
  const r = await q(
    `SELECT coalesce(sum(n),0)::int AS n FROM analytics_compteur_jour
      WHERE jour_paris=$1 AND nom='session_fin' AND etape=$2 AND source IS NOT DISTINCT FROM $3`,
    [jour, etape, source],
  );
  return (r.rows[0] as { n: number }).n;
}
async function nbSessions(jour: string): Promise<number> {
  const r = await q(`SELECT count(*)::int AS c FROM analytics_session WHERE jour_paris=$1`, [jour]);
  return (r.rows[0] as { c: number }).c;
}

beforeEach(nettoyer);
afterEach(nettoyer);
afterAll(async () => {
  await poolMaintenance.end().catch(() => {});
});

describe('compaction — idempotence (LE test du lot)', () => {
  it('2 exécutions consécutives → compteurs IDENTIQUES, sessions supprimées', async () => {
    await insererSessions(JOUR_A, 10, 'resultat', 'test', 'mobile', true);
    const today = jourParis();

    const t1 = await compacter(q, today, 1000);
    expect(t1).toBe(10);
    expect(await nbSessions(JOUR_A)).toBe(0); // sessions supprimées en même temps que comptées
    expect(await compteur(JOUR_A, 'resultat', 'test')).toBe(10);

    const t2 = await compacter(q, today, 1000); // REJEU
    expect(t2).toBe(0); // plus rien à compacter
    expect(await compteur(JOUR_A, 'resultat', 'test')).toBe(10); // INCHANGÉ → aucun double comptage
  });
});

describe('compaction — concurrence (aucun double comptage)', () => {
  it('2 exécutions SIMULTANÉES, petits lots → compteur = nb de sessions (pas le double)', async () => {
    await insererSessions(JOUR_B, 40, 'analyse', 'test', 'desktop', false);
    const today = jourParis();
    // Concurrence RÉELLE : deux boucles de compaction en parallèle (SKIP LOCKED → lots disjoints).
    await Promise.all([compacter(q, today, 5), compacter(q, today, 5)]);
    expect(await nbSessions(JOUR_B)).toBe(0);
    expect(await compteur(JOUR_B, 'analyse', 'test')).toBe(40); // 40, jamais 80
  });
});

describe('compaction — session incomplète & jour non scellé', () => {
  it('session INCOMPLÈTE compactée : « étape la plus loin » (etape_max) préservée', async () => {
    await insererSessions(JOUR_A, 3, 'photo', 'test', 'mobile', false);
    await compacter(q, jourParis(), 1000);
    expect(await compteur(JOUR_A, 'photo', 'test')).toBe(3);
  });

  it('une session du JOUR COURANT (non scellé) n’est PAS compactée', async () => {
    const today = jourParis();
    await q(
      `INSERT INTO analytics_session (session_id, jour_paris, etape_max, source, complete)
       VALUES (gen_random_uuid(), $1::date, 'intro', 'testunseal', false)`,
      [today],
    );
    await compacter(q, today, 1000);
    const r = await q(`SELECT count(*)::int AS c FROM analytics_session WHERE source='testunseal'`, []);
    expect((r.rows[0] as { c: number }).c).toBe(1); // intacte : jour_paris = today, pas < today
  });
});

describe('purge — ne perd jamais une session, suit la rétention', () => {
  it('la purge des compteurs NE TOUCHE JAMAIS analytics_session', async () => {
    await insererSessions(JOUR_A, 2, 'resultat', 'test', 'mobile', true);
    await purgerCompteur(q, 'analytics_compteur_jour', jourParis(), 400, 5000);
    await purgerCompteur(q, 'analytics_admin_jour', jourParis(), 400, 5000);
    expect(await nbSessions(JOUR_A)).toBe(2); // sessions intactes → aucune perte
  });

  it('un compteur HORS rétention est supprimé, un compteur DANS la rétention est gardé', async () => {
    await q(`INSERT INTO analytics_compteur_jour (jour_paris, nom, source, n) VALUES ($1::date, 'session_debut', 'test', 1)`, [JOUR_VIEUX]);
    await q(`INSERT INTO analytics_compteur_jour (jour_paris, nom, source, n) VALUES (current_date, 'session_debut', 'testrecent', 1)`, []);
    await purgerCompteur(q, 'analytics_compteur_jour', jourParis(), 400, 5000);
    const vieux = await q(`SELECT count(*)::int AS c FROM analytics_compteur_jour WHERE jour_paris=$1`, [JOUR_VIEUX]);
    const recent = await q(`SELECT count(*)::int AS c FROM analytics_compteur_jour WHERE source='testrecent'`, []);
    expect((vieux.rows[0] as { c: number }).c).toBe(0); // 2019 → hors 400 j → supprimé
    expect((recent.rows[0] as { c: number }).c).toBe(1); // aujourd'hui → dans 400 j → gardé
  });

  it('les durées viennent de analytics_retention (base), pas du code', async () => {
    // La valeur DB (400) l'emporte sur le fallback passé (999) → prouve la lecture DB.
    expect(await lireEntier(q, 'analytics_retention', 'jours', 'compteur_public_jours', 999)).toBe(400);
    // Clé absente → repli sûr.
    expect(await lireEntier(q, 'analytics_retention', 'jours', 'cle_inexistante', 777)).toBe(777);
  });
});

// Partitionnement : VRAI DDL, mais sur une table JETABLE (`parent` surchargé) — jamais sur analytics_session,
// pour ne pas toucher au schéma réel. Prouve ce que les tests unitaires (q mocké) ne peuvent pas : que le
// SQL de création/suppression de partition s'exécute réellement (dont le format LITTÉRAL des bornes, qui ne
// peut PAS être un paramètre lié). La table jetable est DROP CASCADE avant et après chaque test.
describe('partitions — VRAI DDL sur table jetable (isolée de analytics_session)', () => {
  const PARENT = 'zzz_maint_ddl_test';
  async function creerParent(): Promise<void> {
    await q(`DROP TABLE IF EXISTS ${PARENT} CASCADE`, []);
    await q(`CREATE TABLE ${PARENT} (jour_paris date NOT NULL, x int) PARTITION BY RANGE (jour_paris)`, []);
    await q(`CREATE TABLE ${PARENT}_default PARTITION OF ${PARENT} DEFAULT`, []);
  }
  beforeEach(creerParent);
  afterEach(async () => {
    await q(`DROP TABLE IF EXISTS ${PARENT} CASCADE`, []);
  });

  it('crée les partitions futures avec les BONNES bornes littérales (répare le bug des bornes paramétrées)', async () => {
    const r = await gererPartitions(q, '2026-07-10', 3, 2, PARENT);
    expect(r.creees).toEqual([`${PARENT}_2026_07`, `${PARENT}_2026_08`, `${PARENT}_2026_09`, `${PARENT}_2026_10`]);
    expect(r.conflits).toEqual([]);
    // Preuve en base : les bornes RÉELLES du DDL exécuté.
    const b = await q(
      `SELECT pg_get_expr(c.relpartbound, c.oid) AS b FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
        WHERE i.inhparent='${PARENT}'::regclass AND c.relname='${PARENT}_2026_07'`,
      [],
    );
    expect((b.rows[0] as { b: string }).b).toContain("FROM ('2026-07-01') TO ('2026-08-01')");
  });

  it('DROP une partition passée VIDE, GARDE une partition passée NON vide, ne touche jamais _default', async () => {
    await q(`CREATE TABLE ${PARENT}_2026_05 PARTITION OF ${PARENT} FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')`, []);
    await q(`CREATE TABLE ${PARENT}_2026_06 PARTITION OF ${PARENT} FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')`, []);
    await q(`INSERT INTO ${PARENT} (jour_paris, x) VALUES ('2026-06-15', 1)`, []); // juin NON vide
    const r = await gererPartitions(q, '2026-07-10', 0, 2, PARENT);
    expect(r.supprimees).toContain(`${PARENT}_2026_05`); // passée + vide → DROP
    expect(r.supprimees).not.toContain(`${PARENT}_2026_06`); // passée mais NON vide → gardée
    const noms = (
      await q(`SELECT c.relname AS nom FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='${PARENT}'::regclass`, [])
    ).rows.map((x) => (x as { nom: string }).nom);
    expect(noms).toContain(`${PARENT}_default`); // jamais DROP
    expect(noms).toContain(`${PARENT}_2026_06`); // gardée
    expect(noms).not.toContain(`${PARENT}_2026_05`); // supprimée
  });

  it('rattrape sans casser : DEFAULT peuplée pour le mois à créer → conflit 23514 capturé, non fatal', async () => {
    // Une ligne de juillet en DEFAULT (pas encore de partition juillet) → créer juillet violera la contrainte.
    await q(`INSERT INTO ${PARENT} (jour_paris, x) VALUES ('2026-07-05', 1)`, []);
    const r = await gererPartitions(q, '2026-07-10', 0, 2, PARENT);
    expect(r.conflits).toContain(`${PARENT}_2026_07`); // conflit signalé
    expect(r.creees).not.toContain(`${PARENT}_2026_07`); // pas créée
    // Non fatal : la fonction a terminé et la ligne est intacte (compactable plus tard).
    expect((await q(`SELECT count(*)::int AS c FROM ${PARENT}`, [])).rows[0]).toEqual({ c: 1 });
  });

  it('refuse un nom de table parent invalide (garde-fou d’interpolation DDL)', async () => {
    await expect(gererPartitions(q, '2026-07-10', 0, 2, 'evil; DROP TABLE x')).rejects.toThrow(/invalide/);
  });
});
