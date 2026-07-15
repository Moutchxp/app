-- 039_certificat_reference.sql — RÉFÉRENCE PUBLIQUE du certificat (identifiant court, recopiable dans une annonce).
--
-- MOTIF : le modèle validé du certificat porte un TROISIÈME identifiant, distinct des deux existants :
--   • `numero` (SAVV-AAAA-NNNNNN) : interne, SÉQUENTIEL, déjà en base — pas destiné au public (énumérable).
--   • `jeton_verification` (16 car. Crockford, 038) : SECRET de vérification, jamais recopié tel quel.
--   • `reference` (SVAV-XXXX-XXXX) : PUBLIQUE, courte, ALÉATOIRE, NON SÉQUENTIELLE — « à reprendre dans le texte de
--     l'annonce immobilière, affichée sur la page de vérification » (commentaire du modèle). C'est CETTE colonne.
--   ⚠️ Préfixe `SVAV` (Sans Vis-A-Vis), DÉLIBÉRÉMENT différent de `SAVV` du numéro : deux identifiants, deux préfixes.
--
-- COLONNE : `certificat.reference text NOT NULL`, SANS DEFAULT.
--   • NOT NULL : un certificat sans référence publique n'est pas complet. La table est VIDE (0 ligne, cf. Vérification)
--     → l'ADD NOT NULL passera. ⚠️ Assumé : ceci CASSE l'émission entre l'application et le commit du code qui frappe
--     la référence — rien n'est en production.
--   • SANS DEFAULT : une référence se TIRE AU SORT par le code (CSPRNG), jamais par le schéma.
--
-- FORMAT : `SVAV-XXXX-XXXX` = préfixe + 2 groupes de 4 caractères Crockford Base32 (0-9 A-Z PRIVÉ de I, L, O, U —
--   non ambigu, la référence se tape à la main depuis une annonce). 8 symboles × 5 bits = 40 BITS d'entropie
--   (2^40 ≈ 1,1×10^12). L'unicité NE REPOSE PAS sur ces 40 bits seuls : la contrainte UNIQUE ci-dessous + un retry
--   côté code (nouvelle référence sur collision) la GARANTISSENT. Les 40 bits servent à rendre les collisions
--   RARISSIMES : la proba qu'une NOUVELLE référence heurte l'une des N déjà en base est N/2^40 (≈ 9×10^-7 à 1 M de
--   certificats), donc un retry est quasi jamais nécessaire — largement suffisant pour la durée de vie du produit
--   (certification géo-limitée : milliers à quelques millions de certificats sur des années). Format = celui du modèle.
--
-- CHECK : OUI (inline, comme `numero` en 031:73 et `jeton_verification` en 038). Le format est un CONTRAT d'un
--   document qui fait foi ; un CHECK garantit qu'une référence mal formée (bug de génération) n'atterrisse jamais.
--
-- CONTRAINTE UNIQUE (nommée `certificat_reference_unique`, garde d'idempotence sur pg_constraint — patron 034/037) :
--   c'est une CLÉ PUBLIQUE ; deux certificats ne peuvent pas la partager. Son index de support sert AUSSI la
--   recherche par référence sur la page de vérification (contrairement au jeton, la référence EST un critère de
--   recherche public) → l'index est justifié, pas du poids sans usage.
--
-- PÉRIMÈTRE : ADD COLUMN additif idempotent + ADD CONSTRAINT idempotent, sur `certificat` UNIQUEMENT. Aucun DROP,
--   aucun ALTER destructif, aucune donnée touchée. Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615
--   inchangé. La frappe de la référence à l'émission (+ retry sur collision) est câblée dans un lot de code séparé.
--
-- ROLLBACK (non destructif ; table vide, colonne/contrainte nouvelles ; à n'exécuter que sciemment) :
--   ALTER TABLE certificat DROP CONSTRAINT IF EXISTS certificat_reference_unique;
--   ALTER TABLE certificat DROP COLUMN IF EXISTS reference;   -- (DDL, non bloqué par le trigger d'immuabilité de lignes)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/039_certificat_reference.sql
--
-- ⚠️ Vérification — TABLE VIDE À CONFIRMER *AVANT* D'APPLIQUER (un NOT NULL sans default sur une table peuplée échoue) :
--   SELECT count(*) AS lignes FROM certificat;   -- doit valoir 0 ; sinon NE PAS lancer, me remonter le cas.
-- Vérification post-application : \d certificat  (colonne `reference text NOT NULL`, CHECK de format,
--   contrainte « certificat_reference_unique UNIQUE (reference) »).

BEGIN;

ALTER TABLE certificat
  ADD COLUMN IF NOT EXISTS reference text NOT NULL
    CHECK (reference ~ '^SVAV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$');

-- Unicité NOMMÉE, idempotente SANS DROP (garde sur pg_constraint : ADD CONSTRAINT n'accepte pas IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificat_reference_unique' AND conrelid = 'certificat'::regclass
  ) THEN
    ALTER TABLE certificat ADD CONSTRAINT certificat_reference_unique UNIQUE (reference);
  END IF;
END;
$$;

COMMENT ON COLUMN certificat.reference IS
  'Référence PUBLIQUE du certificat (SVAV-XXXX-XXXX, 8 car. Crockford, 40 bits, aléatoire NON séquentielle). Destinée à être recopiée dans une annonce immobilière et recherchée sur la page de vérification. DISTINCTE du numero interne (SAVV-…, séquentiel) et du jeton_verification (secret, 038). N''EST PAS un secret : elle peut sortir du serveur. Unicité garantie par certificat_reference_unique + retry côté code sur collision. Tirée au sort par le code (CSPRNG), jamais un DEFAULT SQL.';

COMMIT;
