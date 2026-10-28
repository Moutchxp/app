-- 439_admin_statut_compte.sql — LOT P (Arno, 28/10/2026) : LE STATUT DE CHAQUE PERSONNE (Associé, Salarié, Indépendant, Observateur).
--
-- DÉCISIONS D'ARNO :
--   · chaque compte porte un STATUT obligatoire, distinct de sa société (434 / 438) et de ses droits de tuiles : « Associé »,
--     « Salarié », « Indépendant » ou « Observateur ». Chaque changement est journalisé, daté et signé (`admin_utilisateur_log`,
--     action 'changement_statut', valeur avant / après — le journal append-only des comptes) ;
--   · les comptes existants : les ADMINISTRATEURS deviennent « Associé » (une ligne de journal chacun, signée « migration 439 ») ; les
--     autres restent SANS statut (« à renseigner » : rien n'est deviné) ;
--   · OBSERVATEUR = lecture seule absolue : le proxy (garde centrale) refuse toute écriture de l'admin (403) ;
--   · le statut du négociateur est FIGÉ sur chaque côté de vente à l'enregistrement (`transaction_partie.statut`), comme sa société.
--
-- EN AJOUT : deux colonnes neuves (`admin_utilisateur.statut`, `transaction_partie.statut`), la contrainte du journal des comptes
-- élargie à 'changement_statut' (liste de la 341 reprise à l'identique), et l'initialisation des administrateurs. Aucune autre ligne
-- n'est touchée ; rien n'est effacé. IDEMPOTENTE (l'initialisation ne vise que les administrateurs encore sans statut). Pas de
-- BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le statut est lu « à renseigner » (via to_jsonb : jamais d'erreur SQL), le
-- champ de Comptes est montré grisé, personne n'est observateur, et le cumul des commissions ne déduit que les apporteurs et les
-- négociateurs dont le statut est connu (aucun).

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS statut text
  CHECK (statut IS NULL OR statut IN ('associe', 'salarie', 'independant', 'observateur'));
COMMENT ON COLUMN admin_utilisateur.statut IS
  'Statut de la personne (migration 439) : associe, salarie, independant, observateur (lecture seule absolue) ; NULL : à renseigner. Journal : admin_utilisateur_log (changement_statut).';

ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check CHECK (action = ANY (ARRAY[
  'creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions', 'reinitialisation_mot_de_passe',
  'changement_mot_de_passe', 'changement_identite', 'changement_service_gestion', 'changement_statut']));

-- Les administrateurs existants : « Associé », journalisé (avant : aucun). La ligne de journal d'abord, tant que statut IS NULL.
INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
SELECT 'changement_statut', u.id, NULL, jsonb_build_object('statut', NULL), jsonb_build_object('statut', 'associe', 'origine', 'migration 439')
  FROM admin_utilisateur u WHERE u.role = 'administrateur' AND u.statut IS NULL;
UPDATE admin_utilisateur SET statut = 'associe' WHERE role = 'administrateur' AND statut IS NULL;

ALTER TABLE transaction_partie ADD COLUMN IF NOT EXISTS statut text
  CHECK (statut IS NULL OR statut IN ('associe', 'salarie', 'independant', 'observateur'));
COMMENT ON COLUMN transaction_partie.statut IS
  'Le statut du négociateur AU MOMENT DE L''ENREGISTREMENT de la vente (figé, migration 439) ; NULL : vente d''avant (statut actuel du compte).';
