-- 114_permis_bati_snapshot.sql — Module VEILLE PERMIS (chantier FUS-1b) : PHOTOGRAPHIER le bâti d'origine dans l'empreinte d'un permis.
-- ⚠️ POURQUOI : un des signaux de rattachement d'un permis à sa parcelle future est l'APPARITION (ou la modification) d'un POLYGONE DE
-- BÂTIMENT dans l'empreinte. C'est le SEUL signal disponible quand il n'y a PAS de fusion (construction neuve sur parcelle unique : la
-- surface de parcelle ne bouge pas du tout). Or `batiment` est une couche BD TOPO écrasée à l'import, SANS millésime enregistré (aucune
-- table `batiment_millesime`, `import_log` vide) : sans photo de l'AVANT, « nouveau polygone » est indétectable. On ne fige QUE le bâti
-- des permis suivis — jamais les ~700 000 bâtiments de la couche.
--
-- ⚠️ RECON (mesurée sur notre périmètre, cf. session FUS-1b) : `nombre_d_etages` est rempli à 62 % GLOBAL mais s'effondre à ~0,1 % sur
-- le bâti créé en 2024+ et 0,0 % sur les bâtiments « En construction » ; `altitude_maximale_toit` tombe à 7,8 % sur 2024+. Autrement dit
-- les bâtiments qu'un permis CRÉE n'ont quasiment pas ces attributs → étages/altitude sont capturés OPPORTUNISTES (NULL fréquent), JAMAIS
-- supposés. Le signal porteur est la GÉOMÉTRIE (footprint 2D) + le `cleabs`.
--
-- DEUX tables, miroir du couple FUS-1 (permis_empreinte = résumé 1 ligne / permis_parcelle = détail N lignes) :
--  1) permis_bati_snapshot — DÉTAIL, un permis = N bâtiments : cleabs + footprint 2D figé (SRID 2154, ST_Force2D) + nombre_d_etages +
--     altitude toit + hauteur (nullable, cf. recon) + date_modification BD TOPO (proxy de millésime PAR objet) + date du snapshot ;
--  2) permis_bati_capture — RÉSUMÉ, un permis = une ligne : dit si la photo a été prise et ce qu'on y a vu. Nécessaire pour que
--     « 0 bâtiment = TERRAIN NU » (capture=true, nb_batiments=0) soit une information STOCKÉE, distincte de « empreinte incomplète →
--     bâti NON figé » (capture=false + motif). Un permis sans empreinte complète ne capture rien EN SILENCE : il porte un motif.
-- `source_millesime` = best-effort : la couche bâti n'a PAS de millésime propre → on fige l'état de la couche (max date_modification)
-- au moment du snapshot, y compris quand 0 bâtiment est capturé.
--
-- SÛR : DDL strictement ADDITIVE (CREATE … IF NOT EXISTS / ADD … IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune colonne existante
-- touchée. Idempotente. Un seul BEGIN/COMMIT. Requiert `sitadel_dossier` (047), `permis_empreinte` (113) et `batiment`. Ne modifie NI
-- le moteur de verdict NI le golden. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/114_permis_bati_snapshot.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- 1) DÉTAIL — un bâtiment photographié dans l'empreinte d'un permis (un permis = N lignes).
CREATE TABLE IF NOT EXISTS permis_bati_snapshot (
  id                serial      PRIMARY KEY,
  dossier_id        bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  cleabs            text,                                          -- identité BD TOPO du bâtiment (signal porteur avec la géométrie)
  geom              geometry(MultiPolygon, 2154),                  -- footprint 2D figé (ST_Force2D du geom BD TOPO MultiPolygonZ), Lambert-93
  nombre_d_etages   integer,                                       -- si présent en BD TOPO ; NULL fréquent sur le bâti récent (cf. recon)
  altitude_max_toit double precision,                              -- altitude_maximale_toit si présente ; sert au verdict quand elle existe
  hauteur           double precision,                              -- hauteur BD TOPO si présente
  date_modification timestamptz,                                   -- horodatage BD TOPO du bâtiment = proxy de millésime PAR objet
  snapshot_le       timestamptz NOT NULL DEFAULT now(),
  snapshot_par      text
);
CREATE INDEX IF NOT EXISTS permis_bati_snapshot_gix         ON permis_bati_snapshot USING gist (geom);
CREATE INDEX IF NOT EXISTS permis_bati_snapshot_cleabs_idx  ON permis_bati_snapshot (cleabs);
CREATE INDEX IF NOT EXISTS permis_bati_snapshot_dossier_idx ON permis_bati_snapshot (dossier_id);

-- 2) RÉSUMÉ — la photo a-t-elle été prise, et qu'a-t-on vu ? (un permis = une ligne).
CREATE TABLE IF NOT EXISTS permis_bati_capture (
  dossier_id       bigint      PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  capture          boolean     NOT NULL DEFAULT false, -- true = photo prise (empreinte complète disponible)
  nb_batiments     integer,                            -- NULL si non capturé ; 0 = TERRAIN NU (information valable, pas un vide)
  motif            text,                               -- si non capturé : pourquoi (empreinte incomplète / non figée)
  source_millesime text,                               -- best-effort : état de la couche bâti (max date_modification) au moment du snapshot
  capture_le       timestamptz NOT NULL DEFAULT now(),
  capture_par      text
);

COMMENT ON TABLE permis_bati_snapshot IS 'FUS-1b — PHOTOGRAPHIE du bâti d''origine dans l''empreinte d''un permis (une ligne par bâtiment). Footprint 2D figé (ST_Force2D, SRID 2154) + cleabs = signal porteur pour détecter APPARITION/MODIFICATION d''un polygone (FUS suivants). Étages/altitude opportunistes (NULL fréquent sur le bâti récent). Aucune détection/comparaison ici : on ne fait que photographier.';
COMMENT ON TABLE permis_bati_capture IS 'FUS-1b — RÉSUMÉ de la photo du bâti d''un permis (une ligne). capture=true + nb_batiments=0 = TERRAIN NU (info valable) ; capture=false + motif = empreinte incomplète, rien figé (jamais un vide muet). source_millesime = best-effort (la couche bâti n''a pas de millésime enregistré).';
COMMENT ON COLUMN permis_bati_snapshot.date_modification IS 'FUS-1b — horodatage BD TOPO du bâtiment, seul proxy de millésime disponible (la couche batiment n''a pas de table de millésime).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonnes de permis_bati_snapshot :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_bati_snapshot' ORDER BY ordinal_position;
\echo '>>> colonnes de permis_bati_capture :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_bati_capture' ORDER BY ordinal_position;
\echo '>>> index (GiST géométrie + cleabs + dossier) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'permis_bati_snapshot' ORDER BY indexname;
\echo '>>> SRID de la colonne géométrie (attendu 2154) :'
SELECT Find_SRID('public','permis_bati_snapshot','geom');
