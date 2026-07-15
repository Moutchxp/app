-- 038_certificat_jeton_verification.sql — JETON DE VÉRIFICATION du certificat (garde du document PAPIER).
--
-- MOTIF (recon lot 6, trou n°1) : rien ne protège le PAPIER. Le `numero` est SÉQUENTIEL donc ÉNUMÉRABLE
--   (SAVV-2026-000001, 000002, …) : une page publique qui rendrait des détails sur simple présentation d'un numéro
--   serait un aspirateur à données. Décision produit : le document porte un QR encodant `numero` + un JETON OPAQUE.
--   Sans jeton → « ce numéro existe », rien de plus ; avec jeton (donc en TENANT le document) → les détails, et une
--   fraude (numéro recopié sans le bon jeton) saute aux yeux. Le jeton n'est PAS un secret (il vit sur un papier
--   distribué) : il ne fait qu'UNE chose — distinguer « je tiens le document » de « j'ai deviné un numéro ».
--
-- COLONNE : `certificat.jeton_verification text NOT NULL`, SANS DEFAULT.
--   • NOT NULL : un certificat sans jeton est INVÉRIFIABLE, donc n'est pas un certificat. La table est VIDE
--     (0 ligne, cf. Vérification) → l'ADD NOT NULL passera. ⚠️ Assumé : ceci CASSE l'émission entre l'application de
--     cette migration et le commit du code qui tire le jeton — rien n'est en production.
--   • SANS DEFAULT : un jeton se TIRE AU SORT par le code (aléa cryptographique), jamais par le schéma.
--
-- FORMAT (inguessable + saisissable à la main si le QR échoue) : 16 caractères en Crockford Base32 — alphabet
--   0-9 A-Z PRIVÉ de I, L, O, U (caractères ambigus à la lecture/saisie), non ambigu, insensible à la casse en
--   entrée (canonique = MAJUSCULES en base). 16 symboles × 5 bits = 80 BITS d'entropie (= 10 octets aléatoires
--   encodés, sans padding). 2^80 ≈ 1,2e24 : le brute-force en ligne d'un numéro donné est infaisable même SANS
--   se reposer sur le rate-limiting du point de vérification (marge : 65 bits suffiraient déjà). L'alphabet non
--   ambigu prime sur un gain de 2 caractères — quelqu'un tapera l'URL à la main un jour.
--
-- CHECK : OUI (inline, comme `numero` en 031:73). Le format est un CONTRAT du document qui fait foi ; un CHECK est
--   l'assurance qu'un jeton mal formé (bug de génération, mauvaise longueur, caractère hors alphabet) n'atterrisse
--   JAMAIS sur un certificat. Classe = Crockford Base32 : [0-9 A-H J K M N P-T V-Z] (I, L, O, U EXCLUS), exactement 16.
--   (La NORMALISATION d'une saisie manuelle — casse, I→1, L→1, O→0 — relève du CODE de la route de vérification,
--    pas du schéma : la base stocke la forme canonique majuscule.)
--
-- PÉRIMÈTRE : ADD COLUMN additif idempotent sur `certificat` UNIQUEMENT. Aucun DROP, aucun ALTER destructif, aucune
--   donnée touchée. Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé. Aucun changement de
--   code : la génération du jeton à l'émission + la route de vérification publique viennent dans des lots dédiés.
--
-- PAS D'INDEX (délibéré) : la vérification cherche par `numero` (déjà NOT NULL UNIQUE → indexé), lit LA ligne, puis
--   COMPARE le jeton en code. Le jeton n'est JAMAIS un critère de recherche (même `WHERE numero=$1 AND
--   jeton_verification=$2` passe par l'index unique de `numero` et filtre une seule ligne) → un index serait du
--   poids sans usage.
--
-- ROLLBACK (non destructif ; table vide, colonne nouvelle ; à n'exécuter que sciemment, hors process nominal) :
--   ALTER TABLE certificat DROP COLUMN IF EXISTS jeton_verification;   -- (DDL, non bloqué par le trigger d'immuabilité de lignes)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/038_certificat_jeton_verification.sql
--
-- ⚠️ Vérification — TABLE VIDE À CONFIRMER *AVANT* D'APPLIQUER (un NOT NULL sans default sur une table peuplée échoue) :
--   SELECT count(*) AS lignes FROM certificat;   -- doit valoir 0 ; sinon NE PAS lancer, me remonter le cas.
-- Vérification post-application : \d certificat  (colonne `jeton_verification text NOT NULL` + le CHECK de format).

BEGIN;

ALTER TABLE certificat
  ADD COLUMN IF NOT EXISTS jeton_verification text NOT NULL
    CHECK (jeton_verification ~ '^[0-9A-HJKMNP-TV-Z]{16}$');

COMMENT ON COLUMN certificat.jeton_verification IS
  'Jeton de vérification porté par le QR du certificat (avec le numero). N''EST PAS un secret (il vit sur un papier distribué), NI une authentification, NI une clé d''API : c''est un DISCRIMINANT entre « je tiens le document » et « j''ai deviné un numéro séquentiel ». Vérification publique : chercher par numero (UNIQUE) puis comparer ce jeton — sans jeton → « ce numéro existe » ; avec jeton → les détails. Inguessable (16 car. Crockford Base32, alphabet sans I/L/O/U, 80 bits) car il remplace le secret. Tiré au sort par le code, jamais un DEFAULT SQL.';

COMMIT;
