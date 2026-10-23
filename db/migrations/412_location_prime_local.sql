-- 412_location_prime_local.sql — LOCATION « SUIVI COMMERCIAL » (Arno, 24/10/2026) : LA PRIME DE NOUVELLE GESTION D'UN « LOCAL ».
-- Suite de la 406 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « Prime de nouvelle gestion : ajouter le choix “Local” (local commercial ou bureaux), dont la prime de première
-- location est aussi de 150 €. Choix : Logement · Local · Parking. […] barème versionné (Local = 150 €, non rétroactif). »
--
-- CE QU'ELLE FAIT, EN AJOUT (aucune ligne existante n'est modifiée ni supprimée) :
--   · la colonne `gestion_location_commission_regle.prime_gestion_local` (montant en euros, NULL permis). Les versions existantes
--     restent VIDES : un local s'y lit au montant du logement — exactement ce qu'il comptait jusqu'ici (il était classé logement).
--     NON RÉTROACTIF : un montant local propre se pose par une NOUVELLE version (roue Paramètres Location › Commissions), à sa date ;
--   · la valeur « local » admise dans `gestion_location_activite.categorie_prime` (contrainte de la 406 retirée puis reposée,
--     élargie — les valeurs déjà admises le restent).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`primeLocalDisponible`) : sans elle, « Local » s'enregistre en « logement ».

ALTER TABLE gestion_location_commission_regle ADD COLUMN IF NOT EXISTS prime_gestion_local numeric(12,2);

DO $$
DECLARE c record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_commission_regle_prime_local_chk') THEN
    ALTER TABLE gestion_location_commission_regle ADD CONSTRAINT gestion_location_commission_regle_prime_local_chk
      CHECK (prime_gestion_local IS NULL OR prime_gestion_local >= 0);
  END IF;
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'gestion_location_activite'::regclass AND con.contype = 'c'
       AND (pg_get_constraintdef(con.oid) LIKE '%(categorie_prime = ANY%' OR pg_get_constraintdef(con.oid) LIKE '%categorie_prime IN%')
       AND con.conname <> 'gestion_location_activite_categorie_prime_liste_chk'
  LOOP
    EXECUTE format('ALTER TABLE gestion_location_activite DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_categorie_prime_liste_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_categorie_prime_liste_chk
      CHECK (categorie_prime IS NULL OR categorie_prime IN ('logement', 'local', 'parking'));
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_commission_regle.prime_gestion_local IS
  'Prime de nouvelle gestion d''un LOCAL (local commercial, bureaux) — 412, Arno 24/10/2026. NULL : le montant du logement de la même version.';
