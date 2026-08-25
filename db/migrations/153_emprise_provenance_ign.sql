-- 153_emprise_provenance_ign.sql — Module VEILLE PERMIS (chantier PROJ-3q) : ADOPTION des polygones « en projet » de l'IGN
-- comme emprise d'un bâtiment, SANS tracé manuel.
--
-- POURQUOI : quand l'IGN a déjà numérisé le futur bâti (statut « En projet »), le redessiner à la main le DÉGRADE (tracé manuel
-- mesuré à ~0,8 m près). On ajoute une 3e issue à l'écran de projection : ADOPTER les polygones cochés. Les polygones qui SE
-- TOUCHENT fusionnent en UNE emprise ; chaque GROUPE disjoint reste une emprise INDÉPENDANTE (une LIGNE par groupe — le schéma le
-- permet déjà : aucune contrainte d'unicité sur (dossier_id, corps_id)).
--
-- CE QUE FAIT CETTE MIGRATION (DDL ADDITIVE / idempotente, aucune écriture de données) :
--   (1) ÉLARGIT `geom` de Polygon → Geometry (2154) : l'union d'un groupe à contact par SOMMET est un MultiPolygon (deux faces
--       partageant un point). Un CHECK garde la géométrie POLYGONALE (POLYGON | MULTIPOLYGON) — jamais un point / une ligne.
--       Les lignes existantes (tracés manuels, Polygon) restent valides ; l'INSERT du tracé manuel (Polygon) reste valide.
--   (2) AJOUTE `provenance` (liste FERMÉE) : 'trace_manuel' (existant, défaut), 'ign_adopte' (adoption IGN, ce chantier),
--       'ign_retouche' (adoption puis retouche à la main — PRÉ-PROVISIONNÉ pour le chantier suivant, la liste l'accueille sans refonte).
--
-- 🔴 GARDE MOTEUR INCHANGÉE : `reconstitution` reste NOT NULL DEFAULT true avec son CHECK (= true). Cette colonne signifie « ligne
--   ignorée du moteur (verdict/obstacles/altitude/certificat) », vraie pour TOUTES les lignes, y compris une adoption IGN. La
--   provenance (origine réelle affichée à l'internaute) est une dimension DISTINCTE, portée par la nouvelle colonne. On ne lève
--   donc PAS la garde fondamentale de la migration 149.
--
-- SÛR : aucun DROP, aucune écriture de données, GOLDEN-SAFE (ne touche ni verdict, ni score, ni golden). Idempotent. AUCUN ENVOI.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/153_emprise_provenance_ign.sql

BEGIN;

-- (1) geom : Polygon → Geometry (accepte Polygon ET MultiPolygon), + garde polygonale.
ALTER TABLE permis_emprise_reconstruite
  ALTER COLUMN geom TYPE geometry(Geometry, 2154) USING geom;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permis_emprise_geom_polygonale_chk') THEN
    ALTER TABLE permis_emprise_reconstruite
      ADD CONSTRAINT permis_emprise_geom_polygonale_chk CHECK (GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON'));
  END IF;
END $$;

-- (2) provenance : origine réelle de l'emprise, liste FERMÉE, obligatoire, défaut = tracé manuel (backfill des lignes existantes).
ALTER TABLE permis_emprise_reconstruite
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'trace_manuel';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permis_emprise_provenance_chk') THEN
    ALTER TABLE permis_emprise_reconstruite
      ADD CONSTRAINT permis_emprise_provenance_chk
      CHECK (provenance IN ('trace_manuel', 'ign_adopte', 'ign_retouche'));
  END IF;
END $$;

COMMENT ON COLUMN permis_emprise_reconstruite.provenance IS
  'Origine RÉELLE de l''emprise (affichée à l''internaute), liste FERMÉE : ''trace_manuel'' (tracé manuel assisté, calage 2 points) | ''ign_adopte'' (polygones « En projet » IGN adoptés tels quels, PROJ-3q — plus fiable qu''un tracé, ne JAMAIS étiqueter « reconstitution ») | ''ign_retouche'' (adoption puis retouche à la main, chantier suivant). Distinct de reconstitution (garde moteur, = true pour toutes les lignes).';
COMMENT ON COLUMN permis_emprise_reconstruite.geom IS
  'Contour en EPSG:2154. Polygon (tracé manuel ou groupe à bords jointifs) OU MultiPolygon (groupe adopté à contact par sommet). AFFICHAGE seulement (schéma de la parcelle) — jamais une source altimétrique, jamais dans le moteur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='permis_emprise_reconstruite' AND column_name IN ('geom','provenance');
--   SELECT conname FROM pg_constraint WHERE conname IN ('permis_emprise_geom_polygonale_chk','permis_emprise_provenance_chk','permis_emprise_reconstitution_chk'); -- 3 présentes
--   -- Les lignes existantes portent provenance='trace_manuel' (backfill par le DEFAULT).
