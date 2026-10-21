-- 405_gestion_fin_de_gestion_archivage.sql — GESTION (Arno, 21/10/2026) : FIN DE GESTION EN DEUX TEMPS, PUIS ARCHIVAGE AUTOMATIQUE.
--
-- LA RÈGLE (Arno) : un bien sorti vers « Ancienne gestion » entre d'abord dans une période « GESTION TERMINÉE » (visible dans la
-- Gestion, bandeau gris, hors compteurs actifs, dossier Drive à sa place, plus de dossiers annuels) ; à la date de fin + le délai
-- (24 mois par défaut, réglable), s'il y est toujours, il est ARCHIVÉ automatiquement : il disparaît de la Gestion, son dossier
-- part dans « Inactifs », il reste dans la Location. Reprise en gestion ou passage en location seule avant : rien n'est archivé, et
-- le délai ne repart qu'à une nouvelle fin de gestion.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (requiert la 403) :
--   · `gestion_annuaire_lot.statut_archive_le` — l'instant de l'archivage ; vide = pas archivé. Seul un bien en ancienne gestion
--     peut l'être (contrainte). AUCUNE ligne existante n'est modifiée (la colonne naît vide) ;
--   · les déclencheurs de la 403 sont réécrits pour que la marque SUIVE le statut : un statut neuf la vide ; une annexe rattachée
--     suit l'archivage de son bien principal ;
--   · TABLE NEUVE `gestion_location_reglage` — des réglages datés de la Location (ici « archivage_fin_gestion_mois »), EN AJOUT
--     SEUL : la dernière ligne d'une clé fait foi, les précédentes restent l'historique.
-- Rien n'est supprimé. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS statut_archive_le timestamptz;
ALTER TABLE gestion_annuaire_lot DROP CONSTRAINT IF EXISTS gestion_annuaire_lot_archive_chk;
ALTER TABLE gestion_annuaire_lot ADD CONSTRAINT gestion_annuaire_lot_archive_chk
  CHECK (statut_archive_le IS NULL OR statut_bien = 'ancienne_gestion');

CREATE OR REPLACE FUNCTION gestion_statut_bien_auto() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dernier gestion_bien_statut_transition%ROWTYPE;
  vers text := NULL;
  effet date;
