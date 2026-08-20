-- 130_corps_sommet_confirmation.sql — N10-C : marqueur de CONFIRMATION HUMAINE de l'altitude de sommet d'un bâtiment.
--
-- CONTEXTE : une valeur `origine='extraite'` est aujourd'hui indiscernable, qu'elle ait été EXAMINÉE par un humain ou non. Le
-- sommet est le seul champ injecté dans le futur polygone (il engage le verdict), donc le seul à porter cette distinction. On
-- ne crée PAS un troisième vocabulaire d'origine (`origine` reste 'saisie'|'extraite') : on ajoute un MARQUEUR ORTHOGONAL.
--   « à confirmer »  ≡  altitude_sommet_ngf_origine = 'extraite' ET altitude_sommet_ngf_confirme_le IS NULL.
--   confirmer  = poser confirme_le/confirme_par (la valeur et l'origine ne bougent pas — elle vient bien de l'extraction, mais
--                est désormais approuvée). Modifier à la main = écriture 'saisie' (le marqueur est alors remis à NULL, cf. repo).
--
-- ⚠️ PORTÉE : le SOMMET UNIQUEMENT (deux colonnes). Si un jour la confirmation doit s'étendre à d'autres champs, NE PAS empiler
--   des paires de colonnes : créer une petite table (corps_id, champ, confirme_le, confirme_par). Deux colonnes aujourd'hui, pas
--   quatorze demain.
--
-- INVARIANT PROTÉGÉ (côté code) : `ecrireCorps` ignore déjà une valeur 'saisie' ; il ignore DÉSORMAIS aussi une valeur CONFIRMÉE
--   (un recompute n'efface jamais une décision humaine). Cette migration n'apporte que les colonnes ; la garde vit dans le repo.
--
-- ADDITIVE PURE : deux ADD COLUMN IF NOT EXISTS (nullable, sans défaut). Aucun UPDATE/DELETE/DROP, aucun trigger, aucune valeur
--   modifiée. Ne touche ni le moteur de score ni aucune autre table.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/130_corps_sommet_confirmation.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS altitude_sommet_ngf_confirme_le timestamptz;
ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS altitude_sommet_ngf_confirme_par text;

COMMENT ON COLUMN permis_corps_batiment.altitude_sommet_ngf_confirme_le IS
  'N10-C — instant de la CONFIRMATION HUMAINE du sommet extrait (NULL = jamais examiné → « à confirmer »). Orthogonal à l''origine (qui reste ''extraite''). Une valeur confirmée n''est plus écrasée par un recompute (garde ecrireCorps).';
COMMENT ON COLUMN permis_corps_batiment.altitude_sommet_ngf_confirme_par IS
  'N10-C — auteur de la confirmation (trace « confirmée par X le … »). Remis à NULL dès qu''une saisie manuelle remplace la valeur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> colonnes de confirmation présentes (nullable, sans défaut) :'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'permis_corps_batiment' AND column_name LIKE 'altitude_sommet_ngf_confirme%'
ORDER BY column_name;
\echo '>>> aucune ligne confirmée d''office (marqueur vide partout) :'
SELECT count(*) FILTER (WHERE altitude_sommet_ngf_confirme_le IS NOT NULL) AS deja_confirmees FROM permis_corps_batiment;
