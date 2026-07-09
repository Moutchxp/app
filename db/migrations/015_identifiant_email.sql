-- 015_identifiant_email.sql — M3 : l'identifiant d'un compte administrateur DOIT être une adresse e-mail.
--
-- MOTIF : une adresse e-mail comme identifiant ouvre, dans un chantier ULTÉRIEUR, une procédure
-- « mot de passe oublié » par lien de réinitialisation envoyé à cette adresse. Ce chantier-ci NE construit
-- PAS cette procédure : il pose UNIQUEMENT la contrainte de format sur `identifiant`.
--
-- ADDITIVE / NON DESTRUCTIVE : ajoute une CHECK, ne touche aucune donnée. La table `admin_utilisateur` est
-- VIDE à ce stade (le compte unique a été supprimé avant ce lot). AUCUN DROP, UPDATE, DELETE.
-- La colonne n'est PAS renommée (elle reste `identifiant`) : un renommage casserait admin_utilisateur_log,
-- le script CLI, la route de connexion et le JWS pour un gain purement cosmétique.
--
-- PAS de NOT VALID : la contrainte est validée immédiatement. Si la table n'était PAS vide et contenait un
-- identifiant non conforme, cet ALTER ÉCHOUERAIT — c'est VOULU, c'est le garde-fou.
--
-- CHECK volontairement PERMISSIF (une seule arobase, un point après, aucun blanc). On n'implémente PAS la
-- RFC 5322 en regex SQL (piège classique) : la validation fine est faite côté application (app/lib/admin/email.ts).
-- L'unicité reste INSENSIBLE à la casse via l'index lower() posé en 014 ; l'adresse est stockée TELLE QUE saisie.
--
-- Application MANUELLE (Arno) : psql "$DATABASE_URL" -f db/migrations/015_identifiant_email.sql

ALTER TABLE admin_utilisateur
  ADD CONSTRAINT admin_utilisateur_identifiant_email_check
  CHECK (identifiant ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

COMMENT ON CONSTRAINT admin_utilisateur_identifiant_email_check ON admin_utilisateur IS
  'identifiant = adresse e-mail (format permissif : local@domaine.tld). Support futur du « mot de passe oublié ».';
