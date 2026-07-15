-- 036_acheminement_carte_orientation.sql — DÉPLACE la clé de la carte d'orientation vers l'acheminement (mutable).
--
-- MOTIF (décision prise) : la 031 a posé `carte_orientation_cle` sur `certificat` (table IMMUABLE). Erreur de
--   placement. La carte d'orientation n'est PAS une preuve : c'est un RENDU (un dessin) de données DÉJÀ figées sur
--   le certificat (lat, lon, azimut) — exactement comme le PDF, lui aussi un rendu, dont la clé vit déjà sur
--   `certificat_acheminement.pdf_cle`. Conséquence de l'erreur : sur une table immuable, si le service IGN hoquette
--   à l'instant de l'émission, le certificat part SANS carte et n'en aura JAMAIS. Faire dépendre un document qui
--   fait foi de la météo d'un serveur tiers est une fragilité qu'on ne s'impose pas. Côté acheminement (MUTABLE),
--   la carte est RE-FABRICABLE. (La PHOTO, elle, est une vraie preuve dérivable de rien : elle RESTE sur `certificat`.)
--
-- PORTÉE : (1) ADD COLUMN additif idempotent `carte_orientation_cle` sur `certificat_acheminement` (jumelle de
--   pdf_cle : text nullable) ; (2) COMMENT sur la nouvelle colonne ; (3) COMMENT marquant VESTIGIALE l'ancienne
--   `certificat.carte_orientation_cle`. AUCUNE donnée touchée, aucun DROP, aucun RENAME, aucun ALTER destructif,
--   aucune contrainte, aucun index (aucune requête ne filtre par cette clé → un index serait du poids sans usage).
--   Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé. Aucun changement de code dans ce lot :
--   l'écriture de la clé côté acheminement (génération de la carte) viendra dans un lot dédié.
--
--   « VESTIGIALE » = vocabulaire du projet (docs/SPEC_M1_edition_config.md:10,49 ; docs/SPEC_banc_essai_M5.md:24) :
--   colonne présente en base, CONSERVÉE, mais JAMAIS écrite ni consultée. On ne la retire pas (règle « aucun DROP »).
--
-- node-pg : `text` → STRING côté JS (trivial), comme pdf_cle.
--
-- ROLLBACK (non destructif de données — la nouvelle colonne est vide à ce stade ; à n'exécuter que sciemment) :
--   ALTER TABLE certificat_acheminement DROP COLUMN IF EXISTS carte_orientation_cle;  -- (à n'exécuter que sciemment)
--   COMMENT ON COLUMN certificat.carte_orientation_cle IS NULL;                       -- (retire la marque VESTIGIALE)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/036_acheminement_carte_orientation.sql
-- Vérification (relit la nouvelle colonne + le commentaire vestigial depuis le catalogue) :
--   SELECT (a.attrelid::regclass)::text AS "table", a.attname AS colonne,
--          col_description(a.attrelid, a.attnum) AS commentaire
--     FROM pg_attribute a
--    WHERE (a.attrelid = 'certificat_acheminement'::regclass AND a.attname = 'carte_orientation_cle')
--       OR (a.attrelid = 'certificat'::regclass                AND a.attname = 'carte_orientation_cle')
--    ORDER BY "table";

BEGIN;

-- (1) Jumelle de pdf_cle, côté acheminement MUTABLE.
ALTER TABLE certificat_acheminement
  ADD COLUMN IF NOT EXISTS carte_orientation_cle text;

-- (2) Rôle de la nouvelle colonne.
COMMENT ON COLUMN certificat_acheminement.carte_orientation_cle IS
  'Clé d''objet MinIO de la carte d''orientation (rendu du faisceau/azimut) ; NULL tant que non générée. JUMELLE de pdf_cle : deux RENDUS d''une donnée déjà figée sur le certificat (lat, lon, azimut), côté acheminement (MUTABLE) donc RE-FABRICABLES. Un raté du service IGN à l''émission ne prive donc jamais définitivement le certificat de sa carte.';

-- (3) L'ancienne colonne de la 031 devient VESTIGIALE.
COMMENT ON COLUMN certificat.carte_orientation_cle IS
  'VESTIGIALE — colonne INUTILISÉE, JAMAIS écrite. La carte d''orientation est un RENDU (dessin de lat/lon/azimut déjà portés par le certificat), pas une preuve → sa clé vit désormais sur certificat_acheminement.carte_orientation_cle (table MUTABLE, rendu re-fabricable, comme pdf_cle). Placée ici par erreur en 031, sur une table IMMUABLE : un raté du service IGN à l''émission aurait privé le document de carte À VIE. Conservée seulement parce que « aucun DROP » interdit de la retirer ; ne rien écrire ici. (La photo, vraie preuve dérivable de rien, RESTE sur certificat.)';

COMMIT;
