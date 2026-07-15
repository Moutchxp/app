-- 032_internaute_projet_photo.sql — CLÉ D'OBJET (stockage MinIO) de la PHOTO, sur internaute_projet (bloc C).
--
-- MOTIF : la photo du tunnel est déposée dans le STOCKAGE OBJET (MinIO/S3) — jamais en base (invariant projet :
--   « photos/PDF jamais en base ; la base ne garde que les URL/métadonnées »). Il faut donc, PAR ANALYSE, garder la
--   RÉFÉRENCE (clé d'objet) vers cette photo. Décision d'architecture (OPTION B) : le dépôt a lieu à la SOUMISSION
--   de l'Écran A, quand projet + internaute + jeton EXISTENT → la clé est rattachée AU PROJET (déjà scopé à
--   l'internaute via le jeton, garde IDOR). Pas d'objet orphelin : un internaute non consentant n'a jamais de
--   projet, donc jamais de photo à référencer.
--
-- PÉRIMÈTRE : ALTER TABLE additif idempotent sur `internaute_projet` UNIQUEMENT. Aucune autre table, aucun
--   DROP/DELETE, aucune colonne existante modifiée. Colonne NULLABLE : une analyse SANS photo reste parfaitement
--   valide (le verdict est 100 % géométrique). Lignes EXISTANTES → NULL. Le moteur n'est ni rappelé ni modifié →
--   golden 29.107259068449615 inchangé.
--
-- node-pg : `text` → STRING côté JS (trivial, aucune coercition). La colonne contient une CLÉ D'OBJET
--   (ex. `internautes/<uuid>/photos/<uuid>.jpg`), JAMAIS l'image ni une URL signée (celle-ci se calcule à la
--   demande, à durée limitée). Le fichier vit dans le stockage objet ; la base ne garde que la référence.
--
-- INDEX : AUCUN. Aucune requête ne cherche un projet PAR sa clé photo ; la clé est toujours lue AVEC la ligne
--   projet (accès par `id` / `internaute_id`, déjà indexés). Un index serait du poids sans usage.
--
-- ROLLBACK (non destructif de données ; à n'exécuter que sciemment, hors process nominal) :
--   ALTER TABLE internaute_projet DROP COLUMN IF EXISTS photo_cle;   -- (à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/032_internaute_projet_photo.sql
-- Vérification : \d internaute_projet (colonne `photo_cle`) ;
--   SELECT count(*) FILTER (WHERE photo_cle IS NOT NULL) AS avec_photo, count(*) AS total FROM internaute_projet;

BEGIN;

ALTER TABLE internaute_projet
  ADD COLUMN IF NOT EXISTS photo_cle text;

COMMENT ON COLUMN internaute_projet.photo_cle IS
  'Clé d''objet MinIO de la photo du tunnel (ex. internautes/<uuid>/photos/<uuid>.jpg). RÉFÉRENCE uniquement — JAMAIS l''image ni une URL signée. NULL = analyse sans photo. Le fichier vit dans le stockage objet ; la base ne garde que la clé.';

COMMIT;