BEGIN
  IF NEW.statut_bien = 'en_gestion' AND (NEW.gestion_fin IS NOT NULL OR NEW.sorti_portefeuille_le IS NOT NULL)
     AND (OLD.gestion_fin IS NULL AND OLD.sorti_portefeuille_le IS NULL) THEN
    vers := 'ancienne_gestion';
    effet := coalesce(NEW.gestion_fin, (NEW.sorti_portefeuille_le AT TIME ZONE 'Europe/Paris')::date);
  ELSIF NEW.statut_bien = 'ancienne_gestion' AND NEW.gestion_fin IS NULL AND NEW.sorti_portefeuille_le IS NULL
     AND (OLD.gestion_fin IS NOT NULL OR OLD.sorti_portefeuille_le IS NOT NULL) THEN
    SELECT * INTO dernier FROM gestion_bien_statut_transition WHERE lot_id = NEW.id ORDER BY survenu_le DESC, id DESC LIMIT 1;
    IF FOUND AND dernier.source = 'auto' AND dernier.avant IS NOT NULL THEN
      vers := dernier.avant;
      effet := (now() AT TIME ZONE 'Europe/Paris')::date;
    END IF;
  END IF;
  IF vers IS NOT NULL THEN
    INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, motif, auteur_libelle)
    VALUES (NEW.id, NEW.statut_bien, vers, effet, 'auto',
            CASE WHEN vers = 'ancienne_gestion'
                 THEN CASE WHEN NEW.gestion_fin IS NOT NULL THEN 'fin de gestion' ELSE 'sortie du portefeuille' END
                 ELSE 'réactivation' END,
            coalesce(NULLIF(btrim(NEW.sorti_portefeuille_par), ''), 'automatique'));
    NEW.statut_bien := vers;
    NEW.statut_bien_depuis := effet;
    NEW.statut_archive_le := NULL;   -- 405 : un statut neuf repart sans archivage
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION gestion_statut_bien_annexes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a record;
BEGIN
  -- 405 : une annexe rattachée suit aussi l'ARCHIVAGE de son bien principal (même statut, même marque).
  IF NEW.statut_bien IS NOT DISTINCT FROM OLD.statut_bien AND NEW.statut_archive_le IS DISTINCT FROM OLD.statut_archive_le THEN
    UPDATE gestion_annuaire_lot an SET statut_archive_le = NEW.statut_archive_le
      FROM gestion_lot_annexe ax WHERE ax.parent_id = NEW.id AND an.id = ax.annexe_id AND an.annexe_detachee_le IS NULL
       AND an.statut_bien = NEW.statut_bien AND an.statut_archive_le IS DISTINCT FROM NEW.statut_archive_le;
  END IF;
  IF NEW.statut_bien IS DISTINCT FROM OLD.statut_bien THEN
    FOR a IN SELECT an.id FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
              WHERE ax.parent_id = NEW.id AND an.annexe_detachee_le IS NULL AND an.statut_bien = OLD.statut_bien
              ORDER BY an.id FOR UPDATE OF an LOOP
      INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, via_lot_id, auteur_libelle)
      SELECT a.id, OLD.statut_bien, NEW.statut_bien, NEW.statut_bien_depuis, 'annexe', NEW.id, t.auteur_libelle
        FROM gestion_bien_statut_transition t WHERE t.lot_id = NEW.id ORDER BY t.survenu_le DESC, t.id DESC LIMIT 1;
      UPDATE gestion_annuaire_lot SET statut_bien = NEW.statut_bien, statut_bien_depuis = NEW.statut_bien_depuis, statut_archive_le = NEW.statut_archive_le WHERE id = a.id;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION gestion_statut_bien_aligner_annexe(annexe bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  an record;
  pa record;
BEGIN
  SELECT l.id, l.statut_bien, l.annexe_detachee_le INTO an FROM gestion_annuaire_lot l WHERE l.id = annexe FOR UPDATE;
  SELECT p.id, p.statut_bien, p.statut_bien_depuis, p.statut_archive_le INTO pa FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot p ON p.id = ax.parent_id
   WHERE ax.annexe_id = annexe;
  IF an.id IS NULL OR pa.id IS NULL OR an.annexe_detachee_le IS NOT NULL OR an.statut_bien = pa.statut_bien THEN
    RETURN;
  END IF;
  INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, via_lot_id, motif, auteur_libelle)
  VALUES (an.id, an.statut_bien, pa.statut_bien, (now() AT TIME ZONE 'Europe/Paris')::date, 'annexe', pa.id,
          'rattachée à son bien principal', 'rattachement de l''annexe');
  UPDATE gestion_annuaire_lot SET statut_bien = pa.statut_bien, statut_bien_depuis = (now() AT TIME ZONE 'Europe/Paris')::date,
                                  statut_archive_le = pa.statut_archive_le
   WHERE id = an.id;
END $$;

CREATE TABLE IF NOT EXISTS gestion_location_reglage (
  id              bigserial   PRIMARY KEY,
  cle             text        NOT NULL CHECK (cle IN ('archivage_fin_gestion_mois')),
  valeur_entiere  integer     NOT NULL CHECK (valeur_entiere BETWEEN 1 AND 240),
  pose_le         timestamptz NOT NULL DEFAULT now(),
  pose_par        text        NOT NULL CHECK (btrim(pose_par) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_reglage_cle ON gestion_location_reglage (cle, pose_le DESC, id DESC);
DROP TRIGGER IF EXISTS gestion_location_reglage_ajout_seul ON gestion_location_reglage;
CREATE TRIGGER gestion_location_reglage_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_reglage
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_location_reglage_no_truncate ON gestion_location_reglage;
CREATE TRIGGER gestion_location_reglage_no_truncate BEFORE TRUNCATE ON gestion_location_reglage
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

COMMENT ON COLUMN gestion_annuaire_lot.statut_archive_le IS 'Ancienne gestion ARCHIVÉE (disparue de la Gestion, dossier en Inactifs) : l''instant de l''archivage ; vide = « Gestion terminée » ou autre statut — migration 405.';
COMMENT ON TABLE gestion_location_reglage IS 'Réglages datés de la Location, en ajout seul (la dernière ligne d''une clé fait foi) — migration 405.';
