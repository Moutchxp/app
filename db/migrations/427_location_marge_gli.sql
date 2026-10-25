-- 427_location_marge_gli.sql — LOCATION (Arno, 25/10/2026) : LA « MARGE GLI », VERSIONNÉE.
--
-- DÉCISION D'ARNO : « Marge que l'agence perçoit sur les assurances GLI proposées, appliquée au loyer charges comprises. » Un pourcentage
-- (2 décimales, 0 accepté), daté « applicable à partir du », l'historique conservé (comme les taux des apporteurs) : une GLI prend la
-- marge en vigueur à SA date de souscription. Elle alimente la ligne « Nouvelles GLI » du Portefeuille de gestion (Suivi du mois).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la TABLE NEUVE `gestion_location_marge_gli` (une ligne par version ; une seule par date ; jamais
-- modifiée ni effacée). Le journal (`gestion_journal`, entité « config », déjà permise) reçoit chaque version, écrit par l'application.
-- AUCUNE ligne existante n'est lue ni modifiée ; aucune donnée n'est supprimée ; aucune valeur n'est posée (la marge se saisit à l'écran).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucune marge — la ligne « Nouvelles GLI » compte les GLI sans gain, et
-- « Nouvelle marge » est refusée avec ce motif.

CREATE TABLE IF NOT EXISTS gestion_location_marge_gli (
  id                bigserial     PRIMARY KEY,
  depuis            date          NOT NULL UNIQUE,
  marge_pct         numeric(5,2)  NOT NULL CHECK (marge_pct >= 0 AND marge_pct <= 100),
  saisi_le          timestamptz   NOT NULL DEFAULT now(),
  saisi_par         bigint        REFERENCES admin_utilisateur(id),
  saisi_par_libelle text          NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);

-- En ajout seul : ni modification ni effacement (la même garde que les réglages de la Location).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gestion_location_marge_gli_ajout_seul') THEN
    CREATE TRIGGER gestion_location_marge_gli_ajout_seul BEFORE DELETE OR UPDATE ON gestion_location_marge_gli
      FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gestion_location_marge_gli_no_truncate') THEN
    CREATE TRIGGER gestion_location_marge_gli_no_truncate BEFORE TRUNCATE ON gestion_location_marge_gli
      FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();
  END IF;
END $$;

COMMENT ON TABLE gestion_location_marge_gli IS
  'Marge GLI de l''agence (427), en % du loyer charges comprises, versionnée : la version en vigueur à la date de souscription de la GLI fait foi. Ajout seul.';
