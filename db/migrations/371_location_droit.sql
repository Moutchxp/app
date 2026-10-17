-- 371_location_droit.sql — TUILE « LOCATION » (étude Location, lot L2, demande impérative d'Arno du 17/10/2026) :
-- LE DROIT DE MODULE `perm_location`.
--
-- LE BESOIN (Arno) : « la Location doit avoir une TUILE DÉDIÉE sur la page d'accueil de l'admin […] La tuile n'apparaît que
-- pour les collaborateurs qui ont le droit Location (même règle que les autres tuiles). »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : une colonne `perm_location` sur `admin_utilisateur`, sur le patron EXACT de
-- `perm_gestion` (migration 228) — booléen, faux par défaut. Un administrateur a TOUS les droits implicitement (le code ne
-- lit pas ses colonnes) : aucune ligne n'est donc modifiée. Un collaborateur reçoit le droit par la case « Location » de
-- l'écran des comptes.
--
-- ⚠️ LE CODE N'EN DÉPEND PAS POUR SE CONNECTER : la lecture des comptes sonde la colonne (`schemaDroits.ts`) ; tant que
-- la migration n'est pas appliquée, le droit vaut « non » pour tout collaborateur.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_location boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN admin_utilisateur.perm_location IS
  'Accès au module « Location » (tuile de l''accueil, /admin/location). Administrateur : implicite (migration 371).';
