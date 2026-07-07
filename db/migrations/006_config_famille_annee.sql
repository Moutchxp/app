-- 006_config_famille_annee.sql
-- Crée la table des « cartes d'année de construction » configurables (CRUD admin, pilotage sans
-- code) qui remplace les 2 tranches FIXES ancien1900/ancien1935 dans le moteur de score /80.
--
-- MIGRATION ADDITIVE, IDEMPOTENTE, NON DESTRUCTIVE :
--   - CREATE TABLE IF NOT EXISTS (rejouable en NO-OP).
--   - SEED UNIQUEMENT si la table est vide : 2 cartes reproduisant EXACTEMENT les tranches
--     actuelles — « année ≤ 1900 » → {1.5, 1.2, 300} ; « > 1900 et ≤ 1935 » → {1.2, 1.1, 200}.
--   - Aucun DROP/ALTER destructif. Les colonnes a1900_*/a1935_*/borne_annee_1900/1935 de
--     config_scoring sont CONSERVÉES en base (neutralisées, plus lues) ; leur purge = chantier séparé.
-- Application manuelle : psql "$DATABASE_URL" -f db/migrations/006_config_famille_annee.sql

CREATE TABLE IF NOT EXISTS config_famille_annee (
  id serial PRIMARY KEY,
  borne_min integer, op_min text CHECK (op_min IN ('>=','>')),
  borne_max integer, op_max text CHECK (op_max IN ('<=','<')),
  cone double precision NOT NULL, flanc double precision NOT NULL, distmax_m double precision NOT NULL,
  CONSTRAINT config_famille_annee_borne_chk CHECK (borne_min IS NOT NULL OR borne_max IS NOT NULL)
);

INSERT INTO config_famille_annee (borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m)
SELECT * FROM (VALUES
  (NULL::int, NULL::text, 1900, '<=', 1.5, 1.2, 300),
  (1900,      '>',        1935, '<=', 1.2, 1.1, 200)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM config_famille_annee);
