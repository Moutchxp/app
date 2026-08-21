-- 134_corps_altitude_plateau_nivellement.sql — N10-M : ALTITUDE DU PLATEAU DE NIVELLEMENT par bâtiment (NGF absolu).
--
-- CONTEXTE : le « plateau de nivellement » est le PLAN DE RÉFÉRENCE du nivellement à partir duquel le PLU mesure le gabarit
-- (article UV 3.2 du PLU de Paris). Il est lu sur les coupes/façades PAR POSITION, à la même méthode que la hauteur max PLU
-- (decisionGabaritPlu, N10-I). Sur 07512024V0037 le plateau le plus bas = 69 NGF ; le gabarit = plateau + 31 m (règle vérifiée).
--
-- ⚠️ CE N'EST PAS LE TERRAIN NATUREL. Le plateau de nivellement est une plateforme de référence, pas la cote du sol naturel —
-- ne JAMAIS écrire cette valeur dans altitude_terrain_naturel_ngf : les confondre serait une assimilation, pas une lecture.
-- Valeur écrite = le plateau LE PLUS BAS ; l'étendue (min→max) vit dans la réserve du journal.
--
-- SCHÉMA : CORPS SEUL, deux colonnes (valeur + origine), pattern habituel. NGF ABSOLU (comparable au gabarit et au sommet).
-- ADDITIVE PURE : deux ADD COLUMN IF NOT EXISTS (nullable, sans défaut), CHECK EN LIGNE. Bornes NGF [-50 ; 500] identiques à
-- altitude_sommet_ngf (lues au runtime par parserBornesCheck). Origine ∈ {saisie, extraite}. Aucun UPDATE/DROP/trigger.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/134_corps_altitude_plateau_nivellement.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS altitude_plateau_nivellement_ngf numeric
  CHECK (altitude_plateau_nivellement_ngf BETWEEN -50 AND 500);
ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS altitude_plateau_nivellement_ngf_origine text
  CHECK (altitude_plateau_nivellement_ngf_origine IN ('saisie', 'extraite'));

COMMENT ON COLUMN permis_corps_batiment.altitude_plateau_nivellement_ngf IS
  'N10-M — altitude du PLATEAU DE NIVELLEMENT (plan de référence du gabarit PLU, article UV 3.2), en NGF ABSOLU. Valeur = le plateau LE PLUS BAS ; l''étendue vit dans la réserve. NE PAS confondre avec le terrain naturel (altitude_terrain_naturel_ngf).';
COMMENT ON COLUMN permis_corps_batiment.altitude_plateau_nivellement_ngf_origine IS
  'N10-M — origine du plateau (''saisie'' | ''extraite''), posée AVEC la valeur (null ⇒ origine null).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> colonnes présentes (nullable, sans défaut) :'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'permis_corps_batiment' AND column_name LIKE 'altitude_plateau_nivellement%'
ORDER BY column_name;
\echo '>>> bornes NGF + liste fermée de l''origine :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'permis_corps_batiment'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%altitude_plateau_nivellement%';
