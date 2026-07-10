-- 019_m2_maintenance_config.sql — M2 (statistiques), LOT 3 : config du job de maintenance analytique.
--
-- MOTIF : le job de maintenance (compaction + partitions + purge, `app/lib/analytics/maintenance.ts`) a
-- deux réglages d'EXPLOITATION qui doivent naître EN CONFIG (éditables au runtime, « pilotage sans code »),
-- jamais en dur : le nombre de mois de partitions créées à l'avance, et la taille des lots (batch) de
-- compaction/purge. Les DURÉES DE RÉTENTION vivent déjà dans `analytics_retention` (migration 018) — cette
-- table-ci ne porte QUE les réglages du job.
--
-- ⚠️ NON BLOQUANTE : le job lit ces valeurs avec un REPLI sûr sur des défauts codés (comme
-- `profilConfig` avec `PROFIL_DEGAGEMENT_DEFAUT`). Le job FONCTIONNE donc même si cette migration n'est pas
-- (encore) appliquée ; l'appliquer rend seulement les réglages éditables sans code.
--
-- REJOUABLE / IDEMPOTENTE (`CREATE TABLE IF NOT EXISTS`, seed `ON CONFLICT DO NOTHING`).
-- TRANSACTIONNELLE (BEGIN/COMMIT). ADDITIVE : AUCUN DROP/ALTER/TRIGGER sur une table existante ; table
-- strictement nouvelle, isolée → golden hors de portée.
--
-- Application MANUELLE (Arno) : psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/019_m2_maintenance_config.sql
-- Rollback non destructif : DROP TABLE IF EXISTS analytics_maintenance_config;

BEGIN;

CREATE TABLE IF NOT EXISTS analytics_maintenance_config (
  cle          text PRIMARY KEY,
  valeur       integer NOT NULL CHECK (valeur > 0),
  description  text
);

INSERT INTO analytics_maintenance_config (cle, valeur, description) VALUES
  ('partitions_mois_avance',    3,    'Nombre de mois de partitions de analytics_session créées à l''avance'),
  ('compaction_taille_lot',     1000, 'Taille de lot (sessions) par transaction de compaction atomique'),
  ('purge_compteur_taille_lot', 5000, 'Taille de lot (lignes) par transaction de purge des compteurs')
ON CONFLICT (cle) DO NOTHING;

COMMIT;
