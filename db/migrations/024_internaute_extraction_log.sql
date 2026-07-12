-- 024_internaute_extraction_log.sql — Module INTERNAUTE, LOT 3 : JOURNAL D'EXTRACTION (accountability RGPD).
--
-- MOTIF : tracer QUI a extrait/consulté QUOI et QUAND sur la base nominative (obligation d'accountability RGPD).
--   Une ligne par action d'exploitation interne (export CSV filtré, accès au dossier complet d'une personne). Même
--   patron append-only que `curation_patrimoine_log` / `admin_utilisateur_log` (014). Consommé par l'admin
--   Internautes (LOT 3), jamais dans un hot path public.
--
-- PORTÉE MINIMALE : UNE table append-only. Aucune modification des tables `internaute*` (023) ni d'aucune autre.
--
-- CLOISONNEMENT M2 (INVARIANT) : aucune FK/colonne vers `analytics_*` ni `login_echec` ; `utilisateur_id` référence
--   l'auteur ADMIN (`admin_utilisateur`, 014), jamais un internaute ni une session analytique. Aucun pont M2.
--
-- GOLDEN-SAFE : aucun contact avec le moteur → golden 29.107259068449615 trivialement inchangé.
--
-- IDEMPOTENTE (`CREATE TABLE/INDEX IF NOT EXISTS`). TRANSACTIONNELLE (`BEGIN;`/`COMMIT;`). ADDITIVE / NON
--   DESTRUCTIVE (aucun DROP/TRUNCATE/DELETE/UPDATE).
--
-- ROLLBACK (non destructif, process validé uniquement) : DROP TABLE IF EXISTS internaute_extraction_log;
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/024_internaute_extraction_log.sql
-- Vérification : \dt internaute_extraction_log ; \d internaute_extraction_log

BEGIN;

-- Journal append-only des extractions/consultations de la base nominative (accountability).
-- `utilisateur_id` = auteur ADMIN (id `admin_utilisateur`, NULL pour la voie de secours sub=null) ; jamais un
-- internaute. `filtres` = critères d'extraction (jsonb, pour rejouer/auditer). `nb_lignes` = volume extrait.
CREATE TABLE IF NOT EXISTS internaute_extraction_log (
  id             bigserial   PRIMARY KEY,
  ts             timestamptz NOT NULL DEFAULT now(),
  utilisateur_id integer     REFERENCES admin_utilisateur(id),   -- auteur admin ; NULL = voie de secours
  action         text        NOT NULL CHECK (action IN ('export_csv', 'acces_profil')),
  cible_internaute_id uuid,                                      -- pour 'acces_profil' (le dossier consulté)
  filtres        jsonb,                                          -- pour 'export_csv' (critères appliqués)
  nb_lignes      integer                                         -- volume extrait (export)
);
CREATE INDEX IF NOT EXISTS internaute_extraction_log_ts_idx ON internaute_extraction_log (ts);

COMMIT;
