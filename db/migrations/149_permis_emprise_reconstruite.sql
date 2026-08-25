-- 149_permis_emprise_reconstruite.sql — Module VEILLE PERMIS (chantier PROJ-2) : EMPRISES au sol RECONSTITUÉES à la main,
-- calées sur la parcelle, à partir d'une pièce graphique PDF du permis.
--
-- POURQUOI CETTE TABLE : la reconstruction AUTOMATIQUE de l'emprise depuis les PDF a été mesurée CLOSE (PROJ-0/1/1b/1c :
-- 5 sources, 5 échecs, 3 causes — poché de murs ouvert / calques non tagués / pas d'ancrage d'échelle). L'œil humain ferme
-- un contour en deux secondes : PROJ-2 outille ce tracé manuel assisté (2 points de calage → similitude → Lambert-93).
--
-- 🔴🔴🔴 GARDE FONDAMENTALE, GRAVÉE ICI ET DANS LE NOMMAGE (`emprise_reconstruite`, colonne `reconstitution`=true figée) :
--   Une emprise de cette table est une RECONSTITUTION, JAMAIS une mesure.
--   Elle ne crée AUCUN polygone dans `batiment`. Elle n'alimente NI le verdict SVAV, NI une injection d'altitude
--   (`permis_polygone_altitude`), NI un certificat. Le moteur géométrique (verdict/obstacles/altitude) IGNORE cette table.
--   Un test applicatif (`empriseReconstruiteRepo.test.ts` + garde moteur) CASSE si un chemin d'écriture la fait entrer dans
--   le moteur. Ne JAMAIS lever cette garde sans accord explicite du porteur.
--
-- CE QU'ON STOCKE, PAR EMPRISE (un bâtiment = une ligne ; un permis peut en porter plusieurs, ex. 11434 = 2D1 + 2D2) :
--   la géométrie EPSG:2154 (reconstituée), le dossier, le libellé du bâtiment, la pièce + la page d'origine, les points de
--   calage et l'échelle déclarée (jsonb), le résidu mesuré (m), qui/quand. Le contour affiché portera l'étiquette
--   « reconstitution » + son résidu de calage, et sera effaçable.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / INDEX, IF NOT EXISTS). Aucun DROP, aucun ALTER d'une table existante, aucune
-- écriture de données. GOLDEN-SAFE (ne touche ni au verdict, ni au score, ni au golden). Idempotent. Un seul BEGIN/COMMIT.
-- AUCUN ENVOI. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/149_permis_emprise_reconstruite.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

CREATE TABLE IF NOT EXISTS permis_emprise_reconstruite (
  id             bigserial PRIMARY KEY,
  dossier_id     bigint  NOT NULL REFERENCES sitadel_dossier(id)   ON DELETE CASCADE,
  libelle        text    NOT NULL,                                  -- libellé du bâtiment reconstitué (ex. « 2D1 »)
  geom           geometry(Polygon, 2154) NOT NULL,                  -- 🔴 RECONSTITUTION, jamais une mesure (Lambert-93)
  surface_m2     numeric,                                           -- ST_Area(geom) figée à l'écriture (indicative)
  piece_id       bigint  REFERENCES dossier_document(id) ON DELETE SET NULL, -- pièce PDF d'origine (informative)
  page           integer,                                           -- page de la pièce (informative)
  calage         jsonb   NOT NULL,                                  -- {paires:[{plan,lambert}], ratioDeclare, ratioImplicite, douteux, raisons}
  residu_m       numeric,                                           -- résidu de calage mesuré (m) — AFFICHÉ, jamais masqué
  reconstitution boolean NOT NULL DEFAULT true,                     -- 🔴 marqueur FIGÉ : cette ligne n'est PAS une mesure
  cree_par       text,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  -- 🔴 verrou EN BASE : impossible d'écrire une ligne qui se prétendrait « mesure » (reconstitution doit rester true).
  CONSTRAINT permis_emprise_reconstitution_chk CHECK (reconstitution = true)
);

CREATE INDEX IF NOT EXISTS permis_emprise_reconstruite_dossier_idx ON permis_emprise_reconstruite (dossier_id);
CREATE INDEX IF NOT EXISTS permis_emprise_reconstruite_gix         ON permis_emprise_reconstruite USING gist (geom);

COMMENT ON TABLE permis_emprise_reconstruite IS
  'PROJ-2 — emprises au sol RECONSTITUÉES à la main (tracé manuel assisté, calage 2 points → similitude → Lambert-93). 🔴 RECONSTITUTION, JAMAIS une mesure : n''alimente NI batiment, NI le verdict SVAV, NI une injection d''altitude (permis_polygone_altitude), NI un certificat. Le moteur géométrique IGNORE cette table (garde testée). Une ligne par bâtiment ; un permis peut en porter plusieurs.';
COMMENT ON COLUMN permis_emprise_reconstruite.geom IS 'Contour reconstitué en EPSG:2154. Issu d''un tracé humain calé, PAS d''une source altimétrique. Ne sert qu''à l''affichage sur le schéma de la parcelle.';
COMMENT ON COLUMN permis_emprise_reconstruite.reconstitution IS '🔴 Marqueur FIGÉ (CHECK = true) : distingue à jamais une reconstitution d''une mesure. Aucune écriture ne peut le mettre à false.';
COMMENT ON COLUMN permis_emprise_reconstruite.calage IS 'Traçabilité du calage : paires (plan PDF ↔ Lambert), échelle déclarée/implicite, verdict « douteux » et ses raisons. Auditable, jamais lissé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_emprise_reconstruite' ORDER BY ordinal_position;
--   -- geom attendu : udt_name = 'geometry' (typmod Polygon,2154). reconstitution = boolean NOT NULL DEFAULT true.
--   SELECT conname FROM pg_constraint WHERE conname = 'permis_emprise_reconstitution_chk'; -- présente
--   -- Garde : cette ligne NE DOIT jamais apparaître dans une requête du moteur (verdict/obstacles/altitude) : test applicatif.
