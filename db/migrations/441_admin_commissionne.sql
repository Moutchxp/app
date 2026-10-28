-- 441_admin_commissionne.sql — LOT S (Arno, 28/10/2026) : « COMMISSIONNÉ / NON COMMISSIONNÉ » POUR LES ADMINISTRATEURS.
--
-- DÉCISIONS D'ARNO :
--   · un compte de rôle ADMINISTRATEUR porte un choix obligatoire « Commissionné » / « Non commissionné », journalisé avec sa date
--     (`admin_utilisateur_log`, action 'changement_commissionne', valeur avant / après, auteur) ; les collaborateurs ne portent pas ce
--     choix : ils sont TOUJOURS commissionnés (la colonne n'est pas lue pour eux) ;
--   · les administrateurs existants deviennent « Non commissionné » (une ligne de journal chacun, signée « migration 441 ») ;
--   · NON COMMISSIONNÉ : sur une vente, aucune commission personnelle ne se saisit ni n'entre dans un calcul ; sa part reste dans la
--     répartition et dans le CA de sa société. Les montants déjà saisis restent en base, intacts, simplement ignorés ;
--   · le choix est FIGÉ sur chaque côté de vente à l'enregistrement (`transaction_partie.commissionne`), comme la société et le statut ;
--     NULL (ventes d'avant) : le choix actuel du compte.
--
-- EN AJOUT : deux colonnes neuves, la contrainte du journal des comptes élargie à 'changement_commissionne' (liste de la 439 reprise à
-- l'identique), et l'initialisation des administrateurs. Aucune autre ligne n'est touchée ; rien n'est effacé. IDEMPOTENTE (l'initialisation
-- ne vise que les administrateurs encore sans choix). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, tout le monde est « Commissionné », exactement comme aujourd'hui.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS commissionne boolean;
COMMENT ON COLUMN admin_utilisateur.commissionne IS
  'Administrateur commissionné ou non sur les ventes (migration 441) ; NULL : commissionné. Ignoré pour un collaborateur (toujours commissionné). Journal : admin_utilisateur_log (changement_commissionne).';

ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check CHECK (action = ANY (ARRAY[
  'creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions', 'reinitialisation_mot_de_passe',
  'changement_mot_de_passe', 'changement_identite', 'changement_service_gestion', 'changement_statut', 'changement_commissionne']));

-- Les administrateurs existants : « Non commissionné », journalisé (avant : aucun choix). La ligne de journal d'abord, tant que NULL.
INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
SELECT 'changement_commissionne', u.id, NULL, jsonb_build_object('commissionne', NULL), jsonb_build_object('commissionne', false, 'origine', 'migration 441')
  FROM admin_utilisateur u WHERE u.role = 'administrateur' AND u.commissionne IS NULL;
UPDATE admin_utilisateur SET commissionne = false WHERE role = 'administrateur' AND commissionne IS NULL;

ALTER TABLE transaction_partie ADD COLUMN IF NOT EXISTS commissionne boolean;
COMMENT ON COLUMN transaction_partie.commissionne IS
  'Le négociateur était-il commissionné AU MOMENT DE L''ENREGISTREMENT de la vente (figé, migration 441) ; NULL : vente d''avant (choix actuel du compte).';
