-- 033_internaute_projet_mode_origine.sql — MODE D'ORIGINE utilisé, sur internaute_projet (bloc C).
--
-- MOTIF : `mode` (ModeOrigine = 'semi_auto' | 'manuel', app/lib/svv/config.ts:135) est une ENTRÉE du pipeline
--   d'analyse qui n'était persistée NULLE PART. `semi_auto` SNAPPE le point d'origine sur la façade (≤ 1 m) ;
--   `manuel` le prend TEL QUEL (app/lib/db/origine.ts:60,102). Le certificat RE-DÉRIVE le résultat côté serveur à
--   l'émission : sans ce mode, un re-jeu avec le défaut `semi_auto` produirait une origine, une altitude, un verdict
--   et un score potentiellement DIFFÉRENTS de ce que l'internaute a vu si son analyse avait utilisé `manuel`. Cette
--   colonne rend la re-dérivation FIDÈLE (elle rejoue avec le mode réellement employé).
--
-- PÉRIMÈTRE : ALTER TABLE additif idempotent sur `internaute_projet` UNIQUEMENT. Aucune autre table, aucun
--   DROP/DELETE, aucune colonne existante modifiée. Colonne NULLABLE, SANS DEFAULT. Lignes EXISTANTES → NULL :
--   leur mode est INCONNU (antérieur à cette migration) → le re-jeu N'EST PAS garanti fidèle pour elles. On NE met
--   PAS `DEFAULT 'semi_auto'` : ce serait affirmer rétroactivement une valeur qu'on ne connaît pas — exactement
--   l'erreur qu'on cherche à éviter. Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé.
--
-- CHECK : liste FERMÉE des valeurs RÉELLES de ModeOrigine ('semi_auto', 'manuel'), NULL autorisé (même patron que
--   internaute_projet.verdict). Le CÂBLAGE (écriture du mode par le tunnel) N'EST PAS dans ce lot : la colonne
--   d'abord, le branchement ensuite (autre chantier, autre commit).
--
-- node-pg : `text` → STRING côté JS (trivial). Ni index, ni contrainte d'unicité : AUCUNE requête ne filtre par
--   `mode_origine` (il est lu AVEC la ligne projet, accès par `id`/`internaute_id` déjà indexés) → un index serait
--   du poids sans usage.
--
-- ROLLBACK (non destructif de données ; à n'exécuter que sciemment, hors process nominal) :
--   ALTER TABLE internaute_projet DROP COLUMN IF EXISTS mode_origine;   -- (à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/033_internaute_projet_mode_origine.sql
-- Vérification : \d internaute_projet (colonne `mode_origine`) ;
--   SELECT mode_origine, count(*) FROM internaute_projet GROUP BY mode_origine;

BEGIN;

ALTER TABLE internaute_projet
  ADD COLUMN IF NOT EXISTS mode_origine text
    CHECK (mode_origine IS NULL OR mode_origine IN ('semi_auto', 'manuel'));

COMMENT ON COLUMN internaute_projet.mode_origine IS
  'Mode d''origine utilisé à l''analyse (ModeOrigine) : ''semi_auto'' = point snappé sur la façade (≤ 1 m) ; ''manuel'' = point pris tel quel. Entrée du pipeline nécessaire à une re-dérivation FIDÈLE du certificat. NULL = mode INCONNU (ligne antérieure à cette migration) → re-jeu non garanti fidèle. Aucun DEFAULT : on n''affirme pas rétroactivement une valeur inconnue.';

COMMIT;
