-- 403_gestion_statut_bien.sql — GESTION / LOCATION (Arno, 21/10/2026) : LE STATUT DU BIEN — EN GESTION, ANCIENNE GESTION,
-- LOCATION SEULE.
--
-- LA RÈGLE (Arno) : trois statuts, portés par CHAQUE BIEN (jamais par le propriétaire) :
--   · `en_gestion`       — visible dans la tuile Gestion ; Drive « Base de données locative › Actifs » ;
--   · `ancienne_gestion` — géré puis sorti de gestion : « Anciens biens » de la Gestion ; Drive « … › Inactifs » ;
--   · `location_seule`   — stock permanent de la Location, sans actif/inactif ; invisible dans la Gestion ;
--                          Drive « Base de données location seule ».
-- Transitions permises : location seule → en gestion ; en gestion → ancienne gestion | location seule ; ancienne gestion →
-- en gestion | location seule. Chacune porte une date d'effet, un auteur, un motif facultatif, et reste au journal.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE :
--   · sur `gestion_annuaire_lot`, deux colonnes : `statut_bien` (la SEULE vérité du statut) et `statut_bien_depuis` (date
--     d'effet du statut courant) ;
--   · LA REPRISE des biens existants, sur ces deux colonnes seulement — « Bien en gestion ? = Non » (jamais géré) → location
--     seule ; sinon une fin de gestion ou une sortie du portefeuille → ancienne gestion ; sinon → en gestion. Une annexe
--     RATTACHÉE (non détachée) prend le statut de son bien principal. AUCUNE autre colonne n'est modifiée : `en_gestion`,
--     `gestion_fin`, `sorti_portefeuille_le` restent tels quels ;
--   · TABLE NEUVE `gestion_bien_statut_transition` — le journal des transitions, EN AJOUT SEUL (ni modification, ni
--     suppression, ni vidage) ; la reprise y inscrit une ligne « reprise » par bien ;
--   · des déclencheurs qui tiennent la vérité unique :
--       – à la création d'un bien sans statut, le statut se déduit comme à la reprise (et s'inscrit au journal) ;
--       – un changement de `statut_bien` est REFUSÉ s'il n'a pas sa ligne au journal dans la même transaction ;
--       – une fin de gestion ou une sortie du portefeuille posée par un geste existant (import WIPPIMMO, archivage) fait
--         passer un bien EN GESTION en ancienne gestion ; levée (réactivation), elle le rend à son statut d'avant si ce
--         passage était automatique. Les annexes rattachées suivent leur bien principal.
--
-- RIEN n'est supprimé. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec
-- son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS statut_bien text
    CONSTRAINT gestion_annuaire_lot_statut_bien_chk
    CHECK (statut_bien IS NULL OR statut_bien IN ('en_gestion', 'ancienne_gestion', 'location_seule')),
  ADD COLUMN IF NOT EXISTS statut_bien_depuis date;

CREATE TABLE IF NOT EXISTS gestion_bien_statut_transition (
  id              bigserial   PRIMARY KEY,
  lot_id          bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  avant           text        CHECK (avant IS NULL OR avant IN ('en_gestion', 'ancienne_gestion', 'location_seule')),
  apres           text        NOT NULL CHECK (apres IN ('en_gestion', 'ancienne_gestion', 'location_seule')),
  effet_le        date        NOT NULL,
  -- reprise = migration 403 ; creation = fiche neuve ; geste = bouton de la fiche ; annexe = suit son bien principal ;
  -- auto = fin de gestion / sortie du portefeuille posée ou levée par un geste existant.
  source          text        NOT NULL CHECK (source IN ('reprise', 'creation', 'geste', 'annexe', 'auto')),
  via_lot_id      bigint      REFERENCES gestion_annuaire_lot(id),
  motif           text,
  mandat          text,
  auteur_id       bigint,
  auteur_libelle  text        NOT NULL CHECK (btrim(auteur_libelle) <> ''),
  survenu_le      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_bien_statut_transition_change_chk CHECK (avant IS NULL OR avant <> apres)
);
CREATE INDEX IF NOT EXISTS gestion_bien_statut_transition_lot_idx ON gestion_bien_statut_transition (lot_id, survenu_le DESC, id DESC);

DROP TRIGGER IF EXISTS gestion_bien_statut_transition_ajout_seul ON gestion_bien_statut_transition;
CREATE TRIGGER gestion_bien_statut_transition_ajout_seul BEFORE UPDATE OR DELETE ON gestion_bien_statut_transition
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_bien_statut_transition_no_truncate ON gestion_bien_statut_transition;
CREATE TRIGGER gestion_bien_statut_transition_no_truncate BEFORE TRUNCATE ON gestion_bien_statut_transition
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

