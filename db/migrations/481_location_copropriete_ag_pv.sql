-- 481_location_copropriete_ag_pv.sql — LES PROCÈS-VERBAUX D'AG SAISIS DANS LA FICHE COPROPRIÉTÉ (Arno, 17/11/2026).
--
-- LE BESOIN (demande d'Arno du 17/11/2026) : « FICHE COPROPRIÉTÉ, bloc « AG » : aujourd'hui, impossible d'ajouter une date. Ajoute « + Ajouter
-- un PV d'AG » : date du PV (obligatoire), type obligatoire « AGO (assemblée générale ordinaire) » ou « AGE (assemblée générale
-- extraordinaire) », note facultative. […] modifier une erreur se fait par « Corriger » (avec trace), sans jamais effacer. Les dates déjà
-- enregistrées (migration 475) sont reprises comme AGO par défaut et restent corrigeables. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur l'historique de la 475 (`gestion_copropriete_ag`, qui reste en ajout seul : trigger inchangé) :
--   · nature_ag : 'ago' (ordinaire) ou 'age' (extraordinaire) ; toutes les lignes existantes deviennent 'ago' par la valeur par défaut de la
--     colonne (aucun UPDATE : le trigger de la 475 n'est pas sollicité) ; une AGE n'est jamais qu'un PV (dernière AG tenue, officielle) ;
--   · note : facultative (500 caractères au plus) ;
--   · corrige_id : une CORRECTION est une ligne de plus qui désigne celle qu'elle corrige ; la ligne corrigée reste en base, intacte (trace) ;
--   · origine 'fiche_copropriete' admise (la contrainte d'origine est élargie : les valeurs de la 475 restent toutes permises).
-- Rien n'est supprimé ni renommé ; aucune ligne touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1).
-- IDEMPOTENTE. RECETTE SEULEMENT. Suppose 475.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le bloc « AG » reste en lecture seule (comme avant) et toute date lue est une AGO.

ALTER TABLE gestion_copropriete_ag ADD COLUMN IF NOT EXISTS nature_ag text NOT NULL DEFAULT 'ago';
ALTER TABLE gestion_copropriete_ag ADD COLUMN IF NOT EXISTS note text NULL;
ALTER TABLE gestion_copropriete_ag ADD COLUMN IF NOT EXISTS corrige_id bigint NULL REFERENCES gestion_copropriete_ag (id);

ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_nature_chk;
ALTER TABLE gestion_copropriete_ag ADD CONSTRAINT gestion_copropriete_ag_nature_chk CHECK (
  nature_ag IN ('ago', 'age') AND (nature_ag = 'ago' OR (type_ag = 'derniere' AND statut = 'officielle')));
ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_note_chk;
ALTER TABLE gestion_copropriete_ag ADD CONSTRAINT gestion_copropriete_ag_note_chk CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 500));
ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_correction_chk;
ALTER TABLE gestion_copropriete_ag ADD CONSTRAINT gestion_copropriete_ag_correction_chk CHECK (corrige_id IS NULL OR corrige_id <> id);

-- l'origine : la contrainte en ligne de la 475 (nom donné par PostgreSQL) est remplacée par une contrainte nommée qui admet les mêmes valeurs,
-- plus 'fiche_copropriete'
ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_origine_check;
ALTER TABLE gestion_copropriete_ag DROP CONSTRAINT IF EXISTS gestion_copropriete_ag_origine_chk;
ALTER TABLE gestion_copropriete_ag ADD CONSTRAINT gestion_copropriete_ag_origine_chk CHECK (
  origine IN ('reprise', 'sortie', 'fiche_bien', 'creation_bien', 'fiche_copropriete'));

CREATE INDEX IF NOT EXISTS gestion_copropriete_ag_corrige_idx ON gestion_copropriete_ag (corrige_id) WHERE corrige_id IS NOT NULL;

COMMENT ON COLUMN gestion_copropriete_ag.nature_ag IS 'AGO (ordinaire, clôture les comptes) ou AGE (extraordinaire, un PV seulement) ; les lignes d''avant : AGO — migration 481.';
COMMENT ON COLUMN gestion_copropriete_ag.note IS 'Note facultative du PV (fiche copropriété) — migration 481.';
COMMENT ON COLUMN gestion_copropriete_ag.corrige_id IS 'La ligne que celle-ci CORRIGE (« Corriger », avec trace) : la ligne corrigée reste en base, intacte — migration 481.';
