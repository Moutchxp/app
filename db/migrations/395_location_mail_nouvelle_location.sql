-- 395_location_mail_nouvelle_location.sql — LOCATION (Arno, 21/10/2026) : LE MAIL « NOUVELLE LOCATION » (ADHOC & MONGA) ET
-- L'ESPACE DE CONFIGURATION (roue crantée de l'accueil Location).
--
-- LE BESOIN (Arno) :
--   · après « Enregistrer » dans « Nouveau locataire » (et depuis la fiche locataire), un bouton « Envoi ADHOC & MONGA » envoie
--     le dossier de la nouvelle location à une liste de destinataires CONFIGURABLE (plus, d'office, la personne qui envoie) ;
--   · chaque envoi est JOURNALISÉ (bail, date, personne qui a envoyé, destinataires, objet, statut, erreur) ;
--   · les BARÈMES d'honoraires (migration 392) se gèrent par VERSIONS DATÉES : un changement crée une nouvelle version, jamais
--     antérieure à la précédente ; une version déjà utilisée par un bail ne se modifie ni ne se supprime ; une version FUTURE
--     encore jamais utilisée peut être corrigée.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajouts) :
--   ① TABLE NEUVE `gestion_location_mail_destinataires` : la liste par défaut, PAR VERSIONS (ajout seul). La plus récente ligne
--     fait foi ; « modifier », « supprimer », « réordonner » une adresse = enregistrer une nouvelle liste. Amorce : les trois
--     adresses d'Arno (service gestion, ADHOC, MONGA).
--   ② TABLE NEUVE `gestion_location_mail_envoi` : le journal des envois (ajout seul, ni UPDATE, ni DELETE, ni TRUNCATE).
--   ③ BARÈMES (392) : le verrou « ajout seul » devient le verrou des VERSIONS :
--       · INSERT : la date d'effet n'est jamais antérieure à celle de la version la plus récente ;
--       · UPDATE : seulement une version FUTURE (date d'effet après aujourd'hui, à Paris) qu'AUCUN bail n'utilise ; sa nouvelle
--         date reste future et jamais antérieure à la version précédente ; l'identifiant, la saisie d'origine ne changent pas ;
--         deux colonnes neuves gardent la trace de la correction (`corrige_le`, `corrige_par_libelle`) ;
--       · DELETE et TRUNCATE : toujours refusés.
--     Aucune valeur de barème existante n'est modifiée ; aucun honoraire enregistré n'est touché (la table des conditions
--     d'entrée, 391-393, reste en ajout seul et garde ses montants).
-- AUCUNE ligne n'est supprimée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.
-- Prérequis : 392 (barèmes) et 393 (gestion_bail).

-- ① LA LISTE DES DESTINATAIRES PAR DÉFAUT ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_location_mail_destinataires (
  id                 bigserial   PRIMARY KEY,
  -- [{ "adresse": "…", "libelle": "…" }, …], dans l'ordre d'envoi.
  liste              jsonb       NOT NULL CHECK (jsonb_typeof(liste) = 'array'),
  saisi_le           timestamptz NOT NULL DEFAULT now(),
  saisi_par          bigint,
  saisi_par_libelle  text        NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);
CREATE OR REPLACE FUNCTION gestion_location_mail_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 395) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_mail_destinataires_ajout_seul ON gestion_location_mail_destinataires;
CREATE TRIGGER gestion_location_mail_destinataires_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_mail_destinataires
  FOR EACH ROW EXECUTE FUNCTION gestion_location_mail_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_mail_destinataires_no_truncate ON gestion_location_mail_destinataires;
CREATE TRIGGER gestion_location_mail_destinataires_no_truncate BEFORE TRUNCATE ON gestion_location_mail_destinataires
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_mail_ajout_seul();

INSERT INTO gestion_location_mail_destinataires (liste, saisi_par_libelle)
SELECT '[{"adresse": "gestion@criterimmo.fr", "libelle": "Service gestion (copie de confirmation)"},
         {"adresse": "gestion.criterimmo@gmail.com", "libelle": "ADHOC"},
         {"adresse": "laura@monga.io", "libelle": "MONGA"}]'::jsonb, 'migration 395'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_mail_destinataires);

