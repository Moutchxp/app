-- LOT 51 — marqueur « TESTÉ EN ANALYSE » (par DOSSIER / permis).
--
-- OBJET : un dossier INCOMPLET (donc en régime partiel actif) peut être rendu disponible dans « Analyse et projection » pour être
-- examiné, SANS lever le marqueur partiel — les relances à la mairie continuent (le suivi ne s'interrompt pas). C'est un ALLER-RETOUR
-- RÉVERSIBLE, PAS un changement de statut.
--
-- La PRÉSENCE d'une ligne = le dossier est « testé en analyse ». Effets (LOT 51-A/B, tous RÉVERSIBLES) :
--   • la file de projection (projectionFileRepo) OUVRE sa porte FIX-2 pour ce dossier (NOT EXISTS partiel actif OR EXISTS ce marqueur) ;
--   • le dossier DISPARAÎT de « En cours » (exclu de estEnCoursAffichee et du prédicat partagé ligneEnCoursASignaler) → exclusivité tenue.
-- Le retrait de la ligne (bouton « Retour en cours », OU relance envoyée depuis Analyse) remet le dossier dans « En cours ».
-- N'écrit JAMAIS demande.statut ni partiel_leve_le : la sortie DÉFINITIVE (clôture + arrêt des relances) est le LOT 51-C, distinct.
--
-- Aucun seuil / délai / durée introduit → AUCUN réglage config_veille (invariant « pilotage sans code » sans objet ici).
--
-- Appliquer À LA MAIN (non appliquée à la livraison) :
--   psql -v ON_ERROR_STOP=1 -f /Users/macbookprom4arnaud/sansvisavis/app/db/migrations/189_dossier_test_analyse.sql "$DATABASE_URL"

CREATE TABLE IF NOT EXISTS dossier_test_analyse (
  dossier_id bigint      PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  teste_le   timestamptz NOT NULL DEFAULT now(),  -- instant du « Tester en analyse » (traçabilité)
  par        text                                 -- e-mail de l'administrateur (traçabilité)
);

COMMENT ON TABLE dossier_test_analyse IS
  'LOT 51 — marqueur RÉVERSIBLE « testé en analyse » (par DOSSIER). Présence = le dossier incomplet est rendu visible dans « Analyse et projection » (porte FIX-2 ouverte) et RETIRÉ de « En cours », SANS lever le marqueur partiel (les relances continuent). Retrait = retour dans « En cours ». N''écrit NI demande.statut NI partiel_leve_le (la sortie définitive = LOT 51-C).';
