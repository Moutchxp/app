-- 393_location_bail_rattachements.sql — LOCATION / GESTION (Arno, 20/10/2026) : LES RATTACHEMENTS CONTRÔLÉS PAR LA BASE.
--
-- LE BESOIN (Arno, après l'audit des rattachements) : « chaque information est rattachée de façon durable et contrôlée par
-- la base au bon élément : propriétaire → bien → bail → locataire(s), avec garants et contacts rattachés à la bonne personne
-- et au bon bail. » Décisions d'Arno, appliquées ici :
--   ① LE BAIL DEVIENT UNE FICHE : table `gestion_bail` (bien, entrée, sortie, création, modification) ; chaque occupation
--     reçoit `bail_id`. Reprise : les occupations existantes sont regroupées selon la règle actuelle (même bien + même date
--     d'entrée ; une annexe occupée par le même locataire à la même date suit son logement). Un déclencheur rattache toute
--     NOUVELLE occupation (écran, « Ajouter un occupant », import WIPPIMMO) et tient à jour les dates du bail.
--   ② Le loyer de départ (370) et les conditions d'entrée (391) sont rattachés au BAIL (`bail_id`, FK) ; les anciennes
--     colonnes (`occupation_id`, `occupation_ids`) restent en place, ne sont plus écrites, et sont marquées OBSOLÈTES.
--   ③ Garants : table `gestion_bail_garant` (bail + carte + locataire garanti, FK partout ; le locataire doit être un
--     occupant du bail — vérifié EN BASE). Contacts : `gestion_contact_carte.locataire_id` est permis côté « locataire »
--     (la contrainte de la 318 ne l'autorisait que pour un ancien locataire) ; `lot_id` (FK) rejoint `lot_cle` (obsolète).
--   ④ Protection : `occupation.locataire_id` passe de ON DELETE CASCADE à RESTRICT ; VERROU EN BASE ni DELETE ni TRUNCATE,
--     sans exception (pas même sur une base jetable — décision d'Arno), sur les treize tables de l'annuaire et du bail.
--   ⑤ Conditions d'entrée : la date qui a servi à choisir le barème des honoraires (et si elle était supposée).
-- AUCUNE ligne n'est supprimée. Les reprises remplissent des colonnes neuves ; les déclencheurs « ajout seul » des deux
-- tables de conditions sont suspendus le temps de cette reprise seulement, dans cette transaction.
--
-- TRANSACTIONNELLE ET REJOUABLE : la mise à jour l'enveloppe dans UNE transaction ; chaque instruction est idempotente.

-- ① LE BAIL ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_bail (
  id          bigserial   PRIMARY KEY,
  -- Le bien loué : le logement (ou la fiche autonome) ; ses annexes suivent dans le même bail.
  lot_id      bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  entree      date,
  -- Renseignée quand TOUS les occupants du bail sont sortis (tenue par déclencheur).
  sortie      date,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  modifie_le  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gestion_bail_lot_idx ON gestion_bail (lot_id, entree);

ALTER TABLE gestion_annuaire_occupation ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail(id);
CREATE INDEX IF NOT EXISTS gestion_annuaire_occupation_bail_idx ON gestion_annuaire_occupation (bail_id);

-- Le bien d'une occupation : son lot, sauf une annexe (ou un lot d'une fiche autonome) occupée par le même locataire à la
-- même date d'entrée que son logement (ou que la tête de la fiche) — elle suit alors le bail du logement.
CREATE OR REPLACE FUNCTION gestion_bail_bien_de(p_lot bigint, p_locataire bigint, p_entree date) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE tete bigint;
BEGIN
  SELECT a.parent_id INTO tete FROM gestion_lot_annexe a
   WHERE a.annexe_id = p_lot
     AND EXISTS (SELECT 1 FROM gestion_annuaire_occupation p WHERE p.lot_id = a.parent_id AND p.locataire_id = p_locataire
                   AND p.entree IS NOT DISTINCT FROM p_entree)
   LIMIT 1;
  IF tete IS NULL AND to_regclass('gestion_bien_regroupement') IS NOT NULL THEN
    EXECUTE 'SELECT g.tete_id FROM gestion_bien_regroupement g
              WHERE g.clos_le IS NULL AND $1 = ANY(g.lot_ids) AND g.tete_id <> $1
                AND EXISTS (SELECT 1 FROM gestion_annuaire_occupation p WHERE p.lot_id = g.tete_id AND p.locataire_id = $2
                              AND p.entree IS NOT DISTINCT FROM $3)
              LIMIT 1' INTO tete USING p_lot, p_locataire, p_entree;
  END IF;
  RETURN coalesce(tete, p_lot);
END $$;

-- Reprise : un bail par (bien, date d'entrée), puis chaque occupation sans bail reçoit le sien. Sans table temporaire : le
-- fichier marche aussi bien enveloppé dans une transaction que lancé tel quel (`psql -f`).
INSERT INTO gestion_bail (lot_id, entree, sortie)
SELECT r.bien, r.entree, CASE WHEN bool_and(r.sortie IS NOT NULL) THEN max(r.sortie) END
  FROM (SELECT gestion_bail_bien_de(o.lot_id, o.locataire_id, o.entree) AS bien, o.entree, o.sortie
          FROM gestion_annuaire_occupation o
         WHERE o.lot_id IS NOT NULL AND o.bail_id IS NULL) r
 WHERE NOT EXISTS (SELECT 1 FROM gestion_bail b WHERE b.lot_id = r.bien AND b.entree IS NOT DISTINCT FROM r.entree)
 GROUP BY r.bien, r.entree;
UPDATE gestion_annuaire_occupation o
   SET bail_id = (SELECT b.id FROM gestion_bail b
                   WHERE b.lot_id = gestion_bail_bien_de(o.lot_id, o.locataire_id, o.entree) AND b.entree IS NOT DISTINCT FROM o.entree
                   ORDER BY b.id LIMIT 1)
 WHERE o.lot_id IS NOT NULL AND o.bail_id IS NULL;

-- Toute NOUVELLE occupation est rattachée à un bail (écran, « Ajouter un occupant », import) : celui que l'appelant désigne,
-- sinon le bail EN COURS du même bien à la même date d'entrée, sinon un bail neuf.
CREATE OR REPLACE FUNCTION gestion_occupation_bail_auto() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bien bigint; b bigint;
BEGIN
  IF NEW.bail_id IS NULL AND NEW.lot_id IS NOT NULL THEN
    bien := gestion_bail_bien_de(NEW.lot_id, NEW.locataire_id, NEW.entree);
    SELECT id INTO b FROM gestion_bail WHERE lot_id = bien AND entree IS NOT DISTINCT FROM NEW.entree AND sortie IS NULL ORDER BY id DESC LIMIT 1;
    IF b IS NULL THEN
      INSERT INTO gestion_bail (lot_id, entree) VALUES (bien, NEW.entree) RETURNING id INTO b;
    END IF;
    NEW.bail_id := b;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_occupation_bail_auto_trg ON gestion_annuaire_occupation;
CREATE TRIGGER gestion_occupation_bail_auto_trg BEFORE INSERT ON gestion_annuaire_occupation
  FOR EACH ROW EXECUTE FUNCTION gestion_occupation_bail_auto();

-- Les dates du bail suivent ses occupations : entrée = la plus ancienne ; sortie = la plus tardive quand TOUS sont sortis.
CREATE OR REPLACE FUNCTION gestion_bail_dates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE gestion_bail b
     SET entree = s.entree, sortie = s.sortie, modifie_le = now()
    FROM (SELECT o.bail_id, min(o.entree) AS entree, CASE WHEN bool_and(o.sortie IS NOT NULL) THEN max(o.sortie) END AS sortie
            FROM gestion_annuaire_occupation o
           WHERE o.bail_id IN (NEW.bail_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.bail_id END)
           GROUP BY o.bail_id) s
   WHERE b.id = s.bail_id AND (b.entree IS DISTINCT FROM s.entree OR b.sortie IS DISTINCT FROM s.sortie);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gestion_bail_dates_trg ON gestion_annuaire_occupation;
CREATE TRIGGER gestion_bail_dates_trg AFTER INSERT OR UPDATE OF entree, sortie, bail_id ON gestion_annuaire_occupation
  FOR EACH ROW EXECUTE FUNCTION gestion_bail_dates();

-- ② LOYER DE DÉPART (370) ET CONDITIONS D'ENTRÉE (391) RATTACHÉS AU BAIL ─────────────────────────────────────────────────
ALTER TABLE gestion_location_conditions ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail(id);
CREATE INDEX IF NOT EXISTS gestion_location_conditions_bail_idx ON gestion_location_conditions (bail_id, id DESC);
ALTER TABLE gestion_location_conditions ALTER COLUMN occupation_id DROP NOT NULL;
ALTER TABLE gestion_location_conditions DISABLE TRIGGER gestion_location_conditions_ajout_seul;
UPDATE gestion_location_conditions c SET bail_id = o.bail_id
  FROM gestion_annuaire_occupation o WHERE o.id = c.occupation_id AND c.bail_id IS NULL AND o.bail_id IS NOT NULL;
ALTER TABLE gestion_location_conditions ENABLE TRIGGER gestion_location_conditions_ajout_seul;
ALTER TABLE gestion_location_conditions DROP CONSTRAINT IF EXISTS gestion_location_conditions_rattachee_chk;
ALTER TABLE gestion_location_conditions ADD CONSTRAINT gestion_location_conditions_rattachee_chk CHECK (bail_id IS NOT NULL OR occupation_id IS NOT NULL);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion_location_conditions WHERE bail_id IS NULL) THEN
    ALTER TABLE gestion_location_conditions ALTER COLUMN bail_id SET NOT NULL;
  ELSE
    RAISE NOTICE '393 : % loyer(s) de départ sans bail (occupation sans bien) — bail_id reste facultatif',
      (SELECT count(*) FROM gestion_location_conditions WHERE bail_id IS NULL);
  END IF;
END $$;
COMMENT ON COLUMN gestion_location_conditions.occupation_id IS 'OBSOLÈTE (migration 393) : le loyer de départ est porté par le BAIL (bail_id). Gardée en place, plus écrite ; suppression plus tard, avec l''accord d''Arno.';

ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail(id);
CREATE INDEX IF NOT EXISTS gestion_location_conditions_entree_bail_fk_idx ON gestion_location_conditions_entree (bail_id, id DESC);
ALTER TABLE gestion_location_conditions_entree ALTER COLUMN occupation_ids DROP NOT NULL;
ALTER TABLE gestion_location_conditions_entree DROP CONSTRAINT IF EXISTS gestion_location_conditions_entree_occupation_ids_check;
ALTER TABLE gestion_location_conditions_entree DISABLE TRIGGER gestion_location_conditions_entree_ajout_seul;
UPDATE gestion_location_conditions_entree c SET bail_id = o.bail_id
  FROM gestion_annuaire_occupation o WHERE o.id = c.occupation_ids[1] AND c.bail_id IS NULL AND o.bail_id IS NOT NULL;
ALTER TABLE gestion_location_conditions_entree ENABLE TRIGGER gestion_location_conditions_entree_ajout_seul;
ALTER TABLE gestion_location_conditions_entree DROP CONSTRAINT IF EXISTS gestion_location_conditions_entree_rattachee_chk;
ALTER TABLE gestion_location_conditions_entree ADD CONSTRAINT gestion_location_conditions_entree_rattachee_chk
  CHECK (bail_id IS NOT NULL OR cardinality(occupation_ids) > 0);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion_location_conditions_entree WHERE bail_id IS NULL) THEN
    ALTER TABLE gestion_location_conditions_entree ALTER COLUMN bail_id SET NOT NULL;
  END IF;
END $$;
COMMENT ON COLUMN gestion_location_conditions_entree.occupation_ids IS 'OBSOLÈTE (migration 393) : les conditions d''entrée sont portées par le BAIL (bail_id). Gardée en place, plus écrite ; suppression plus tard, avec l''accord d''Arno.';
-- ⑤ La date qui a servi à choisir le barème des honoraires, et si elle était SUPPOSÉE (date d'entrée vide : le jour).
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_date_bareme date;
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_date_supposee boolean;

-- ③ GARANTS ET CONTACTS ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_bail_garant (
  id                  bigserial   PRIMARY KEY,
  bail_id             bigint      NOT NULL REFERENCES gestion_bail(id),
  carte_id            bigint      NOT NULL REFERENCES gestion_contact_carte(id),
  -- Le locataire GARANTI (un des occupants du bail — vérifié par déclencheur).
  locataire_id        bigint      NOT NULL REFERENCES gestion_annuaire_locataire(id),
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle    text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CONSTRAINT gestion_bail_garant_retrait_chk CHECK ((retire_le IS NULL) = (retire_par_libelle IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_bail_garant_unique ON gestion_bail_garant (bail_id, carte_id, locataire_id) WHERE retire_le IS NULL;
CREATE OR REPLACE FUNCTION gestion_bail_garant_controle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.bail_id = NEW.bail_id AND o.locataire_id = NEW.locataire_id) THEN
    RAISE EXCEPTION 'Un garant garantit un locataire DU bail : le locataire % n''est pas un occupant du bail %.', NEW.locataire_id, NEW.bail_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_bail_garant_controle_trg ON gestion_bail_garant;
CREATE TRIGGER gestion_bail_garant_controle_trg BEFORE INSERT OR UPDATE OF bail_id, locataire_id ON gestion_bail_garant
  FOR EACH ROW EXECUTE FUNCTION gestion_bail_garant_controle();

-- Un contact du locataire se rattache à SON locataire (la 318 ne le permettait que pour un ancien locataire).
ALTER TABLE gestion_contact_carte DROP CONSTRAINT IF EXISTS gestion_contact_carte_ancien_chk;
ALTER TABLE gestion_contact_carte DROP CONSTRAINT IF EXISTS gestion_contact_carte_locataire_chk;
ALTER TABLE gestion_contact_carte ADD CONSTRAINT gestion_contact_carte_locataire_chk
  CHECK ((cote <> 'ancien_locataire' OR locataire_id IS NOT NULL) AND (locataire_id IS NULL OR cote IN ('locataire', 'ancien_locataire')));
-- Le bien par une vraie clé (lot_cle, texte, reste en place — obsolète) ; tenu à jour pour toute carte posée ensuite.
ALTER TABLE gestion_contact_carte ADD COLUMN IF NOT EXISTS lot_id bigint REFERENCES gestion_annuaire_lot(id);
UPDATE gestion_contact_carte c SET lot_id = l.id FROM gestion_annuaire_lot l WHERE l.wippimmo_id = c.lot_cle AND c.lot_id IS NULL;
CREATE OR REPLACE FUNCTION gestion_contact_carte_lot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lot_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.lot_cle IS DISTINCT FROM OLD.lot_cle) THEN
    NEW.lot_id := (SELECT id FROM gestion_annuaire_lot WHERE wippimmo_id = NEW.lot_cle);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_contact_carte_lot_trg ON gestion_contact_carte;
CREATE TRIGGER gestion_contact_carte_lot_trg BEFORE INSERT OR UPDATE OF lot_cle, lot_id ON gestion_contact_carte
  FOR EACH ROW EXECUTE FUNCTION gestion_contact_carte_lot();
COMMENT ON COLUMN gestion_contact_carte.lot_cle IS 'OBSOLÈTE (migration 393) : le bien est lot_id (FK). Gardée en place (encore lue par les écrans) ; suppression plus tard, avec l''accord d''Arno.';

-- ④ PROTECTION ─────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_annuaire_occupation DROP CONSTRAINT IF EXISTS gestion_annuaire_occupation_locataire_id_fkey;
ALTER TABLE gestion_annuaire_occupation ADD CONSTRAINT gestion_annuaire_occupation_locataire_id_fkey
  FOREIGN KEY (locataire_id) REFERENCES gestion_annuaire_locataire(id) ON DELETE RESTRICT;

-- Le verrou DELETE est posé PAR INSTRUCTION (et non par ligne) : il refuse même un DELETE qui ne viserait aucune ligne — une
-- table encore vide (garants) est protégée comme les autres.
CREATE OR REPLACE FUNCTION gestion_rattachements_refuser_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Rattachements protégés : % interdit sur % (règle d''Arno, migration 393). Une fiche se sort, s''archive ou se clôt ; elle ne s''efface jamais.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestion_annuaire_proprietaire', 'gestion_annuaire_lot', 'gestion_annuaire_lot_proprietaire', 'gestion_bail',
    'gestion_annuaire_occupation', 'gestion_annuaire_locataire', 'gestion_annuaire_contact', 'gestion_contact_carte', 'gestion_bail_garant',
    'gestion_location_conditions_entree', 'gestion_location_conditions', 'gestion_lot_entretien', 'gestion_lot_annexe'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_verrou_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression()', t || '_verrou_delete', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_verrou_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression()', t || '_verrou_truncate', t);
  END LOOP;
END $$;

COMMENT ON TABLE gestion_bail IS 'Le BAIL (migration 393) : un bien, une date d''entrée, une sortie quand tous ses occupants sont sortis. Ses occupations (bail_id), son loyer de départ, ses conditions d''entrée et ses garants s''y rattachent.';
COMMENT ON TABLE gestion_bail_garant IS 'Un garant (carte « contact du locataire ») rattaché au BAIL et au locataire qu''il garantit (migration 393). Retrait = marquage, jamais suppression.';
