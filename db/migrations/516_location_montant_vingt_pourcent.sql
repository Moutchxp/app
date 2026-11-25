-- 516_location_montant_vingt_pourcent.sql — 🔴 LE MONTANT DES 20 % RETENUS, DÈS LA SORTIE (Arno, 25/11/2026, 22h06).
--
-- LE BESOIN (demande d'Arno du 25/11/2026) : « ajouter le montant des 20 % retenus en le calculant directement depuis les informations saisies en amont si
-- celles-ci ont bien été instruites, sinon laisser la capacité de le rentrer à la main, et faire suivre cette information tout le long du processus. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table, une ligne par montant posé sur une sortie validée (gestion_location_sortie_validee, elle-même en ajout seul,
-- n'a pas de colonne de montant et ne se modifie pas) : le montant (euros), son ORIGINE (« calcule » = 20 % du dépôt de garantie connu, « saisi » = entré
-- à la main), le dépôt qui a servi au calcul, qui et quand. La DERNIÈRE ligne d'une sortie fait foi ; les précédentes restent (traçabilité).
-- Ajout seul (déclencheurs : ni UPDATE, ni DELETE, ni TRUNCATE). Aucune donnée existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE
-- transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le montant est seulement CALCULÉ à la lecture quand le dépôt est connu (rien n'est écrit), et la
-- saisie à la main est refusée avec son motif.

CREATE TABLE IF NOT EXISTS gestion_location_montant_vingt (
  id bigserial PRIMARY KEY,
  sortie_validee_id bigint NOT NULL REFERENCES gestion_location_sortie_validee(id),
  montant numeric(12, 2) NOT NULL CHECK (montant >= 0),
  origine text NOT NULL CHECK (origine IN ('calcule', 'saisi')),
  depot_garantie numeric(12, 2) NULL CHECK (depot_garantie IS NULL OR depot_garantie >= 0),
  saisi_le timestamptz NOT NULL DEFAULT now(),
  saisi_par bigint NULL,
  saisi_par_libelle text NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);

CREATE INDEX IF NOT EXISTS gestion_location_montant_vingt_sortie ON gestion_location_montant_vingt (sortie_validee_id, id DESC);

CREATE OR REPLACE FUNCTION gestion_location_montant_vingt_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 516) — un montant se remplace par une nouvelle ligne, il ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_montant_vingt_ajout_seul ON gestion_location_montant_vingt;
CREATE TRIGGER gestion_location_montant_vingt_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_montant_vingt
  FOR EACH ROW EXECUTE FUNCTION gestion_location_montant_vingt_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_montant_vingt_no_truncate ON gestion_location_montant_vingt;
CREATE TRIGGER gestion_location_montant_vingt_no_truncate BEFORE TRUNCATE ON gestion_location_montant_vingt
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_montant_vingt_ajout_seul();

COMMENT ON TABLE gestion_location_montant_vingt IS
  'Montant des 20 % retenus d''une sortie validée (calculé sur le dépôt de garantie ou saisi), la dernière ligne fait foi ; ajout seul — migration 516.';
