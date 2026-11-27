-- CONTRÔLE EN LECTURE SEULE AVANT LA 522 (demande du 28/11/2026) — les adresses de copropriété qui DEVIENDRAIENT la même adresse, dans deux copropriétés
-- différentes, avec la nouvelle clé de comparaison (abréviations du type de voie écrites en entier). Rien n'est écrit : BEGIN READ ONLY … ROLLBACK.
-- La clé est calculée ICI, en ligne (la fonction de la 522 n'existe pas encore en production) : la même règle, mot pour mot.
BEGIN READ ONLY;
SHOW default_transaction_read_only;
\echo
\echo == Adresses de copropriété qui deviendraient la même clé dans DEUX copropriétés (nouvelle clé de la 522)
WITH adresses AS (
  SELECT c.id AS copro, coalesce(nullif(btrim(c.nom), ''), c.libelle) AS copropriete, c.libelle, coalesce(nullif(btrim(c.code_postal), ''), '') AS cp
    FROM gestion_copropriete c
  UNION ALL
  SELECT a.copropriete_id, coalesce(nullif(btrim(c.nom), ''), c.libelle), a.libelle, coalesce(nullif(btrim(a.code_postal), ''), nullif(btrim(c.code_postal), ''), '')
    FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id WHERE a.retire_le IS NULL
), cle520 AS (
  SELECT x.*, btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(x.libelle, ''), NFD), '[̀-ͯ]', '', 'g')), '[^a-z0-9]+', ' ', 'g')),
      '\m(\d+)\s*(bis|b)\M', '\1 bis', 'g'), '\m(\d+)\s*(ter|t)\M', '\1 ter', 'g'), '\m(\d+)\s*(quater|qua|q)\M', '\1 quater', 'g'), '\s+', ' ', 'g')) AS k
    FROM adresses x
), voies(a, e) AS (
  VALUES ('r', 'rue'), ('av', 'avenue'), ('ave', 'avenue'), ('bd', 'boulevard'), ('bld', 'boulevard'), ('bvd', 'boulevard'), ('boul', 'boulevard'), ('pl', 'place'),
         ('all', 'allee'), ('imp', 'impasse'), ('ch', 'chemin'), ('chem', 'chemin'), ('sq', 'square'), ('qu', 'quai')
), cle522 AS (
  SELECT y.*, coalesce(z.m[1] || v.e || substr(y.k, length(z.m[1]) + length(z.m[2]) + 1), y.k) AS k522
    FROM cle520 y
    LEFT JOIN LATERAL (SELECT regexp_match(y.k, '^((?:\d+ (?:bis |ter |quater )?)?)(r|av|ave|bd|bld|bvd|boul|pl|all|imp|ch|chem|sq|qu)\M') AS m) z ON true
    LEFT JOIN voies v ON v.a = z.m[2]
)
SELECT 'a:' || k522 || '|' || cp AS cle_522, count(DISTINCT copro) AS coproprietes, string_agg(DISTINCT copro || ' ' || copropriete || ' : « ' || libelle || ' »', ' ; ') AS adresses
  FROM cle522 WHERE k522 <> '' GROUP BY k522, cp HAVING count(DISTINCT copro) > 1 ORDER BY 1;
\echo
\echo == Pour information : les adresses dont la clé CHANGE avec la 522 (abréviation reconnue)
WITH adresses AS (
  SELECT c.libelle FROM gestion_copropriete c UNION ALL SELECT a.libelle FROM gestion_copropriete_adresse a WHERE a.retire_le IS NULL
), k AS (
  SELECT libelle, btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(libelle, ''), NFD), '[̀-ͯ]', '', 'g')), '[^a-z0-9]+', ' ', 'g')),
      '\m(\d+)\s*(bis|b)\M', '\1 bis', 'g'), '\m(\d+)\s*(ter|t)\M', '\1 ter', 'g'), '\m(\d+)\s*(quater|qua|q)\M', '\1 quater', 'g'), '\s+', ' ', 'g')) AS k FROM adresses
)
SELECT count(*) AS adresses_dont_la_cle_change FROM k WHERE k ~ '^((?:\d+ (?:bis |ter |quater )?)?)(r|av|ave|bd|bld|bvd|boul|pl|all|imp|ch|chem|sq|qu)\M';
ROLLBACK;
