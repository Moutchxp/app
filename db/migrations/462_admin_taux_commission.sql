-- 462_admin_taux_commission.sql — MON ESPACE (Arno, 07/11/2026) : LE TAUX DE COMMISSION D'UN COLLABORATEUR, DANS SON PROFIL.
--
-- LE BESOIN (Arno) : dans « Nouveau compromis », le taux de commission de chaque collaborateur s'applique à SA part des honoraires ; s'il
-- existe dans son profil, il pré-remplit le champ, qui reste modifiable pour ce compromis. Compris entre 0 et 100 %.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · une colonne `taux_commission` sur le compte — un pourcentage entre 0 et 100, ou NULL (non renseigné : le taux se saisit sur chaque
--     compromis, aucun 50 % par défaut). Tous les comptes existants restent « non renseigné » : AUCUNE ligne existante n'est modifiée ;
--   · le journal des comptes accepte l'action « changement_taux_commission » (avant / après, auteur, date) : la liste de la 451 reprise à
--     l'identique, élargie d'une action.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucun taux n'est lu dans le profil (il se saisit sur chaque compromis) et rien ne s'écrit.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS taux_commission numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_utilisateur_taux_commission_check') THEN
    ALTER TABLE admin_utilisateur ADD CONSTRAINT admin_utilisateur_taux_commission_check
      CHECK (taux_commission IS NULL OR (taux_commission >= 0 AND taux_commission <= 100));
  END IF;
END $$;

COMMENT ON COLUMN admin_utilisateur.taux_commission IS
  'Taux de commission du collaborateur (%, 0 à 100) appliqué à SA part des honoraires ; pré-remplit « Nouveau compromis » (modifiable) ; NULL : non renseigné, saisi sur chaque compromis — migration 462. Journal : admin_utilisateur_log (changement_taux_commission).';

ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check
  CHECK (action = ANY (ARRAY['creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions', 'reinitialisation_mot_de_passe',
                             'changement_mot_de_passe', 'changement_identite', 'changement_service_gestion', 'changement_statut', 'changement_commissionne',
                             'changement_fonctions', 'changement_taux_commission']));
