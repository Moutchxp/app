-- 522_gestion_cle_adresse_abreviations.sql — 🔴🔴 « 7 r. » ET « 7 rue » SONT LA MÊME ADRESSE POUR « UNE ADRESSE = UNE SEULE COPROPRIÉTÉ » (demande du 28/11/2026).
--
-- LE BESOIN : « Abréviations d'adresse : « 7 r. » et « 7 rue » doivent être reconnus comme la même adresse pour la règle « une adresse = une seule
-- copropriété ». Étends la normalisation commune (celle de 32761a3a / 520) aux abréviations courantes : r./rue, av./ave/avenue, bd/boul./boulevard,
-- pl./place, all./allée, imp./impasse, ch./chemin, sq./square, quai, ter/bis/quater collés ou non. Même fonction côté écran, serveur et base. »
--
-- CE QUE FAIT LA MIGRATION :
--   ① gestion_cle_adresse_comparable (520) écrit EN ENTIER le type de voie abrégé — seulement JUSTE APRÈS le numéro (et son indice bis / ter / quater),
--     ou en tête : un mot au milieu de l'adresse n'est jamais touché. La MÊME liste, dans le même ordre, que ABREVIATIONS_VOIE du serveur
--     (app/lib/gestion/adresseCoproExclusivite.ts) ; un essai compare les deux. bis / ter / quater collés ou non : inchangé depuis la 520 ;
--   ② les clés du registre gestion_copropriete_adresse_exclusive sont RECALCULÉES pour chaque copropriété (la fonction de la 520) : une clé qui change
--     est fermée (fermee_le, jamais effacée) et la nouvelle ouverte. Deux copropriétés qui porteraient désormais la même adresse : la migration
--     S'ARRÊTE avec le message de la 520 (« Cette adresse appartient déjà à la copropriété … ») — rien n'est écrit (l'outil l'enveloppe dans UNE
--     transaction). Contrôle préalable en LECTURE SEULE : db/controles/522_doublons_lecture_seule.sql (recette du 28/11/2026 :
--     0 doublon, 0 adresse dont la clé change).
-- AUCUNE adresse enregistrée n'est réécrite (ni libellé, ni clé d'immeuble) : seule la clé de COMPARAISON change. Aucune garde « recette seulement ».
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable sans casse (CREATE OR REPLACE ; un recalcul
-- rejoué ne change rien).

-- ① la clé comparable : celle de la 520, plus le type de voie abrégé écrit en entier (la même règle que cleComparable, à l'identique)
CREATE OR REPLACE FUNCTION gestion_cle_adresse_comparable(brut text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  WITH k AS (
    SELECT btrim(regexp_replace(
      regexp_replace(regexp_replace(regexp_replace(
        btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(brut, ''), NFD), '[̀-ͯ]', '', 'g')), '[^a-z0-9]+', ' ', 'g')),
        '\m(\d+)\s*(bis|b)\M', '\1 bis', 'g'),
        '\m(\d+)\s*(ter|t)\M', '\1 ter', 'g'),
        '\m(\d+)\s*(quater|qua|q)\M', '\1 quater', 'g'),
      '\s+', ' ', 'g')) AS k
  ), m AS (
    SELECT k.k, regexp_match(k.k, '^((?:\d+ (?:bis |ter |quater )?)?)(r|av|ave|bd|bld|bvd|boul|pl|all|imp|ch|chem|sq|qu)\M') AS m FROM k
  )
  SELECT CASE WHEN m.m IS NULL THEN m.k ELSE m.m[1] || CASE m.m[2]
           WHEN 'r' THEN 'rue' WHEN 'av' THEN 'avenue' WHEN 'ave' THEN 'avenue' WHEN 'bd' THEN 'boulevard' WHEN 'bld' THEN 'boulevard'
           WHEN 'bvd' THEN 'boulevard' WHEN 'boul' THEN 'boulevard' WHEN 'pl' THEN 'place' WHEN 'all' THEN 'allee' WHEN 'imp' THEN 'impasse'
           WHEN 'ch' THEN 'chemin' WHEN 'chem' THEN 'chemin' WHEN 'sq' THEN 'square' WHEN 'qu' THEN 'quai' END
         || substr(m.k, length(m.m[1]) + length(m.m[2]) + 1) END
    FROM m
$f$;
COMMENT ON FUNCTION gestion_cle_adresse_comparable(text) IS
  'Clé de comparaison d''une adresse (520, étendue par la 522 du 28/11/2026) : minuscules, accents et ponctuation retirés, indice bis / ter / quater en entier, type de voie abrégé (r., av., bd…) en entier juste après le numéro. Identique à cleComparable (serveur).';

-- ② les clés du registre, recalculées pour chaque copropriété (une clé qui change : fermée, la nouvelle ouverte ; un doublon : arrêt clair)
DO $m$
DECLARE c record;
BEGIN
  IF to_regclass('public.gestion_copropriete_adresse_exclusive') IS NULL THEN
    RAISE EXCEPTION 'La migration 520 (registre gestion_copropriete_adresse_exclusive) doit être appliquée avant la 522.';
  END IF;
  FOR c IN SELECT id FROM gestion_copropriete ORDER BY id LOOP
    PERFORM gestion_copropriete_exclusivite_recalculer(c.id);
  END LOOP;
END
$m$;
