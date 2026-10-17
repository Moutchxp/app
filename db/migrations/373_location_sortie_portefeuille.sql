-- 373_location_sortie_portefeuille.sql — TUILE LOCATION (refonte de l'accueil, Arno, 17/10/2026) : « SUPPRIMER » =
-- SORTIR DU PORTEFEUILLE, JAMAIS UN EFFACEMENT.
--
-- LE BESOIN (Arno) : « “Supprimer” = SORTIR DU PORTEFEUILLE, jamais un effacement en base (personnes et biens sont
-- communs avec la Gestion : historique, mails, tâches doivent rester). Confirmation obligatoire ; la fiche quitte les
-- listes actives et la recherche, reste consultable dans “Anciens” et peut être réactivée ; date et auteur journalisés. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : deux colonnes facultatives — `sorti_portefeuille_le` (quand) et
-- `sorti_portefeuille_par` (qui) — sur les propriétaires, les locataires et les biens. Vides = dans le portefeuille.
-- Une réactivation les remet à vide ; chaque geste laisse sa ligne dans `gestion_journal` (append-only).
-- Elles ne sont lues QUE par la tuile Location : l'affichage de la Gestion ne change pas.
-- AUCUNE ligne existante n'est modifiée ; rien n'est supprimé.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_proprietaire
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_le timestamptz,
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_par text;
ALTER TABLE gestion_annuaire_locataire
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_le timestamptz,
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_par text;
ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_le timestamptz,
  ADD COLUMN IF NOT EXISTS sorti_portefeuille_par text;

COMMENT ON COLUMN gestion_annuaire_proprietaire.sorti_portefeuille_le IS 'Sorti du portefeuille (tuile Location) : jamais effacé, réactivable ; vide = dans le portefeuille (migration 373).';
COMMENT ON COLUMN gestion_annuaire_locataire.sorti_portefeuille_le IS 'Sorti du portefeuille (tuile Location) : jamais effacé, réactivable ; vide = dans le portefeuille (migration 373).';
COMMENT ON COLUMN gestion_annuaire_lot.sorti_portefeuille_le IS 'Sorti du portefeuille (tuile Location) : jamais effacé, réactivable ; vide = dans le portefeuille (migration 373).';
