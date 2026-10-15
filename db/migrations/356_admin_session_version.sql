-- 356_admin_session_version.sql
-- Lot « SÉCURITÉ DE L'ADMIN — IMPORTANTS » (décision d'Arno du 15/10/2026), audit point 4.
--
-- POURQUOI : une déconnexion ne faisait qu'effacer le cookie ; un jeton copié ailleurs restait valable 8 h. Chaque compte
-- porte désormais une VERSION de session, écrite dans le jeton à la connexion et relue par le proxy à chaque requête :
-- la DÉCONNEXION et la DÉSACTIVATION l'incrémentent, ce qui révoque toutes les sessions ouvertes du compte.
--
-- SANS cette migration, le code tourne sur le schéma actuel (repli sûr) : la version est lue sans nommer la colonne
-- (to_jsonb) et le contrôle est sauté ; les autres révocations restent actives sans elle (compte désactivé, mot de passe
-- changé ou réinitialisé — empreinte du mot de passe dans le jeton). Seule la révocation PAR DÉCONNEXION en dépend.
--
-- SANS RISQUE sur une base en service : ADD COLUMN avec défaut constant = changement de définition seul (aucune réécriture
-- de la table), verrou de quelques millisecondes. Tous les comptes partent de 0 ; les jetons déjà émis (sans version)
-- valent 0 → AUCUNE session ouverte n'est coupée par l'application de la migration.
--
-- IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). NON APPLIQUÉE par le lot :
--   psql "$DATABASE_URL" -f db/migrations/356_admin_session_version.sql

ALTER TABLE admin_utilisateur
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN admin_utilisateur.session_version IS
  'Version de session (audit point 4, 15/10/2026) : portée dans le jeton, incrémentée à la déconnexion et à la désactivation pour révoquer toutes les sessions du compte.';
