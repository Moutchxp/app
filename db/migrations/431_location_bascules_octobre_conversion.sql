-- 431_location_bascules_octobre_conversion.sql — LOCATION (Arno, 26/10/2026) : DÉCISIONS DU DIAGNOSTIC CHALAH / REIFHI.
--
-- DÉCISIONS D'ARNO :
--   A. à partir du 1er octobre 2026, une annexe ne compte JAMAIS comme une gestion à part (Nouvelles gestions, +N/−N, portefeuille, prime) :
--      la date de bascule existante (`bascule_annexes_gestion`, migration 426) passe du 25/10 au 01/10/2026 — une NOUVELLE valeur, la plus
--      récente fait foi ; la valeur d'avant reste dans la table (en ajout seul).
--   B. un bien rentré VIDE entre dans le suivi à la date d'entrée de son PREMIER LOCATAIRE (plus à la création de la fiche), pour les
--      biens entrés en gestion à partir du 1er octobre 2026 : un nouveau paramètre daté, `bascule_entree_locataire` = 2026-10-01. Les mois
--      antérieurs ne bougent pas ; l'historique des transitions n'est jamais réécrit (la règle est appliquée à la LECTURE).
--   C. une ligne de suivi « Bail » se CONVERTIT en « Mandat de gestion seul » (locataire en place) : sa nature, sa date et ses honoraires
--      d'ORIGINE sont gardés (`*_origine`), avec qui et quand ; « Annuler la conversion » les remet. Chaque geste est journalisé.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · la liste fermée des clés de `gestion_location_parametre_date` reçoit `bascule_entree_locataire` (la contrainte est ÉLARGIE : toute
--     valeur acceptée avant l'est encore) ; deux valeurs posées, une fois chacune (rejouable) ;
--   · six colonnes NULL sur `gestion_location_activite` (aucune ligne modifiée).
-- Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction. IDEMPOTENTE.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, bascule des annexes au 25/10, entrée à la création de la fiche, et la
-- conversion d'une ligne s'affiche « disponible après la mise à jour ». Elle suppose la 426 (déjà en production).

ALTER TABLE gestion_location_parametre_date DROP CONSTRAINT IF EXISTS gestion_location_parametre_date_cle_check;
ALTER TABLE gestion_location_parametre_date ADD CONSTRAINT gestion_location_parametre_date_cle_check
  CHECK (cle IN ('bascule_annexes_gestion', 'bascule_entree_locataire'));

INSERT INTO gestion_location_parametre_date (cle, valeur, pose_par)
SELECT 'bascule_annexes_gestion', DATE '2026-10-01', 'migration 431 — décision d''Arno du 26/10/2026 (annexes : jamais une gestion à part dès octobre 2026)'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_parametre_date WHERE cle = 'bascule_annexes_gestion' AND valeur = DATE '2026-10-01');

INSERT INTO gestion_location_parametre_date (cle, valeur, pose_par)
SELECT 'bascule_entree_locataire', DATE '2026-10-01', 'migration 431 — décision d''Arno du 26/10/2026 (bien rentré vide : entrée au 1er locataire)'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_parametre_date WHERE cle = 'bascule_entree_locataire');

ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS converti_le timestamptz;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS converti_par_libelle text;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS type_origine text;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS date_signature_origine date;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS hono_proprietaire_ht_origine numeric;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS hono_locataire_ht_origine numeric;

COMMENT ON COLUMN gestion_location_activite.converti_le IS
  'Ligne « Bail » convertie en « Mandat de gestion seul » (locataire en place) ; la nature, la date et les honoraires d''origine sont dans *_origine (migration 431).';
