-- 520_gestion_copropriete_adresse_exclusive.sql — 🔴🔴 UNE ADRESSE N'APPARTIENT QU'À UNE SEULE COPROPRIÉTÉ, VERROUILLÉ EN BASE (décision d'Arno du 26/11/2026).
--
-- LE BESOIN (décision d'Arno du 26/11/2026, après le contrôle en lecture seule de la production à 15h53 : 0 adresse en double, 0 adresse officielle en
-- double) : « on pose l'exclusivité des adresses EN BASE […] contrainte d'unicité qui empêche qu'une même adresse (même clé normalisée que ton contrôle
-- serveur de 32761a3a, et même identifiant BAN quand il existe) soit rattachée à deux copropriétés actives. »
--
-- POURQUOI UN REGISTRE : une adresse vit à DEUX endroits — l'adresse principale (gestion_copropriete) et les autres adresses (gestion_copropriete_adresse,
-- en cours tant que retire_le est vide). Un index unique ne couvre qu'une table : le registre gestion_copropriete_adresse_exclusive tient, pour chaque
-- copropriété, ses CLÉS en cours, et l'index unique partiel « une clé ouverte, une seule copropriété » est la contrainte d'unicité.
--   · clé d'adresse : « a:<clé comparable>|<code postal> » — la clé comparable est calculée par gestion_cle_adresse_comparable, la même règle que
--     cleComparable du serveur (app/lib/gestion/adresseCoproExclusivite.ts : minuscules, accents et ponctuation retirés, indice bis / ter / quater
--     écrit en entier et détaché du numéro) ; le code postal est celui de la ligne, sinon celui de la copropriété, sinon vide ;
--   · clé d'adresse officielle : « ban:<identifiant BAN> », quand il existe.
-- Une copropriété peut porter plusieurs écritures de la même adresse (principale + écriture d'origine) : une seule ligne ouverte par clé et par
-- copropriété. Le registre ne s'efface jamais : une clé qui quitte sa copropriété reçoit fermee_le (historique).
--
-- LES DÉCLENCHEURS : toute écriture d'une adresse (ajout, retrait, déplacement, changement d'adresse principale, création d'une copropriété) recalcule
-- les clés de la copropriété touchée. Une clé déjà ouverte pour une AUTRE copropriété : REFUS (SQLSTATE 23505, contrainte
-- « gestion_copropriete_adresse_exclusive ») avec un message clair, « Cette adresse appartient déjà à la copropriété … » — l'application le relaie
-- tel quel (motifExclusiviteAdresse), jamais une erreur technique. Deux enregistrements simultanés : un verrou par clé (pg_advisory_xact_lock) les
-- range l'un après l'autre ; le second lit le premier et reçoit le même refus clair ; l'index unique reste le dernier rempart.
-- Le déplacement confirmé par la fenêtre du conflit retire (fermee_le) puis rattache dans la MÊME transaction : il passe.
--
-- MISE EN PLACE : le registre est rempli pour toutes les copropriétés existantes, une à une. Un doublon déjà présent arrête la migration avec le même
-- message (rien n'est écrit : l'outil l'enveloppe dans une transaction). Contrôle de production du 26/11/2026 : 0 doublon.
-- Aucune donnée existante modifiée ni supprimée ; aucune garde « recette seulement ». Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction
-- (psql -1). IDEMPOTENTE : rejouable sans casse.

-- ① la clé comparable : la même règle que cleComparable (serveur), à l'identique
CREATE OR REPLACE FUNCTION gestion_cle_adresse_comparable(brut text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(
      btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(brut, ''), NFD), '[̀-ͯ]', '', 'g')), '[^a-z0-9]+', ' ', 'g')),
      '\m(\d+)\s*(bis|b)\M', '\1 bis', 'g'),
      '\m(\d+)\s*(ter|t)\M', '\1 ter', 'g'),
      '\m(\d+)\s*(quater|qua|q)\M', '\1 quater', 'g'),
    '\s+', ' ', 'g'))
$f$;

