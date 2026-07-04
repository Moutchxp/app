-- =============================================================================
-- migration_monuments_emblematiques.sql
-- Étape B (DATA seule) — famille « Patrimoine mondial ». NE TOUCHE PAS le score :
-- le moteur ne lit pas encore ces tables (branchement = commit suivant).
--
-- Modèle STANDARD réutilisable (1 entité → N cleabs, source auto/manuel tracée,
-- manuel prioritaire & jamais écrasé au ré-import) :
--   monuments_emblematiques           (le monument : code stable + point L93)
--   monument_emblematique_batiment    (liaison monument ↔ cleabs BD TOPO)
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING,
-- le ré-import auto ne supprime QUE source='auto'). Rejouable.
-- =============================================================================

-- 1) Tables ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monuments_emblematiques (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text UNIQUE NOT NULL,             -- MonumentId stable ('EIFFEL', …)
  nom        text,
  geom_point geometry(Point, 2154),
  actif      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS monument_emblematique_batiment (
  monument_id bigint NOT NULL REFERENCES monuments_emblematiques(id),
  cleabs      text NOT NULL,
  source      text NOT NULL CHECK (source IN ('auto','manuel')),
  dist_m      numeric,                         -- 0 si contains, sinon distance KNN
  created     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monument_id, cleabs)
);

CREATE INDEX IF NOT EXISTS meb_cleabs_idx      ON monument_emblematique_batiment (cleabs);      -- jointure inverse faisceau→monument
CREATE INDEX IF NOT EXISTS meb_monument_idx    ON monument_emblematique_batiment (monument_id);
CREATE INDEX IF NOT EXISTS me_geom_idx         ON monuments_emblematiques USING gist (geom_point);

-- 2) Import des 14 monuments (code + nom + point L93, recopiés de MONUMENTS_L93) --------
INSERT INTO monuments_emblematiques (code, nom, geom_point) VALUES
  ('EIFFEL',                       'Tour Eiffel',                   ST_SetSRID(ST_MakePoint(648235.8, 6862268.4), 2154)),
  ('SACRE_COEUR',                  'Sacré-Cœur',                    ST_SetSRID(ST_MakePoint(651829.2, 6865387.7), 2154)),
  ('NOTRE_DAME',                   'Notre-Dame de Paris',           ST_SetSRID(ST_MakePoint(652294.0, 6861631.9), 2154)),
  ('ARC_TRIOMPHE',                 'Arc de Triomphe',               ST_SetSRID(ST_MakePoint(648292.2, 6863981.5), 2154)),
  ('LOUVRE',                       'Louvre (Pyramide)',             ST_SetSRID(ST_MakePoint(651404.5, 6862488.9), 2154)),
  ('PANTHEON',                     'Panthéon',                      ST_SetSRID(ST_MakePoint(652033.9, 6860882.4), 2154)),
  ('INVALIDES',                    'Invalides (Dôme)',              ST_SetSRID(ST_MakePoint(649554.6, 6861876.4), 2154)),
  ('OPERA_GARNIER',                'Opéra Garnier',                 ST_SetSRID(ST_MakePoint(650989.6, 6863756.7), 2154)),
  ('CONCIERGERIE_SAINTE_CHAPELLE', 'Conciergerie/Sainte-Chapelle',  ST_SetSRID(ST_MakePoint(651959.6, 6861928.3), 2154)),
  ('TOUR_SAINT_JACQUES',           'Tour Saint-Jacques',            ST_SetSRID(ST_MakePoint(652235.2, 6862153.9), 2154)),
  ('POMPIDOU',                     'Centre Pompidou',               ST_SetSRID(ST_MakePoint(652474.2, 6862493.4), 2154)),
  ('GRAND_PALAIS',                 'Grand Palais',                  ST_SetSRID(ST_MakePoint(649565.4, 6863120.7), 2154)),
  ('SAINT_DENIS',                  'Basilique Saint-Denis (93)',    ST_SetSRID(ST_MakePoint(653084.8, 6870824.1), 2154)),
  ('VERSAILLES',                   'Château de Versailles (78)',    ST_SetSRID(ST_MakePoint(635400.6, 6856445.9), 2154))
ON CONFLICT (code) DO NOTHING;

-- 3) Rattachement AUTO (miroir MH : ST_Contains sinon KNN <-> ≤ 15 m) -------------------
--    Ne touche QUE source='auto' (le manuel est préservé). Rejouable : on purge l'auto puis on réinsère.
DELETE FROM monument_emblematique_batiment WHERE source = 'auto';

INSERT INTO monument_emblematique_batiment (monument_id, cleabs, source, dist_m)
SELECT me.id, r.cleabs, 'auto', r.dist_m
FROM monuments_emblematiques me
CROSS JOIN LATERAL (
  -- 1 cleabs par monument : bâtiment contenant le point, sinon le plus proche ≤ 15 m.
  SELECT b.cleabs,
         round(ST_Distance(b.geom, me.geom_point)::numeric, 2) AS dist_m
  FROM batiment b
  WHERE ST_DWithin(b.geom, me.geom_point, 15)
  ORDER BY (NOT ST_Contains(b.geom, me.geom_point)),  -- contains d'abord (false < true)
           b.geom <-> me.geom_point
  LIMIT 1
) r
ON CONFLICT (monument_id, cleabs) DO NOTHING;
