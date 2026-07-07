-- 009_patrimoine_entite_unifie.sql — modèle patrimoine UNIFIÉ (entité + liaison + source).
--
-- Réunit les 3 familles (MH, Inventaire, Mondial) dans le gabarit « entité + liaison + source »
-- (celui du mondial). Pré-requis de la carte de curation M4. Chantier GOLDEN-ADJACENT : le moteur
-- (`faisceaux.ts`) lira ce modèle ; l'équivalence des flags is_mh/is_inv/is_emblematique est PROUVÉE
-- par instrumentation (divergences=0) AVANT la réécriture. Réf : docs/SPEC_migration_patrimoine_unifiee.md.
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : CREATE TABLE IF NOT EXISTS + seed `ON CONFLICT DO NOTHING`.
-- Les 3 tables sources (monuments_historiques, inventaire_general, monuments_emblematiques /
-- monument_emblematique_batiment) sont CONSERVÉES en lecture (OQ6) — AUCUNE purge ici (commit séparé).
-- Migration one-shot : `ON CONFLICT DO NOTHING` ne MET PAS À JOUR une liaison si sa source change entre
-- deux rejeux (acceptable : la source reste la vérité tant que le seed n'est pas re-fait volontairement).
-- geom_point conservé en EPSG:2154 (jamais reprojeté). Application : psql "$DATABASE_URL" -f db/migrations/009_patrimoine_entite_unifie.sql

CREATE TABLE IF NOT EXISTS patrimoine_entite (
  id         serial PRIMARY KEY,
  famille    text NOT NULL CHECK (famille IN ('mondial','mh','inventaire')),
  ref_code   text NOT NULL,
  nom        text,
  statut     text,
  geom_point geometry(Point,2154),
  actif      boolean NOT NULL DEFAULT true,
  meta       jsonb
);
CREATE INDEX        IF NOT EXISTS patrimoine_entite_geom_idx        ON patrimoine_entite USING gist (geom_point);
CREATE INDEX        IF NOT EXISTS patrimoine_entite_famille_idx     ON patrimoine_entite (famille);
CREATE INDEX        IF NOT EXISTS patrimoine_entite_ref_idx         ON patrimoine_entite (ref_code);
-- Unicité (famille, ref_code) : cible du `ON CONFLICT` (idempotence) ET clé de mapping du seed liaison.
CREATE UNIQUE INDEX IF NOT EXISTS patrimoine_entite_famille_ref_uidx ON patrimoine_entite (famille, ref_code);

CREATE TABLE IF NOT EXISTS patrimoine_entite_batiment (
  entite_id            integer NOT NULL REFERENCES patrimoine_entite(id),
  cleabs               text NOT NULL,
  source               text NOT NULL CHECK (source IN ('auto','manuel')),
  actif                boolean NOT NULL DEFAULT true,   -- OQ1 : porte badge_actif de l'Inventaire, PAR-LIAISON
  dist_m               double precision,
  verifie_manuellement boolean NOT NULL DEFAULT false,
  created              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entite_id, cleabs)
);
CREATE INDEX IF NOT EXISTS patrimoine_entite_batiment_cleabs_idx ON patrimoine_entite_batiment (cleabs);

-- ===================== SEED ENTITÉS (idempotent : ON CONFLICT (famille, ref_code)) =====================
-- MH : une entité par ref (176 ; ref UNIQUE non-null). geom (col source) → geom_point, statut classe|inscrit.
INSERT INTO patrimoine_entite (famille, ref_code, nom, statut, geom_point, actif, meta)
SELECT 'mh', mh.ref, mh.tico, mh.statut, ST_Force2D(mh.geom), true,
       jsonb_build_object('tico', mh.tico, 'deno', mh.deno)
FROM monuments_historiques mh
ON CONFLICT (famille, ref_code) DO NOTHING;

-- Inventaire : une entité par ref distinct (ref déjà UNIQUE → DISTINCT ON défensif). statut bati_patrimonial.
INSERT INTO patrimoine_entite (famille, ref_code, nom, statut, geom_point, actif, meta)
SELECT DISTINCT ON (ig.ref)
       'inventaire', ig.ref, ig.nom, 'bati_patrimonial', ST_Force2D(ig.geom_point), true,
       jsonb_build_object('deno', ig.deno, 'nom', ig.nom, 'datation', ig.datation,
                          'adresse', ig.adresse, 'cada_ref', ig.cada_ref)
FROM inventaire_general ig
ORDER BY ig.ref
ON CONFLICT (famille, ref_code) DO NOTHING;

-- Mondial : les 14 emblématiques. entite.actif = me.actif (mondial filtre au niveau ENTITÉ).
INSERT INTO patrimoine_entite (famille, ref_code, nom, statut, geom_point, actif, meta)
SELECT 'mondial', me.code, me.nom, 'mondial', ST_Force2D(me.geom_point), me.actif,
       jsonb_build_object('code', me.code, 'nom', me.nom)
FROM monuments_emblematiques me
ON CONFLICT (famille, ref_code) DO NOTHING;

-- ===================== SEED LIAISONS (idempotent : ON CONFLICT (entite_id, cleabs)) =====================
-- MH : 152 liaisons cleabs NOT NULL, actif=true, source='auto' (is_mh SANS filtre actif).
INSERT INTO patrimoine_entite_batiment (entite_id, cleabs, source, actif, dist_m)
SELECT pe.id, mh.cleabs, 'auto', true, NULL
FROM monuments_historiques mh
JOIN patrimoine_entite pe ON pe.famille = 'mh' AND pe.ref_code = mh.ref
WHERE mh.cleabs IS NOT NULL
ON CONFLICT (entite_id, cleabs) DO NOTHING;

-- Inventaire : 250 liaisons par paire (ref,cleabs) cleabs NOT NULL, actif = badge_actif (PAR-LIAISON), source='auto'.
INSERT INTO patrimoine_entite_batiment (entite_id, cleabs, source, actif, dist_m)
SELECT pe.id, ig.cleabs, 'auto', ig.badge_actif, ig.dist_m
FROM inventaire_general ig
JOIN patrimoine_entite pe ON pe.famille = 'inventaire' AND pe.ref_code = ig.ref
WHERE ig.cleabs IS NOT NULL
ON CONFLICT (entite_id, cleabs) DO NOTHING;

-- Mondial : 14 liaisons, source PRÉSERVÉE (meb.source), actif=true (mondial filtre l'ENTITÉ, pas la liaison).
INSERT INTO patrimoine_entite_batiment (entite_id, cleabs, source, actif, dist_m, created)
SELECT pe.id, meb.cleabs, meb.source, true, meb.dist_m, meb.created
FROM monument_emblematique_batiment meb
JOIN monuments_emblematiques me ON me.id = meb.monument_id
JOIN patrimoine_entite pe ON pe.famille = 'mondial' AND pe.ref_code = me.code
ON CONFLICT (entite_id, cleabs) DO NOTHING;