-- La règle de reprise, écrite UNE fois (la création d'un bien sans statut l'applique aussi).
CREATE OR REPLACE FUNCTION gestion_statut_bien_deduit(en_gestion boolean, gestion_fin date, sorti timestamptz) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN en_gestion = false THEN 'location_seule'
              WHEN gestion_fin IS NOT NULL OR sorti IS NOT NULL THEN 'ancienne_gestion'
              ELSE 'en_gestion' END
$$;

-- ── LA REPRISE (seulement les biens sans statut : rejouable) ─────────────────────────────────────────────────────────────
-- Les gardes du statut (plus bas) sont posées APRÈS la reprise ; au rejeu, aucune ligne n'est plus sans statut.
WITH propre AS (
  SELECT lo.id, gestion_statut_bien_deduit(lo.en_gestion, lo.gestion_fin, lo.sorti_portefeuille_le) AS statut,
         lo.gestion_debut, lo.gestion_fin, lo.sorti_portefeuille_le, lo.cree_le
    FROM gestion_annuaire_lot lo WHERE lo.statut_bien IS NULL
), final AS (
  SELECT p.id,
         coalesce((SELECT gestion_statut_bien_deduit(pa.en_gestion, pa.gestion_fin, pa.sorti_portefeuille_le)
                     FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
                     JOIN gestion_annuaire_lot pa ON pa.id = ax.parent_id
                    WHERE ax.annexe_id = p.id AND an.annexe_detachee_le IS NULL), p.statut) AS statut,
         p.gestion_debut, p.gestion_fin, p.sorti_portefeuille_le, p.cree_le
    FROM propre p
)
UPDATE gestion_annuaire_lot lo
   SET statut_bien = f.statut,
       statut_bien_depuis = CASE f.statut
         WHEN 'ancienne_gestion' THEN coalesce(f.gestion_fin, (f.sorti_portefeuille_le AT TIME ZONE 'Europe/Paris')::date)
         WHEN 'en_gestion' THEN f.gestion_debut
         ELSE (f.cree_le AT TIME ZONE 'Europe/Paris')::date END
  FROM final f WHERE lo.id = f.id;

INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, auteur_libelle)
SELECT lo.id, NULL, lo.statut_bien, coalesce(lo.statut_bien_depuis, (now() AT TIME ZONE 'Europe/Paris')::date), 'reprise', 'reprise (migration 403)'
  FROM gestion_annuaire_lot lo
 WHERE NOT EXISTS (SELECT 1 FROM gestion_bien_statut_transition t WHERE t.lot_id = lo.id);

ALTER TABLE gestion_annuaire_lot ALTER COLUMN statut_bien SET NOT NULL;

-- ── ① CRÉATION : un bien neuf sans statut le déduit, et son statut entre au journal ─────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_statut_bien_creation_avant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut_bien IS NULL THEN
    NEW.statut_bien := gestion_statut_bien_deduit(NEW.en_gestion, NEW.gestion_fin, NEW.sorti_portefeuille_le);
  END IF;
  IF NEW.statut_bien_depuis IS NULL THEN
    NEW.statut_bien_depuis := (now() AT TIME ZONE 'Europe/Paris')::date;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_creation_avant ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_creation_avant BEFORE INSERT ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_creation_avant();

CREATE OR REPLACE FUNCTION gestion_statut_bien_creation_apres() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, auteur_libelle)
  VALUES (NEW.id, NULL, NEW.statut_bien, NEW.statut_bien_depuis, 'creation', 'création de la fiche');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_creation_apres ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_creation_apres AFTER INSERT ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_creation_apres();

-- ── ② AUTOMATIQUE : une fin de gestion / sortie du portefeuille posée ou levée par un geste existant ──────────────────────
-- Posée sur un bien EN GESTION → ancienne gestion. Levée (plus ni fin ni sortie) sur un bien en ancienne gestion dont le
-- dernier passage était AUTOMATIQUE → le statut d'avant ce passage. Tout autre cas : le statut ne bouge pas.
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
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_auto ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_auto BEFORE UPDATE OF gestion_fin, sorti_portefeuille_le ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_auto();