-- ② le registre
CREATE TABLE IF NOT EXISTS gestion_copropriete_adresse_exclusive (
  id bigserial PRIMARY KEY,
  cle text NOT NULL CHECK (btrim(cle) <> ''),
  copropriete_id bigint NOT NULL,
  ouverte_le timestamptz NOT NULL DEFAULT now(),
  fermee_le timestamptz
);
-- LA CONTRAINTE D'UNICITÉ : une clé ouverte appartient à une seule copropriété
CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_adresse_exclusive_ouverte ON gestion_copropriete_adresse_exclusive (cle) WHERE fermee_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_copropriete_adresse_exclusive_par_copro ON gestion_copropriete_adresse_exclusive (copropriete_id) WHERE fermee_le IS NULL;
COMMENT ON TABLE gestion_copropriete_adresse_exclusive IS
  'Décision d''Arno du 26/11/2026 (520) : les clés d''adresse en cours de chaque copropriété ; une clé ouverte = une seule copropriété. Jamais effacé (fermee_le).';

-- ③ les clés en cours d'une copropriété (principale + adresses en cours ; adresse et adresse officielle)
CREATE OR REPLACE FUNCTION gestion_copropriete_cles_adresse(p_copro bigint) RETURNS SETOF text
LANGUAGE sql STABLE AS $f$
  SELECT DISTINCT k FROM (
    SELECT 'a:' || coalesce(nullif(gestion_cle_adresse_comparable(c.libelle), ''), c.cle_immeuble) || '|' || coalesce(nullif(btrim(c.code_postal), ''), '') AS k
      FROM gestion_copropriete c WHERE c.id = p_copro
    UNION ALL
    SELECT 'ban:' || btrim(c.ban_id) FROM gestion_copropriete c WHERE c.id = p_copro AND nullif(btrim(c.ban_id), '') IS NOT NULL
    UNION ALL
    SELECT 'a:' || coalesce(nullif(gestion_cle_adresse_comparable(a.libelle), ''), a.cle_immeuble) || '|'
             || coalesce(nullif(btrim(a.code_postal), ''), nullif(btrim(c.code_postal), ''), '')
      FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id WHERE a.copropriete_id = p_copro AND a.retire_le IS NULL
    UNION ALL
    SELECT 'ban:' || btrim(a.ban_id) FROM gestion_copropriete_adresse a
     WHERE a.copropriete_id = p_copro AND a.retire_le IS NULL AND nullif(btrim(a.ban_id), '') IS NOT NULL
  ) x WHERE k IS NOT NULL AND k NOT IN ('a:|', 'ban:');
$f$;

-- ④ le recalcul d'une copropriété : les clés parties sont FERMÉES, les nouvelles OUVERTES — une clé ouverte ailleurs : REFUS clair
CREATE OR REPLACE FUNCTION gestion_copropriete_exclusivite_recalculer(p_copro bigint) RETURNS void
LANGUAGE plpgsql AS $f$
DECLARE
  voulues text[];
  k text;
  autre bigint;
  nom_autre text;
  syndic_autre text;
  adresse_vue text;
