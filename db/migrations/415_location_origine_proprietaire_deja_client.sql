-- 415_location_origine_proprietaire_deja_client.sql — LOCATION « SUIVI COMMERCIAL » (Arno, 24/10/2026) : L'ORIGINE DU CONTACT
-- « PROPRIÉTAIRE DÉJÀ CLIENT ». Suite de la 411 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « “Origine du contact propriétaire” : ajouter le choix “Propriétaire déjà client” (propriétaire déjà dans notre
-- portefeuille qui nous confie un nouveau bien en gestion), placé juste après “Relocation (portefeuille de gestion)”. »
--
-- CE QU'ELLE FAIT : la liste admise de `gestion_location_activite.origine_contact` (contrainte nommée de la 411) reçoit la valeur
-- « proprietaire_deja_client » — la contrainte est retirée puis reposée, élargie ; les valeurs déjà admises le restent. Aucune ligne
-- n'est modifiée. IDEMPOTENTE (rejouable : reposée seulement si la valeur manque). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe
-- dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`origineDejaClientDisponible`) : sans elle, le choix n'est pas proposé.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_origine_contact_liste_chk'
                  AND pg_get_constraintdef(oid) LIKE '%proprietaire_deja_client%') THEN
    ALTER TABLE gestion_location_activite DROP CONSTRAINT IF EXISTS gestion_location_activite_origine_contact_liste_chk;
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_origine_contact_liste_chk
      CHECK (origine_contact IS NULL OR origine_contact IN
        ('collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'proprietaire_deja_client', 'passage_agence', 'campagne', 'personnalise'));
  END IF;
END $$;
