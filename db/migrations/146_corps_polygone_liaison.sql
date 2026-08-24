-- 146_corps_polygone_liaison.sql — Module VEILLE PERMIS (chantier M1) : TABLE DE LIAISON bâtiment déclaré ↔ polygone BD TOPO.
--
-- POURQUOI CETTE TABLE (et plus la colonne scalaire de la 117) :
--  · Un bâtiment déclaré au permis peut être dessiné par l'IGN en PLUSIEURS polygones (emprises `cleabs`). La 117 a modélisé le
--    lien par une COLONNE scalaire `permis_corps_batiment.cleabs_affecte`, en assumant explicitement un lien 1:1 (« pas une relation
--    portant ses propres attributs → une colonne, pas une table de liaison »). Cette prémisse tombe dès qu'on passe en 1:N.
--  · On installe donc la STRUCTURE 1:N. La table de liaison porte UNE LIGNE PAR COUPLE (bâtiment, polygone).
--  · ⚠️ Pas de colonne tableau `text[]` : PostgreSQL ne sait pas garantir l'unicité d'un élément d'array ENTRE lignes sans
--    contrainte d'exclusion ni trigger — l'array déplacerait la garantie du schéma vers du code fragile. La table de liaison, elle,
--    ré-exprime l'exclusivité par un simple UNIQUE.
--
-- CE QUE GARANTIT LA STRUCTURE (repris de la recon M1) :
--  · (a) EXCLUSIVITÉ — « un polygone n'appartient qu'à UN SEUL bâtiment du même dossier » : garantie EN BASE par
--    UNIQUE (dossier_id, cleabs). C'est EXACTEMENT l'ancien index partiel de la 117, simplement déplacé — il DEVAIT survivre.
--  · (b) « un bâtiment ne pointe que vers un seul polygone » : cette limitation N'EST PLUS imposée (plusieurs lignes par corps_id).
--    Elle ne venait que de la forme scalaire de l'ancienne colonne, jamais de l'index — la lever n'affaiblit donc pas (a).
--
-- PAS DE FK SUR `cleabs` : le cleabs de la table `batiment` n'est PAS unique (sa PK est `fid`) — la validité du cleabs (présent dans
-- l'empreinte) est vérifiée côté application, comme dans la 117. FK sur corps_id et dossier_id (ON DELETE CASCADE), alignées sur
-- permis_corps_batiment. La liaison NE PORTE PAS l'altitude : la cote vit dans permis_polygone_altitude (clé cleabs, préséance +
-- journal append-only). Ici on n'enregistre QUE l'appartenance.
--
-- ⚠️ `permis_corps_batiment.cleabs_affecte` N'EST PAS SUPPRIMÉE : elle reste en place, DÉPRÉCIÉE (n'est plus ni lue ni écrite par le
-- code à partir de M1), jusqu'à un lot ultérieur qui la retirera. Cette migration ne la touche pas.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / INDEX, IF NOT EXISTS ; la copie est ON CONFLICT DO NOTHING). Aucun DROP, aucun ALTER
-- destructif, aucune réécriture de lignes existantes. Ne touche NI le moteur de verdict SVAV NI le golden. Idempotente. Un seul
-- BEGIN/COMMIT. Requiert permis_corps_batiment (117) et sitadel_dossier (047). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/146_corps_polygone_liaison.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ».

BEGIN;

-- LIAISON — une ligne par couple (bâtiment déclaré, polygone BD TOPO). Autorité de l'affectation à partir de M1.
CREATE TABLE IF NOT EXISTS permis_corps_polygone (
  id         bigserial   PRIMARY KEY,
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id)        ON DELETE CASCADE,
  corps_id   bigint      NOT NULL REFERENCES permis_corps_batiment(id)  ON DELETE CASCADE,  -- le bâtiment déclaré
  cleabs     text        NOT NULL,                                                          -- le polygone IGN affecté (pas de FK : cleabs non unique)
  maj_le     timestamptz NOT NULL DEFAULT now(),
  maj_par    text
);

-- (a) EXCLUSIVITÉ PAR PERMIS, EN BASE : un même polygone → au plus un bâtiment du même dossier. (Reprend l'ancien index partiel 117.)
CREATE UNIQUE INDEX IF NOT EXISTS permis_corps_polygone_dossier_cleabs_ux
  ON permis_corps_polygone (dossier_id, cleabs);

-- Accès par bâtiment (agrégation des polygones d'un corps à la lecture) et par dossier.
CREATE INDEX IF NOT EXISTS permis_corps_polygone_corps_idx   ON permis_corps_polygone (corps_id);
CREATE INDEX IF NOT EXISTS permis_corps_polygone_dossier_idx ON permis_corps_polygone (dossier_id);

COMMENT ON TABLE permis_corps_polygone IS
  'M1 — liaison N:1 polygone BD TOPO → bâtiment déclaré au permis (une ligne par couple). Autorité de l''affectation (remplace la colonne dépréciée permis_corps_batiment.cleabs_affecte). Exclusivité (a) garantie par l''index unique (dossier_id, cleabs). Ne porte PAS l''altitude (celle-ci vit dans permis_polygone_altitude).';

-- COPIE des affectations existantes (0 ligne attendue ; correcte si le volume change un jour). Idempotente.
INSERT INTO permis_corps_polygone (dossier_id, corps_id, cleabs, maj_le, maj_par)
SELECT dossier_id, id, cleabs_affecte, COALESCE(maj_le, now()), maj_par
  FROM permis_corps_batiment
 WHERE cleabs_affecte IS NOT NULL
ON CONFLICT (dossier_id, cleabs) DO NOTHING;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonnes de permis_corps_polygone :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'permis_corps_polygone' ORDER BY ordinal_position;
\echo '>>> index & contrainte d''exclusivité (a) :'
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'permis_corps_polygone' ORDER BY indexname;
\echo '>>> lignes copiées depuis cleabs_affecte (0 attendu) :'
SELECT count(*) AS copiees FROM permis_corps_polygone;
