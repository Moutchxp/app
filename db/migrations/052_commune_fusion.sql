-- 052_commune_fusion.sql — Module VEILLE PERMIS (chantier S6) : correspondance ANCIEN code INSEE → code ACTUEL.
--
-- MOTIF : Sitadel garde le code INSEE au dépôt du permis, NON recodifié. 4 codes de sitadel_dossier n'ont pas de commune
-- courante (fusions en communes nouvelles). Sélectionner la commune ACTUELLE sur la carte doit inclure les dossiers
-- déposés sous l'ANCIEN code, sinon la sélection est silencieusement incomplète (ex. Saint-Denis doit inclure les 122
-- dossiers de Pierrefitte-sur-Seine). Table séparée (comme mairie_contact) : `commune` reste 100 % dérivée de l'import
-- IGN rejouable.
--
-- SOURCE : couche ADMIN EXPRESS `commune_associee_ou_deleguee` (IGN, Licence Ouverte Etalab 2.0 — même source que S4),
-- inspectée pour relier chaque ancien code à sa commune actuelle. 78503 N'Y FIGURE PAS → aucune correspondance connue :
-- il reste orphelin (« commune inconnue »), on n'invente rien.
--
-- SÛR : DDL + 3 lignes d'amorce (sourcées). Idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING). GOLDEN-SAFE.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/052_commune_fusion.sql
-- Vérification : \d commune_fusion · SELECT * FROM commune_fusion;

BEGIN;

CREATE TABLE IF NOT EXISTS commune_fusion (
  ancien_code char(5) PRIMARY KEY,                         -- code Sitadel historique (commune déléguée/ancienne)
  code_actuel char(5) NOT NULL REFERENCES commune(code_insee), -- commune nouvelle qui l'absorbe (dans le référentiel)
  nom_ancien  text,                                        -- nom de l'ancienne commune (pour l'avertissement d'interface)
  source      text
);

COMMENT ON TABLE commune_fusion IS 'Ancien code INSEE (Sitadel, non recodifié) → code de la commune nouvelle. Sélectionner la commune actuelle inclut les dossiers de l''ancien code. Source : ADMIN EXPRESS commune_associee_ou_deleguee (Etalab).';

INSERT INTO commune_fusion (ancien_code, code_actuel, nom_ancien, source) VALUES
  ('93059', '93066', 'Pierrefitte-sur-Seine', 'ADMIN EXPRESS commune_associee_ou_deleguee (IGN, Etalab 2.0)'),
  ('78251', '78551', 'Fourqueux',             'ADMIN EXPRESS commune_associee_ou_deleguee (IGN, Etalab 2.0)'),
  ('78524', '78158', 'Rocquencourt',          'ADMIN EXPRESS commune_associee_ou_deleguee (IGN, Etalab 2.0)')
ON CONFLICT (ancien_code) DO NOTHING;
-- 78503 : absent de la couche déléguée ADMIN EXPRESS → aucune correspondance fiable → NON inséré (documenté, jamais inventé).

COMMIT;
