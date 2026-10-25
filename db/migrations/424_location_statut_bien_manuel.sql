-- 424_location_statut_bien_manuel.sql — LOCATION, SUIVI DU MOIS (Arno, 25/10/2026) : LE « STATUT DU BIEN » VALIDÉ À LA MAIN.
--
-- DÉCISION D'ARNO : « Clic sur la rubrique → les 5 statuts (Relocation gestion, Client hors gestion, Nouveau · gestion, Nouveau · sans
-- gestion, à qualifier) ; le statut calculé est proposé. Valider → statut manuel enregistré sur la transaction, journalisé ; il l'emporte
-- sur le calcul partout. Mention « validé par <nom> le <date> ». Bouton « Revenir au statut calculé ». Le statut manuel ne réécrit PAS
-- l'origine du contact ni la gestion. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `gestion_location_activite.statut_bien_manuel` : le statut validé (NULL : le calcul, comme aujourd'hui) ;
--   · `statut_bien_valide_le`, `statut_bien_valide_par` (le compte), `statut_bien_valide_par_libelle` (son nom au moment de la validation).
-- Chaque validation (et chaque retour au calcul) entre au journal (`gestion_journal`, entité `location_activite`), avec compte, session, écran.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`statutBienManuelDisponible`) : sans elle, la rubrique « Statut du bien » montre le statut
-- calculé et la modale dit que la mise à jour de la base est à appliquer (rien n'est écrit).

ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS statut_bien_manuel text;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS statut_bien_valide_le timestamptz;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS statut_bien_valide_par bigint;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS statut_bien_valide_par_libelle text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_statut_bien_manuel_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_statut_bien_manuel_chk
      CHECK (statut_bien_manuel IS NULL OR statut_bien_manuel IN ('relocation', 'client_hors_gestion', 'nouveau_gestion', 'nouveau_sans_gestion', 'a_qualifier'));
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_activite.statut_bien_manuel IS
  'Statut du bien validé à la main (424) : l''emporte sur le calcul partout. NULL : le statut calculé (origine du contact, gestion).';
COMMENT ON COLUMN gestion_location_activite.statut_bien_valide_le IS 'Quand le statut du bien a été validé à la main (424).';
COMMENT ON COLUMN gestion_location_activite.statut_bien_valide_par IS 'Le compte (admin_utilisateur.id) qui a validé le statut du bien (424).';
COMMENT ON COLUMN gestion_location_activite.statut_bien_valide_par_libelle IS 'Le nom du compte au moment de la validation (424).';
