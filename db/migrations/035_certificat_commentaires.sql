-- 035_certificat_commentaires.sql — CORRIGE deux commentaires trompeurs de colonnes de `certificat` (031).
--
-- MOTIF : `certificat` documente un document qui FAIT FOI → un commentaire de schéma qui ment sur la PROVENANCE
--   d'une colonne est une dette qui vieillit mal. Deux colonnes sont concernées :
--     • annee_batiment : la 031 la décrit « année BD TOPO du bâtiment » (commentaire INLINE dans le CREATE TABLE,
--       031:109). C'est FAUX — `bdtopo_batiment` ne porte AUCUNE colonne d'année. La source réelle est
--       `bdnb_annee_batiment.annee_construction` (BDNB), jointe par `cleabs` au bâtiment d'origine (cf. émission
--       Lot 4, `app/lib/db/certificatEmission.ts`).
--     • tolerance_m : la 031 ne lui pose AUCUN commentaire (031:104) ; son nom seul est trompeur (on pourrait la
--       confondre avec la tolérance de snap d'origine). Elle porte en réalité le SEUIL DE VERDICT (40 m).
--   Aucun de ces deux commentaires n'existe aujourd'hui dans le CATALOGUE (les seuls COMMENT ON COLUMN de la 031
--   visent analyse_photo et config_empreinte) : cette migration les AJOUTE, elle n'en écrase aucun. On corrige la
--   documentation, on NE RENOMME PAS (un RENAME sortirait du strictement additif et imposerait un changement de code).
--
-- PORTÉE : `COMMENT ON COLUMN` sur `certificat` UNIQUEMENT (2 colonnes). Purement additif, sans effet sur les
--   données ni sur le plan d'exécution. Aucune colonne modifiée, aucune contrainte, aucun index, aucun DROP, aucun
--   RENAME, aucune donnée touchée. Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé.
--
-- ROLLBACK (cas particulier — à lire) : « revenir en arrière » signifie RETIRER ces commentaires CORRECTS
--   (COMMENT ... IS NULL vide le commentaire de catalogue). On NE restaure PAS d'ancien commentaire de catalogue :
--   il n'y en avait pas. Après rollback, la seule trace documentaire redevient le commentaire INLINE FAUX
--   (« BD TOPO ») figé dans le fichier 031 — donc rollback = retour à l'état trompeur. À n'exécuter que sciemment :
--     COMMENT ON COLUMN certificat.annee_batiment IS NULL;   -- (retire la correction ; à n'exécuter que sciemment)
--     COMMENT ON COLUMN certificat.tolerance_m    IS NULL;   -- (idem)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/035_certificat_commentaires.sql
-- Vérification (relit les deux commentaires depuis le catalogue) :
--   SELECT a.attname AS colonne, col_description('certificat'::regclass, a.attnum) AS commentaire
--     FROM pg_attribute a
--    WHERE a.attrelid = 'certificat'::regclass AND a.attname IN ('annee_batiment', 'tolerance_m')
--    ORDER BY a.attname;

BEGIN;

COMMENT ON COLUMN certificat.annee_batiment IS
  'Année de construction du bâtiment d''origine. SOURCE : bdnb_annee_batiment.annee_construction (BDNB), jointe par cleabs au bâtiment d''origine (bdtopo_batiment). PAS « BD TOPO » : bdtopo_batiment ne porte aucune année. NULL si le cleabs est absent de la BDNB. ⚠️ Provenance NON gravée : un basculement de BDNB vers les données APUR est envisagé pour le 92 — un futur certificat pourrait tirer cette année d''une autre source.';

COMMENT ON COLUMN certificat.tolerance_m IS
  'Seuil de verdict appliqué par le certificat : le 1er obstacle réel à >= cette distance rend le logement SANS_VIS_A_VIS (40 m = THRESHOLD_M, app/lib/svv/config.ts). C''est la RÈGLE que le document applique. N''EST PAS la tolérance de snap du point d''origine (ORIGIN_SNAP_TOLERANCE_M) — mécanique interne, absente du document. Nom de colonne « tolerance_m » historique et trompeur, conservé : un RENAME sortirait du strictement additif.';

COMMIT;