-- ── ③ LA GARDE : un statut ne change JAMAIS sans sa ligne au journal (même transaction) ───────────────────────────────────
-- Les annexes rattachées suivent : quand le statut d'un bien principal change, ses annexes non détachées qui portaient le
-- même statut prennent le nouveau, chacune avec sa ligne « annexe ».
CREATE OR REPLACE FUNCTION gestion_statut_bien_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut_bien IS DISTINCT FROM OLD.statut_bien THEN
    IF NOT EXISTS (SELECT 1 FROM gestion_bien_statut_transition t
                    WHERE t.lot_id = NEW.id AND t.apres = NEW.statut_bien AND t.avant IS NOT DISTINCT FROM OLD.statut_bien
                      AND t.survenu_le = now()) THEN
      RAISE EXCEPTION 'gestion_annuaire_lot : le statut du bien % ne change que par une transition journalisée (% → %)',
        NEW.id, OLD.statut_bien, NEW.statut_bien;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_garde ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_garde BEFORE UPDATE OF statut_bien ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_garde();

CREATE OR REPLACE FUNCTION gestion_statut_bien_annexes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a record;
BEGIN
  IF NEW.statut_bien IS DISTINCT FROM OLD.statut_bien THEN
    FOR a IN SELECT an.id FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
              WHERE ax.parent_id = NEW.id AND an.annexe_detachee_le IS NULL AND an.statut_bien = OLD.statut_bien
              ORDER BY an.id FOR UPDATE OF an LOOP
      INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, via_lot_id, auteur_libelle)
      SELECT a.id, OLD.statut_bien, NEW.statut_bien, NEW.statut_bien_depuis, 'annexe', NEW.id, t.auteur_libelle
        FROM gestion_bien_statut_transition t WHERE t.lot_id = NEW.id ORDER BY t.survenu_le DESC, t.id DESC LIMIT 1;
      UPDATE gestion_annuaire_lot SET statut_bien = NEW.statut_bien, statut_bien_depuis = NEW.statut_bien_depuis WHERE id = a.id;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_annexes ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_annexes AFTER UPDATE OF statut_bien, gestion_fin, sorti_portefeuille_le ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_annexes();

-- ── ④ UNE ANNEXE QUI (RE)DEVIENT RATTACHÉE prend le statut de son bien principal ─────────────────────────────────────────
-- Réintégrée (la marque de détachement levée) ou attachée pour la première fois (nouvelle ligne `gestion_lot_annexe`).
CREATE OR REPLACE FUNCTION gestion_statut_bien_aligner_annexe(annexe bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  an record;
  pa record;
BEGIN
  SELECT l.id, l.statut_bien, l.annexe_detachee_le INTO an FROM gestion_annuaire_lot l WHERE l.id = annexe FOR UPDATE;
  SELECT p.id, p.statut_bien, p.statut_bien_depuis INTO pa FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot p ON p.id = ax.parent_id
   WHERE ax.annexe_id = annexe;
  IF an.id IS NULL OR pa.id IS NULL OR an.annexe_detachee_le IS NOT NULL OR an.statut_bien = pa.statut_bien THEN
    RETURN;
  END IF;
  INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, via_lot_id, motif, auteur_libelle)
  VALUES (an.id, an.statut_bien, pa.statut_bien, (now() AT TIME ZONE 'Europe/Paris')::date, 'annexe', pa.id,
          'rattachée à son bien principal', 'rattachement de l''annexe');
  UPDATE gestion_annuaire_lot SET statut_bien = pa.statut_bien, statut_bien_depuis = (now() AT TIME ZONE 'Europe/Paris')::date
   WHERE id = an.id;
END $$;

CREATE OR REPLACE FUNCTION gestion_statut_bien_reintegree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.annexe_detachee_le IS NOT NULL AND NEW.annexe_detachee_le IS NULL THEN
    PERFORM gestion_statut_bien_aligner_annexe(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_reintegree ON gestion_annuaire_lot;
CREATE TRIGGER gestion_statut_bien_reintegree AFTER UPDATE OF annexe_detachee_le ON gestion_annuaire_lot
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_reintegree();

CREATE OR REPLACE FUNCTION gestion_statut_bien_attachee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gestion_statut_bien_aligner_annexe(NEW.annexe_id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gestion_statut_bien_attachee ON gestion_lot_annexe;
CREATE TRIGGER gestion_statut_bien_attachee AFTER INSERT ON gestion_lot_annexe
  FOR EACH ROW EXECUTE FUNCTION gestion_statut_bien_attachee();

COMMENT ON COLUMN gestion_annuaire_lot.statut_bien IS 'en_gestion | ancienne_gestion | location_seule — la seule vérité du statut du bien ; ne change que par une transition journalisée (migration 403).';
COMMENT ON COLUMN gestion_annuaire_lot.statut_bien_depuis IS 'Date d''effet du statut courant (migration 403).';
COMMENT ON TABLE gestion_bien_statut_transition IS 'Journal des transitions de statut d''un bien (date d''effet, auteur, motif, source). Jamais modifié ni supprimé (migration 403).';
