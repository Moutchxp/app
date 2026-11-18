-- 497_location_rdv_non_invites.sql — 🔴🔴 « ENVOYER L'INVITATION AUX LOCATAIRES : NON » GARDÉ POUR LE CRÉNEAU (Arno, 18/11/2026, 2e lot).
--
-- LA DÉCISION (Arno, 18/11/2026) : « En fixant ou en déplaçant un rendez-vous, on choisit À LA MAIN « Envoyer l'invitation aux locataires :
-- Oui / Non » […] Si les locataires n'ont pas été invités, le cartouche affiche « Locataires non invités », pas « En attente ». »
--
-- CE QU'ELLE FAIT : la liste des natures du journal `gestion_rdv_reponse` (495) reçoit `non_invite` (le choix « Non », daté, avec son auteur,
-- pour le créneau du rendez-vous). Le journal reste en AJOUT SEUL (triggers de la 495, inchangés) ; aucune ligne existante touchée.
-- Sans la 495 : ne fait rien. Sans la 497 : « Non » n'envoie rien aux locataires, mais le cartouche « Locataires non invités » ne s'affiche pas.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE (rejouée : la même contrainte, reposée à l'identique).

DO $$
BEGIN
  IF to_regclass('public.gestion_rdv_reponse') IS NULL THEN
    RAISE NOTICE '497 : gestion_rdv_reponse absente (migration 495 non appliquée) — rien à faire';
    RETURN;
  END IF;
  ALTER TABLE gestion_rdv_reponse DROP CONSTRAINT IF EXISTS gestion_rdv_reponse_nature_check;
  ALTER TABLE gestion_rdv_reponse ADD CONSTRAINT gestion_rdv_reponse_nature_check
    CHECK (nature IN ('accepte', 'refuse', 'validation_main', 'annulation_validation', 'notifie_confirme', 'notifie_refus', 'non_invite'));
END $$;
