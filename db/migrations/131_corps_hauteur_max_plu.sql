-- 131_corps_hauteur_max_plu.sql — N10-E : HAUTEUR MAXIMALE PLU par bâtiment (limite administrative, en NGF absolu).
--
-- CONTEXTE : la limite de hauteur du PLU est le repère d'Arno pour trancher vite (voir d'un coup d'œil l'écart entre la hauteur
-- retenue et ce que le PLU autorise). Mesure (N10-E) : cette donnée n'existe NULLE PART aujourd'hui ; « hauteur maximale PLU » est
-- une simple entrée de LÉGENDE sur les plans (aucune cote attachée, aucun rattachement à un bâtiment), absente de l'autre permis ;
-- le Géoportail de l'urbanisme n'expose PAS la règle de hauteur (elle vit dans le RÈGLEMENT ÉCRIT). → SAISIE HUMAINE d'abord ;
-- l'extraction ('extraite') restera possible plus tard sans changer le schéma.
--
-- SCHÉMA (décision Arno) : CORPS SEUL, deux colonnes (valeur + origine), comme les autres champs de bâtiment. Pas de niveau permis :
-- la doctrine « pas de répartition au jugé » vise LA MACHINE, pas l'utilisateur — Arno tapant la même limite sur deux bâtiments
-- décide, il ne devine pas. NGF ABSOLU, pour être directement comparable à l'altitude de sommet retenue (un règlement en RELATIF est
-- converti à la main via l'altitude du plateau de nivellement, lisible sur la coupe). Si la saisie devient pénible à plusieurs
-- bâtiments, on ajoutera un bouton « appliquer à tous les bâtiments » — JAMAIS une colonne de plus.
--
-- ⚠️ On SIGNALE, on N'INTERDIT PAS : si la hauteur retenue dépasse la limite, l'écran le dit (un bâtiment peut légitimement dépasser
-- un gabarit — superstructures techniques) ; ce n'est pas à nous d'arbitrer le droit de l'urbanisme. Ici : juste les colonnes.
--
-- ADDITIVE PURE : deux ADD COLUMN IF NOT EXISTS (nullable, sans défaut), avec CHECK EN LIGNE (idempotents ; un CHECK passe sur NULL).
-- Bornes NGF [-50 ; 500] identiques à altitude_sommet_ngf (lues au runtime par parserBornesCheck → aucune plage recopiée dans le code).
-- Origine ∈ {saisie, extraite} comme toutes les colonnes *_origine. Aucun UPDATE/DROP/trigger, aucune valeur modifiée.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/131_corps_hauteur_max_plu.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS hauteur_max_plu_ngf numeric
  CHECK (hauteur_max_plu_ngf BETWEEN -50 AND 500);
ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS hauteur_max_plu_ngf_origine text
  CHECK (hauteur_max_plu_ngf_origine IN ('saisie', 'extraite'));

COMMENT ON COLUMN permis_corps_batiment.hauteur_max_plu_ngf IS
  'N10-E — limite de hauteur du PLU pour CE bâtiment, en NGF ABSOLU (comparable à l''altitude de sommet retenue). Un règlement exprimé en relatif est converti à la main via l''altitude du plateau de nivellement (sur la coupe). Saisie humaine ; extraction possible plus tard.';
COMMENT ON COLUMN permis_corps_batiment.hauteur_max_plu_ngf_origine IS
  'N10-E — origine de la hauteur max PLU (''saisie'' | ''extraite''), posée AVEC la valeur (null ⇒ origine null), comme les autres champs.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> colonnes présentes (nullable, sans défaut) :'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'permis_corps_batiment' AND column_name LIKE 'hauteur_max_plu%'
ORDER BY column_name;
\echo '>>> bornes NGF + liste fermée de l''origine (lues par parserBornesCheck) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'permis_corps_batiment'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%hauteur_max_plu%';
