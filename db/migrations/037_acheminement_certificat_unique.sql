-- 037_acheminement_certificat_unique.sql — UN CERTIFICAT, UN SEUL ACHEMINEMENT (unicité de certificat_acheminement.certificat_id).
--
-- MOTIF : `certificat_acheminement.certificat_id` ne porte qu'un INDEX NON UNIQUE (`certificat_acheminement_certificat_idx`,
--   031:168) — il accélère les lectures mais n'INTERDIT rien. La règle « un certificat, un acheminement » ne tient
--   aujourd'hui que par le FLUX DE CONTRÔLE : l'INSERT de l'acheminement se fait dans la MÊME transaction que l'INSERT
--   du certificat, et les chemins idempotents (certificat déjà émis, course 23505 sur certificat_projet_unique)
--   renvoient l'existant SANS entrer dans cette transaction → jamais de seconde ligne. Ce flux est correct et sans
--   faille exploitable AUJOURD'HUI. Mais une garantie disciplinaire n'est pas une garantie structurelle : du code
--   futur inséré HORS de ce flux (script, autre route) créerait un doublon sans que la base s'y oppose. On rend la
--   règle STRUCTURELLE.
--
-- MÉCANISME RETENU (= patron 034, aucune raison de s'en écarter) : on AJOUTE une contrainte `UNIQUE (certificat_id)`
--   nommée `certificat_acheminement_certificat_unique`, À CÔTÉ de l'index existant — on ne le remplace PAS. « Aucun
--   DROP » interdit de retirer `certificat_acheminement_certificat_idx` pour le convertir en index unique. La contrainte
--   crée son PROPRE index unique (backing index) ; l'ancien index non unique devient techniquement redondant pour les
--   lectures, mais on le LAISSE en place (sa suppression, si un jour souhaitée, relèvera d'une migration SÉPARÉE et
--   DÉLIBÉRÉE, jamais de celle-ci). Contrainte plutôt qu'un simple CREATE UNIQUE INDEX : c'est l'objet DÉCLARATIF de la
--   règle métier (visible/nommable/commentable via COMMENT ON CONSTRAINT), cohérent avec certificat_projet_unique (034).
--   Idempotence par garde sur pg_constraint (ADD CONSTRAINT n'a pas d'IF NOT EXISTS natif), comme la 034.
--
-- PÉRIMÈTRE : ALTER TABLE additif idempotent sur `certificat_acheminement` UNIQUEMENT. Aucun DROP, aucun ALTER
--   destructif, aucune donnée touchée, aucune colonne modifiée, aucun index existant retiré. Le moteur n'est ni
--   rappelé ni modifié → golden 29.107259068449615 inchangé. Aucun changement de code : le flux d'émission (Lot 5)
--   ouvre déjà l'acheminement dans la transaction ; cette contrainte est son filet.
--
-- RÈGLE MÉTIER (portée aussi en COMMENT ON CONSTRAINT) : un certificat n'a QU'UN acheminement. Un renvoi (re-génération
--   du PDF, nouvel envoi, changement de statut) MET À JOUR la ligne existante ; il n'en crée JAMAIS une seconde.
--
-- node-pg : aucune nouvelle colonne, aucun impact de typage côté JS. Une violation remonte en erreur `23505`
--   (unique_violation), à traiter comme « acheminement déjà ouvert pour ce certificat ».
--
-- ROLLBACK (non destructif de données ; à n'exécuter que sciemment, hors process nominal) :
--   ALTER TABLE certificat_acheminement DROP CONSTRAINT IF EXISTS certificat_acheminement_certificat_unique;  -- (à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/037_acheminement_certificat_unique.sql
--
-- ⚠️ Vérification — DOUBLONS À CONTRÔLER *AVANT* D'APPLIQUER (si la table en contient, l'ALTER échouera) :
--   SELECT certificat_id, count(*) AS n, array_agg(id ORDER BY id) AS lignes
--     FROM certificat_acheminement GROUP BY certificat_id HAVING count(*) > 1;
--   -- 0 ligne = pas de doublon, la migration passera. >= 1 ligne = résoudre AVANT (l'acheminement est MUTABLE :
--   --   fusionner/supprimer les doublons est possible, mais me remonter le cas plutôt que forcer).
--   -- État déduit sans exécution : AUCUN code n'insère dans `certificat_acheminement` à ce jour (l'ouverture par le
--   --   flux d'émission n'est pas committée/en service) → la table est vide, doublons impossibles. La requête
--   --   ci-dessus reste le contrôle de sûreté à lancer.
-- Vérification post-application : \d certificat_acheminement  (doit lister « certificat_acheminement_certificat_unique UNIQUE (certificat_id) »).

BEGIN;

-- Ajout idempotent SANS DROP (garde sur pg_constraint : ADD CONSTRAINT n'accepte pas IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificat_acheminement_certificat_unique' AND conrelid = 'certificat_acheminement'::regclass
  ) THEN
    ALTER TABLE certificat_acheminement ADD CONSTRAINT certificat_acheminement_certificat_unique UNIQUE (certificat_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT certificat_acheminement_certificat_unique ON certificat_acheminement IS
  'UN certificat, UN seul acheminement. Un renvoi (re-génération PDF, nouvel envoi, changement de statut) MET À JOUR la ligne existante ; il n''en crée jamais une seconde. Rend structurelle une règle jusqu''ici tenue par le seul flux d''émission (INSERT acheminement dans la transaction du certificat) : du code inséré hors de ce flux ne peut plus créer de doublon (23505).';

COMMIT;