-- ② LE JOURNAL DES ENVOIS ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_location_mail_envoi (
  id                 bigserial   PRIMARY KEY,
  bail_id            bigint      NOT NULL REFERENCES gestion_bail(id),
  envoye_le          timestamptz NOT NULL DEFAULT now(),
  -- La PERSONNE qui a envoyé (compte de session), jamais l'adresse d'expédition.
  auteur_id          bigint,
  auteur_libelle     text        NOT NULL CHECK (btrim(auteur_libelle) <> ''),
  auteur_email       text,
  -- [{ "adresse": "…", "libelle": "…" }, …] : la liste RÉELLEMENT utilisée pour cet envoi.
  destinataires      jsonb       NOT NULL CHECK (jsonb_typeof(destinataires) = 'array'),
  expediteur         text        NOT NULL,
  objet              text        NOT NULL,
  statut             text        NOT NULL CHECK (statut IN ('envoye', 'echec')),
  erreur             text,
  message_id         text,
  CONSTRAINT gestion_location_mail_envoi_erreur_chk CHECK (statut = 'envoye' OR btrim(coalesce(erreur, '')) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_mail_envoi_bail_idx ON gestion_location_mail_envoi (bail_id, envoye_le DESC, id DESC);
DROP TRIGGER IF EXISTS gestion_location_mail_envoi_ajout_seul ON gestion_location_mail_envoi;
CREATE TRIGGER gestion_location_mail_envoi_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_mail_envoi
  FOR EACH ROW EXECUTE FUNCTION gestion_location_mail_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_mail_envoi_no_truncate ON gestion_location_mail_envoi;
CREATE TRIGGER gestion_location_mail_envoi_no_truncate BEFORE TRUNCATE ON gestion_location_mail_envoi
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_mail_ajout_seul();

-- ③ LES VERSIONS DES BARÈMES ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_bareme_honoraires_location ADD COLUMN IF NOT EXISTS saisi_par bigint;
ALTER TABLE gestion_bareme_honoraires_location ADD COLUMN IF NOT EXISTS corrige_le timestamptz;
ALTER TABLE gestion_bareme_honoraires_location ADD COLUMN IF NOT EXISTS corrige_par_libelle text;

CREATE OR REPLACE FUNCTION gestion_bareme_honoraires_location_versions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  jour date := (now() AT TIME ZONE 'Europe/Paris')::date;
  precedente date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT max(depuis) INTO precedente FROM gestion_bareme_honoraires_location;
    IF precedente IS NOT NULL AND NEW.depuis < precedente THEN
      RAISE EXCEPTION 'Barème d''honoraires : la date d''effet (%) ne peut pas être antérieure à celle de la version précédente (%) — migration 395', NEW.depuis, precedente
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (SELECT 1 FROM gestion_location_conditions_entree c WHERE c.hono_bareme_id = OLD.id) THEN
      RAISE EXCEPTION 'Barème d''honoraires : cette version est utilisée par au moins un bail — elle ne se modifie pas ; enregistrez une nouvelle version — migration 395'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.depuis <= jour THEN
      RAISE EXCEPTION 'Barème d''honoraires : seule une version FUTURE se corrige ; celle-ci est en vigueur depuis le % — migration 395', OLD.depuis
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.depuis <= jour THEN
      RAISE EXCEPTION 'Barème d''honoraires : une version corrigée reste future (après le %) — migration 395', jour
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT max(depuis) INTO precedente FROM gestion_bareme_honoraires_location WHERE id <> OLD.id AND id < OLD.id;
    IF precedente IS NOT NULL AND NEW.depuis < precedente THEN
      RAISE EXCEPTION 'Barème d''honoraires : la date d''effet (%) ne peut pas être antérieure à celle de la version précédente (%) — migration 395', NEW.depuis, precedente
        USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.id, NEW.saisi_le, NEW.saisi_par_libelle, NEW.saisi_par) IS DISTINCT FROM (OLD.id, OLD.saisi_le, OLD.saisi_par_libelle, OLD.saisi_par)
       OR NEW.corrige_le IS NULL OR btrim(coalesce(NEW.corrige_par_libelle, '')) = '' THEN
      RAISE EXCEPTION 'Barème d''honoraires : une correction garde la saisie d''origine et dit qui l''a faite (corrige_le, corrige_par_libelle) — migration 395'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'gestion_bareme_honoraires_location : % refusé — une version ne s''efface jamais (migrations 392 et 395)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS gestion_bareme_honoraires_location_ajout_seul ON gestion_bareme_honoraires_location;
DROP TRIGGER IF EXISTS gestion_bareme_honoraires_location_versions ON gestion_bareme_honoraires_location;
CREATE TRIGGER gestion_bareme_honoraires_location_versions BEFORE INSERT OR UPDATE OR DELETE ON gestion_bareme_honoraires_location
  FOR EACH ROW EXECUTE FUNCTION gestion_bareme_honoraires_location_versions();
-- Le refus du TRUNCATE (392) reste en place, inchangé (`gestion_bareme_honoraires_location_no_truncate`).

COMMENT ON TABLE gestion_location_mail_destinataires IS 'Destinataires par défaut du mail « Nouvelle location » (ADHOC & MONGA), par versions en ajout seul ; la plus récente fait foi — migration 395.';
COMMENT ON TABLE gestion_location_mail_envoi IS 'Journal des envois du mail « Nouvelle location » : bail, date, personne, destinataires, objet, statut, erreur ; ajout seul — migration 395.';
COMMENT ON TABLE gestion_bareme_honoraires_location IS 'Barèmes DATÉS des honoraires de location à la charge du bailleur (TTC/m²), par VERSIONS : jamais antérieure à la précédente ; une version utilisée ne change plus ; seule une version future inutilisée se corrige ; rien ne s''efface — migrations 392 et 395.';
