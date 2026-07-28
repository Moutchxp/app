-- 056_veille_run.sql — Module VEILLE PERMIS (chantier S11a) : JOURNAL D'EXÉCUTION de l'ingestion Sitadel + réglages
-- d'automatisation. Ce chantier crée le MOTEUR d'exécution planifiée (idempotent, journalisé, sûr) ; il NE crée AUCUN
-- déclencheur (pas de launchd/cron/API — chantier suivant). AUCUN ENVOI.
--
-- MOTIF : rendre l'ingestion exécutable sans humain, tout en gardant une TRACE lisible et auditable de chaque passage
-- (quand, déclenché comment, quel millésime, combien de lignes/dossiers, succès ou échec et pourquoi). Une table muette
-- serait ingérable à diagnostiquer ; d'où `veille_run`.
--
-- SÛR : DDL additive (CREATE TABLE + ADD COLUMN IF NOT EXISTS). Aucun DROP, aucune écriture destructive, idempotent.
-- GOLDEN-SAFE : aucun contact moteur/config_scoring/batiment/verdict → golden 29.107259068449615 intact.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/056_veille_run.sql
-- Vérification : \d veille_run · \d config_veille (auto_active / auto_intervalle_heures / csv_retention_jours)

BEGIN;

-- 1) Journal d'exécution : une ligne par passage du moteur.
CREATE TABLE IF NOT EXISTS veille_run (
  id                bigserial PRIMARY KEY,
  declencheur       text NOT NULL CHECK (declencheur IN ('manuel','planifie','api')), -- qui a lancé : Arno / planificateur / route à secret
  demarre_le        timestamptz NOT NULL DEFAULT now(),
  fini_le           timestamptz,                                                      -- NULL tant que le run est 'en_cours'
  statut            text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','succes','rien_a_faire','echec')),
  millesime_detecte text,        -- millésime lu à distance (métadonnées DiDo) — bon marché, sans télécharger le CSV
  millesime_ingere  text,        -- millésime réellement ingéré (NULL si 'rien_a_faire' : rien n'a été téléchargé)
  lignes_lues       integer,     -- compteurs RÉELS de l'ingestion (renseignés au succès)
  dossiers_retenus  integer,
  dossiers_nouveaux integer,
  message           text,        -- phrase lisible (résumé du run, ou raison d'un 'rien_a_faire')
  erreur            text         -- motif d'échec (renseigné UNIQUEMENT en 'echec' — jamais une table muette)
);
COMMENT ON TABLE veille_run IS 'Journal d''exécution du moteur de veille Sitadel (chantier S11a) : un enregistrement par passage. Auditabilité : quand, déclenché comment, quel millésime, combien de lignes/dossiers, succès/échec et pourquoi.';
COMMENT ON COLUMN veille_run.millesime_detecte IS 'Millésime lu à distance via les métadonnées DiDo (GET /datafiles/{rid}, champ millesime) — sans télécharger les ~880 Mo de CSV.';
COMMENT ON COLUMN veille_run.erreur IS 'Motif d''échec, écrit en base AVANT que l''erreur ne soit relancée : un run raté laisse toujours une trace lisible.';
CREATE INDEX IF NOT EXISTS veille_run_demarre_idx ON veille_run (demarre_le DESC);

-- 2) Réglages d'automatisation (pilotage sans code — rejoignent le singleton config_veille).
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS auto_active boolean NOT NULL DEFAULT false; -- l'automatisation démarre ÉTEINTE : c'est Arno qui l'allume
COMMENT ON COLUMN config_veille.auto_active IS 'Interrupteur de l''ingestion automatique. FALSE par défaut : l''automatisation ne démarre JAMAIS d''elle-même ; Arno l''active explicitement.';
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS auto_intervalle_heures integer NOT NULL DEFAULT 24 CHECK (auto_intervalle_heures BETWEEN 1 AND 168);
COMMENT ON COLUMN config_veille.auto_intervalle_heures IS 'Intervalle minimal (heures) entre deux runs planifiés RÉUSSIS. Défaut 24 h ; borne [1;168] (1 h à 1 semaine).';
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS csv_retention_jours integer NOT NULL DEFAULT 0 CHECK (csv_retention_jours BETWEEN 0 AND 90);
COMMENT ON COLUMN config_veille.csv_retention_jours IS 'Rétention des CSV Sitadel téléchargés (jours) après un run RÉUSSI. 0 = supprimer dès le succès (défaut, ~1,2 Go économisés). La purge n''a JAMAIS lieu sur un run ''rien_a_faire'' ou ''echec''.';

COMMIT;