BEGIN
  IF p_copro IS NULL THEN RETURN; END IF;
  voulues := CASE WHEN EXISTS (SELECT 1 FROM gestion_copropriete WHERE id = p_copro)
                  THEN ARRAY(SELECT gestion_copropriete_cles_adresse(p_copro) ORDER BY 1) ELSE ARRAY[]::text[] END;
  -- les clés qui ne sont plus à cette copropriété : fermées (jamais effacées)
  UPDATE gestion_copropriete_adresse_exclusive SET fermee_le = now()
   WHERE copropriete_id = p_copro AND fermee_le IS NULL AND NOT (cle = ANY (voulues));
  FOREACH k IN ARRAY voulues LOOP
    -- deux enregistrements simultanés de la même clé : l'un après l'autre
    PERFORM pg_advisory_xact_lock(hashtext('gestion_copropriete_adresse_exclusive'), hashtext(k));
    SELECT e.copropriete_id INTO autre FROM gestion_copropriete_adresse_exclusive e WHERE e.cle = k AND e.fermee_le IS NULL;
    IF autre IS NULL THEN
      INSERT INTO gestion_copropriete_adresse_exclusive (cle, copropriete_id) VALUES (k, p_copro);
    ELSIF autre <> p_copro THEN
      SELECT coalesce(nullif(btrim(c.nom), ''), c.libelle) INTO nom_autre FROM gestion_copropriete c WHERE c.id = autre;
      SELECT s.nom INTO syndic_autre FROM gestion_copropriete_syndic l JOIN gestion_syndic s ON s.id = l.syndic_id
       WHERE l.copropriete_id = autre AND l.fin IS NULL ORDER BY l.debut DESC NULLS LAST LIMIT 1;
      -- l'adresse telle qu'elle est écrite chez l'autre copropriété (sinon la clé)
      SELECT x.l INTO adresse_vue FROM (
        SELECT c.libelle AS l, 'a:' || coalesce(nullif(gestion_cle_adresse_comparable(c.libelle), ''), c.cle_immeuble) || '|' || coalesce(nullif(btrim(c.code_postal), ''), '') AS ka,
               'ban:' || btrim(c.ban_id) AS kb, 0 AS rang FROM gestion_copropriete c WHERE c.id = autre
        UNION ALL
        SELECT a.libelle, 'a:' || coalesce(nullif(gestion_cle_adresse_comparable(a.libelle), ''), a.cle_immeuble) || '|'
                 || coalesce(nullif(btrim(a.code_postal), ''), nullif(btrim(c.code_postal), ''), ''), 'ban:' || btrim(a.ban_id), 1
          FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id WHERE a.copropriete_id = autre AND a.retire_le IS NULL
      ) x WHERE x.ka = k OR x.kb = k ORDER BY x.rang LIMIT 1;
      adresse_vue := coalesce(adresse_vue, CASE WHEN k LIKE 'ban:%' THEN 'adresse officielle ' || substr(k, 5) ELSE split_part(substr(k, 3), '|', 1) END);
      RAISE EXCEPTION USING ERRCODE = 'unique_violation', CONSTRAINT = 'gestion_copropriete_adresse_exclusive',
        MESSAGE = format('Cette adresse appartient déjà à la copropriété %s%s : « %s ». Rien n’est enregistré.',
                         coalesce(nom_autre, 'n° ' || autre), CASE WHEN syndic_autre IS NULL THEN '' ELSE ' (syndic ' || syndic_autre || ')' END, adresse_vue),
        DETAIL = format('cle=%s copropriete_id=%s', k, autre);
    END IF;
  END LOOP;
END
$f$;

-- ⑤ les déclencheurs
CREATE OR REPLACE FUNCTION gestion_copropriete_adresse_exclusivite_declencheur() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_TABLE_NAME = 'gestion_copropriete' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE gestion_copropriete_adresse_exclusive SET fermee_le = now() WHERE copropriete_id = OLD.id AND fermee_le IS NULL;
    ELSE
      PERFORM gestion_copropriete_exclusivite_recalculer(NEW.id);
    END IF;
  ELSE
    -- l'ancienne copropriété d'abord (une adresse qui part libère sa clé), puis la nouvelle
    IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM gestion_copropriete_exclusivite_recalculer(OLD.copropriete_id); END IF;
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.copropriete_id IS DISTINCT FROM OLD.copropriete_id) THEN
      PERFORM gestion_copropriete_exclusivite_recalculer(NEW.copropriete_id);
    END IF;
  END IF;
  RETURN NULL;
END
$f$;

DROP TRIGGER IF EXISTS gestion_copropriete_exclusivite ON gestion_copropriete;
CREATE TRIGGER gestion_copropriete_exclusivite
  AFTER INSERT OR DELETE OR UPDATE OF cle_immeuble, libelle, code_postal, ban_id ON gestion_copropriete
  FOR EACH ROW EXECUTE FUNCTION gestion_copropriete_adresse_exclusivite_declencheur();

DROP TRIGGER IF EXISTS gestion_copropriete_adresse_exclusivite ON gestion_copropriete_adresse;
CREATE TRIGGER gestion_copropriete_adresse_exclusivite
  AFTER INSERT OR DELETE OR UPDATE OF copropriete_id, cle_immeuble, libelle, code_postal, ban_id, retire_le ON gestion_copropriete_adresse
  FOR EACH ROW EXECUTE FUNCTION gestion_copropriete_adresse_exclusivite_declencheur();

-- ⑥ le registre rempli pour toutes les copropriétés existantes (rejouable : le recalcul ne change rien à ce qui est déjà juste)
DO $f$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM gestion_copropriete ORDER BY id LOOP
    PERFORM gestion_copropriete_exclusivite_recalculer(c.id);
  END LOOP;
END
$f$;
