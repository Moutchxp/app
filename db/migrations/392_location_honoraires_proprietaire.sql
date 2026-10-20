-- 392_location_honoraires_proprietaire.sql — TUILE LOCATION (Arno, 20/10/2026) : RETOUCHES DES « CONDITIONS D'ENTRÉE ».
--
-- LE BESOIN (Arno) :
--   · le jour du prélèvement : « au 1er », « au 5 », « au 10 », « au 15 » (la 391 n'acceptait que 5 et 10) ;
--   · « HONORAIRES PROPRIÉTAIRE » calculés : surface Carrez/Boutin du bien × tarif de la zone (visite, dossier, rédaction
--     du bail) et × tarif de l'état des lieux d'entrée. Tarifs officiels TTC/m² (arrêté du 17/07/2025 révisant le décret
--     n° 2014-890, baux signés à partir du 01/01/2026) dans une table de BARÈMES DATÉS, modifiable par un administrateur
--     SANS écraser les anciens ; le calcul prend le barème en vigueur à la date d'entrée ;
--   · la zone : la table des zones existante (383) reçoit le niveau « très tendue » (amorce : Paris, 92, 93, 94, à vérifier) ;
--   · les montants calculés sont enregistrés sur le bail AVEC le barème et la surface utilisés (trace).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) :
--   · `gestion_location_conditions_entree` (391) : la règle du jour devient 1 / 5 / 10 / 15 (ajout de valeurs : toute ligne
--     déjà écrite reste valide) ; colonnes FACULTATIVES de la trace des honoraires propriétaire (vides = pas de calcul :
--     surface manquante ou aucun barème à la date — rien n'est inventé). Montants en euros EXACTS (`numeric`, aucun arrondi) ;
--   · TABLE NEUVE `gestion_bareme_honoraires_location`, en AJOUT SEUL (ni UPDATE, ni DELETE, ni TRUNCATE) : un nouveau barème
--     s'ajoute avec sa date d'effet, les anciens restent. Amorce : le barème du 01/01/2026 ;
--   · `gestion_zone_tendue` (383) : colonne `tres_tendue` (faux par défaut) et sa source ; l'amorce la pose sur les quatre
--     règles départementales déjà amorcées (75, 92, 93, 94), « à vérifier ». Le préavis ne lit pas cette colonne : rien ne
--     change pour lui. Sans la table 383 (base d'avant), cette partie est sautée.
-- AUCUNE ligne n'est supprimée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_location_conditions_entree DROP CONSTRAINT IF EXISTS gestion_location_conditions_entree_prelevement_jour_check;
ALTER TABLE gestion_location_conditions_entree DROP CONSTRAINT IF EXISTS gestion_location_conditions_entree_jour_valeurs_chk;
ALTER TABLE gestion_location_conditions_entree ADD CONSTRAINT gestion_location_conditions_entree_jour_valeurs_chk
  CHECK (prelevement_jour IN (1, 5, 10, 15));

CREATE TABLE IF NOT EXISTS gestion_bareme_honoraires_location (
  id                  bigserial   PRIMARY KEY,
  -- En vigueur pour les baux dont l'entrée est à cette date ou après (jusqu'au barème suivant).
  depuis              date        NOT NULL,
  -- Tarifs TTC par m² de surface habitable (Carrez/Boutin) : visite, dossier, rédaction du bail, selon la zone.
  tres_tendue_m2      numeric     NOT NULL CHECK (tres_tendue_m2 >= 0),
  tendue_m2           numeric     NOT NULL CHECK (tendue_m2 >= 0),
  autre_m2            numeric     NOT NULL CHECK (autre_m2 >= 0),
  -- État des lieux d'entrée, toutes zones.
  etat_des_lieux_m2   numeric     NOT NULL CHECK (etat_des_lieux_m2 >= 0),
  source              text        NOT NULL CHECK (btrim(source) <> ''),
  saisi_le            timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle   text        NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_bareme_honoraires_location_depuis_idx ON gestion_bareme_honoraires_location (depuis DESC, id DESC);

CREATE OR REPLACE FUNCTION gestion_bareme_honoraires_location_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_bareme_honoraires_location : table en ajout seul (migration 392) — un nouveau barème s''ajoute avec sa date d''effet, les anciens restent';
END $$;
DROP TRIGGER IF EXISTS gestion_bareme_honoraires_location_ajout_seul ON gestion_bareme_honoraires_location;
CREATE TRIGGER gestion_bareme_honoraires_location_ajout_seul BEFORE UPDATE OR DELETE ON gestion_bareme_honoraires_location
  FOR EACH ROW EXECUTE FUNCTION gestion_bareme_honoraires_location_refuser();
DROP TRIGGER IF EXISTS gestion_bareme_honoraires_location_no_truncate ON gestion_bareme_honoraires_location;
CREATE TRIGGER gestion_bareme_honoraires_location_no_truncate BEFORE TRUNCATE ON gestion_bareme_honoraires_location
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_bareme_honoraires_location_refuser();

INSERT INTO gestion_bareme_honoraires_location (depuis, tres_tendue_m2, tendue_m2, autre_m2, etat_des_lieux_m2, source, saisi_par_libelle)
SELECT DATE '2026-01-01', 12.10, 10.09, 8.07, 3.03,
       'Arrêté du 17/07/2025 révisant le décret n° 2014-890 — baux signés à partir du 01/01/2026 (TTC/m² de surface habitable)', 'migration 392'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_bareme_honoraires_location WHERE depuis = DATE '2026-01-01');

ALTER TABLE gestion_location_conditions_entree
  ADD COLUMN IF NOT EXISTS hono_surface_m2 numeric CHECK (hono_surface_m2 > 0),
  ADD COLUMN IF NOT EXISTS hono_zone text CHECK (hono_zone IN ('tres_tendue', 'tendue', 'autre')),
  ADD COLUMN IF NOT EXISTS hono_bareme_id bigint REFERENCES gestion_bareme_honoraires_location(id),
  ADD COLUMN IF NOT EXISTS hono_tarif_zone_m2 numeric,
  ADD COLUMN IF NOT EXISTS hono_tarif_edl_m2 numeric,
  ADD COLUMN IF NOT EXISTS hono_visite_bail numeric,
  ADD COLUMN IF NOT EXISTS hono_etat_des_lieux numeric,
  ADD COLUMN IF NOT EXISTS hono_total_proprietaire numeric,
  -- Pourquoi il n'y a pas de calcul (surface manquante, aucun barème à la date) : dit, jamais inventé.
  ADD COLUMN IF NOT EXISTS hono_motif text;

ALTER TABLE IF EXISTS gestion_zone_tendue ADD COLUMN IF NOT EXISTS tres_tendue boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS gestion_zone_tendue ADD COLUMN IF NOT EXISTS tres_tendue_source text;
DO $$
BEGIN
  IF to_regclass('gestion_zone_tendue') IS NOT NULL THEN
    UPDATE gestion_zone_tendue
       SET tres_tendue = true,
           tres_tendue_source = 'Zone très tendue (décret n° 2014-890, honoraires de location) — amorce, à vérifier'
     WHERE portee = 'departement' AND code IN ('75', '92', '93', '94') AND tres_tendue_source IS NULL;
  END IF;
END $$;

COMMENT ON TABLE gestion_bareme_honoraires_location IS 'Barèmes DATÉS des honoraires de location à la charge du bailleur (TTC/m²), ajout seul ; le calcul prend le barème en vigueur à la date d''entrée — migration 392.';
COMMENT ON COLUMN gestion_location_conditions_entree.hono_total_proprietaire IS 'Honoraires propriétaire calculés à l''entrée (visite/dossier/bail + état des lieux), en euros exacts, avec la surface, la zone et le barème utilisés — migration 392.';
