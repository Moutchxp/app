-- 120_bdtopo_edition_historisation.sql — chantier BDT-2 : HISTORISER l'édition BD TOPO courante + lui donner un MILLÉSIME, et
-- FIGER un filigrane probant de `batiment` AVANT qu'un réimport (BDT-4) ne le remplace.
--
-- ⚠️ POURQUOI : import_log est VIDE (mesuré BDT-0). L'édition en base n'est identifiable que par PROXY (max(date_modification)
-- = 2026-03-20) et par le .7z sur le disque d'Arno. Ce trou a forcé FUS-3f à écrire source_millesime='inconnu' dans le registre
-- de preuve (permis_altitude_journal). Et BDT-4 remplacera `batiment` : sans figeage préalable, l'édition de mars 2026 DISPARAÎT.
--
-- FAITS ÉTABLIS (prouvés hors de ce fichier, non redémontrés ici) :
--   · L'édition en base EST le paquet D092 du 2026-03-15, prouvé à l'objet près le 07/08/2026
--     (697 886 − 548 disparitions + 25 apparitions = 697 363 de l'édition de juin — contrôle exact).
--   · Source : BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D092_2026-03-15.7z, licence Etalab 2.0, motif d'URL data.geopf.fr.
--   · L'emprise d'une livraison « D092 » DÉBORDE sur les départements limitrophes (d'où le bâti parisien central couvert).
--
-- ═══ POINT 1 — FORME retenue : TABLE DÉDIÉE `bdtopo_edition`, PAS un simple import_log ═══════════════════════════════════════
-- Justification : import_log (001) est un JOURNAL d'événements générique (table_cible/source/emprise TEXT/nb_objets/importe_le).
-- Son `emprise` est du TEXTE libre ; il n'a NI millésime, NI licence, NI département/paquet, NI pointeur « édition courante ». Il
-- répond à « un import a eu lieu », pas à « quelle est l'IDENTITÉ de l'édition qui sert la base aujourd'hui ». FUS-3f a besoin de
-- LIRE en un lookup « le millésime de l'édition courante » → une table dédiée avec un drapeau `courante` (au plus une) est le foyer
-- sémantique propre et contraint. On alimente AUSSI import_log d'une ligne d'événement (le journal générique cesse d'être vide),
-- mais l'AUTORITÉ du millésime vit dans bdtopo_edition.
--
-- ═══ POINT 2 — FIGEAGE : un FILIGRANE (empreinte par objet), pas un double complet ══════════════════════════════════════════
-- On NE copie PAS les 381 Mo de géométrie. On fige, par cleabs : les attributs porteurs (altitudes, hauteur, étages,
-- date_modification), l'aire 2D, et un HASH md5(ST_AsEWKB(geom)) (géométrie complète, Z + SRID inclus). Coût ≈ ~85 Mo + ~30 Mo
-- d'index ≈ ~115 Mo, contre ~381 Mo pour un double. C'est PROBANT parce que la source est REPRODUCTIBLE (Etalab, le .7z est archivé
-- chez Arno et re-téléchargeable) : le hash permet de PROUVER plus tard qu'une géométrie ré-extraite est bien l'exacte, sans la
-- stocker. ⚠️ FRANCHISE : le filigrane suffit TANT QUE le paquet .7z reste archivé (disque d'Arno + archive IGN). Si le .7z ET
-- l'archive IGN disparaissaient ET qu'il fallait reconstruire la géométrie ex nihilo, un hash ne rebâtit rien → seul un double
-- complet suffirait alors. Recommandation : filigrane + sauvegarde du .7z (bien moins cher qu'un double de 381 Mo).
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE/INDEX … IF NOT EXISTS ; INSERT idempotents gardés par WHERE NOT EXISTS). Aucune
-- colonne/table existante modifiée ou supprimée. Ne touche NI le moteur de verdict, NI le golden, NI la vue bdtopo_batiment, NI le
-- registre permis_altitude_journal. `ST_Force2D` conservé pour l'aire (mesure 2D). Idempotente. Un seul BEGIN/COMMIT. Requiert la
-- table `batiment`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/120_bdtopo_edition_historisation.sql
-- ⚠️ COÛT D'APPLICATION : le figeage scanne ~698 k lignes en calculant md5(ST_AsEWKB(geom)) (~380 Mo de géométrie) → compter
-- quelques dizaines de secondes. DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- 1) REGISTRE des éditions BD TOPO — autorité du millésime, avec pointeur « courante » (au plus une).
CREATE TABLE IF NOT EXISTS bdtopo_edition (
  id               serial      PRIMARY KEY,
  millesime        text        NOT NULL,                      -- étiquette STABLE de l'édition (ex. '2026-03-15')
  produit          text,                                      -- 'BD TOPO® 3.5 TOUSTHEMES GPKG LAMB93'
  paquet           text,                                      -- nom du .7z source (identité prouvée)
  departement      text,                                      -- 'D092' (le paquet ; l'emprise déborde sur les limitrophes)
  source_url_motif text,                                      -- 'data.geopf.fr' (motif d'URL prouvé)
  licence          text,                                      -- 'Etalab 2.0'
  date_paquet      date,                                      -- date d'édition du paquet (2026-03-15)
  date_extraction  timestamptz,                               -- max(date_modification) = PROXY d'extraction (fait réel, pas supposé)
  emprise          geometry(Polygon, 2154),                   -- bbox mesurée de batiment (probante ; L93)
  nb_objets        integer,                                   -- volume figé (697886)
  chargee_le       timestamptz,                               -- NULL assumé : chargée HORS dépôt avant historisation (honnête)
  courante         boolean     NOT NULL DEFAULT false,        -- l'édition qui sert `batiment` AUJOURD'HUI
  note             text,
  cree_le          timestamptz NOT NULL DEFAULT now()
);
-- Au plus UNE édition courante (contrainte côté base).
CREATE UNIQUE INDEX IF NOT EXISTS bdtopo_edition_courante_ux   ON bdtopo_edition (courante) WHERE courante;
CREATE INDEX        IF NOT EXISTS bdtopo_edition_millesime_idx ON bdtopo_edition (millesime);

-- Seed IDEMPOTENT de l'édition COURANTE (D092 2026-03-15).
INSERT INTO bdtopo_edition (millesime, produit, paquet, departement, source_url_motif, licence, date_paquet, date_extraction, emprise, nb_objets, chargee_le, courante, note)
SELECT '2026-03-15', 'BD TOPO® 3.5 TOUSTHEMES GPKG LAMB93', 'BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D092_2026-03-15.7z', 'D092', 'data.geopf.fr', 'Etalab 2.0',
       DATE '2026-03-15', TIMESTAMPTZ '2026-03-20 10:34:41.59+01',
       ST_MakeEnvelope(632239.4, 6842903.6, 656477.2, 6877610.5, 2154), 697886, NULL, true,
       'Édition prouvée à l''objet près le 07/08/2026 : 697886 − 548 disparitions + 25 apparitions = 697363 de l''édition de juin (contrôle exact). Emprise D092 débordant sur les départements limitrophes. chargee_le NULL : chargement hors dépôt, avant historisation.'
WHERE NOT EXISTS (SELECT 1 FROM bdtopo_edition WHERE millesime = '2026-03-15');

-- Ligne d'ÉVÉNEMENT dans le journal générique (import_log cesse d'être vide) — l'autorité reste bdtopo_edition.
INSERT INTO import_log (table_cible, source, emprise, nb_objets)
SELECT 'batiment', 'BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D092_2026-03-15.7z (Etalab 2.0, data.geopf.fr)',
       'BOX(632239.4 6842903.6, 656477.2 6877610.5) L93 — emprise D092 débordante', 697886
WHERE NOT EXISTS (SELECT 1 FROM import_log WHERE table_cible = 'batiment');

-- 2) FILIGRANE probant de `batiment` pour l'édition courante (attributs porteurs + hash géométrique ; PAS la géométrie).
CREATE TABLE IF NOT EXISTS batiment_edition_fige (
  edition_id             integer     NOT NULL REFERENCES bdtopo_edition(id) ON DELETE CASCADE,
  cleabs                 text,
  altitude_maximale_toit double precision,
  altitude_minimale_sol  double precision,
  hauteur                double precision,
  nombre_d_etages        integer,
  date_modification      timestamptz,
  aire_m2                double precision,                     -- ST_Area(ST_Force2D(geom)) : empreinte au sol 2D
  geom_ewkb_md5          text                                  -- md5(ST_AsEWKB(geom)) : empreinte géométrique COMPLÈTE (Z + SRID), reproductible depuis le .7z
);
CREATE INDEX IF NOT EXISTS batiment_edition_fige_cleabs_idx  ON batiment_edition_fige (cleabs);
CREATE INDEX IF NOT EXISTS batiment_edition_fige_edition_idx ON batiment_edition_fige (edition_id);

-- Figeage IDEMPOTENT (ne réinsère pas si déjà figé pour cette édition).
INSERT INTO batiment_edition_fige (edition_id, cleabs, altitude_maximale_toit, altitude_minimale_sol, hauteur, nombre_d_etages, date_modification, aire_m2, geom_ewkb_md5)
SELECT e.id, b.cleabs, b.altitude_maximale_toit, b.altitude_minimale_sol, b.hauteur, b.nombre_d_etages, b.date_modification,
       ST_Area(ST_Force2D(b.geom)), md5(ST_AsEWKB(b.geom))
FROM batiment b
CROSS JOIN (SELECT id FROM bdtopo_edition WHERE millesime = '2026-03-15') e
WHERE NOT EXISTS (SELECT 1 FROM batiment_edition_fige f WHERE f.edition_id = e.id);

COMMENT ON TABLE bdtopo_edition IS 'BDT-2 — REGISTRE des éditions BD TOPO chargées. Autorité du millésime (drapeau `courante` = édition servant `batiment` aujourd''hui, au plus une via l''index partiel bdtopo_edition_courante_ux). Lu par FUS-3f pour stamper source_millesime des ÉCRITURES FUTURES du registre permis_altitude_journal. Distinct d''import_log (journal d''événements générique, sans identité d''édition).';
COMMENT ON COLUMN bdtopo_edition.date_extraction IS 'BDT-2 — max(date_modification) mesuré sur batiment = PROXY d''extraction (fait réel). N''est PAS une date d''édition supposée (celle-ci = date_paquet).';
COMMENT ON TABLE batiment_edition_fige IS 'BDT-2 — FILIGRANE probant de `batiment` pour une édition (attributs porteurs + aire 2D + hash md5(ST_AsEWKB) de la géométrie complète). PAS la géométrie (~115 Mo vs ~381 Mo). Probant car la source .7z est reproductible (Etalab) : le hash prouve une ré-extraction sans stocker les octets. Survit au remplacement de `batiment` par BDT-4.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE) :
\echo '>>> édition courante enregistrée :'
SELECT id, millesime, departement, licence, date_paquet, nb_objets, courante FROM bdtopo_edition WHERE courante;
\echo '>>> une seule courante (contrainte) :'
SELECT count(*) AS nb_courantes FROM bdtopo_edition WHERE courante;
\echo '>>> import_log alimenté :'
SELECT table_cible, nb_objets FROM import_log WHERE table_cible = 'batiment';
\echo '>>> filigrane : nb de lignes figées (attendu 697886) + taille de la table :'
SELECT count(*) AS nb_figes FROM batiment_edition_fige;
SELECT pg_size_pretty(pg_total_relation_size('batiment_edition_fige')) AS taille_filigrane;
\echo '>>> contrôle probant : le hash d''un cleabs est stable et non nul :'
SELECT cleabs, geom_ewkb_md5 FROM batiment_edition_fige WHERE geom_ewkb_md5 IS NOT NULL LIMIT 3;
