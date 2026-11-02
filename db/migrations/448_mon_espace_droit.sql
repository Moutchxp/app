-- 448_mon_espace_droit.sql — TUILE « MON ESPACE » (Arno, 02/11/2026, lot 1 de docs/PLAN_MON_ESPACE.md) : LE DROIT `perm_mon_espace`.
--
-- LE BESOIN (Arno) : une tuile « Mon espace », personnelle à chaque collaborateur qui a un compte ET à qui Arno a donné le droit
-- « Mon espace » ; les administrateurs l'ont d'office.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : une colonne `perm_mon_espace` sur `admin_utilisateur`, sur le patron EXACT de `perm_transaction`
-- (migration 433) — booléen, faux par défaut. Un administrateur a TOUS les droits implicitement (le code ne lit pas ses colonnes) :
-- aucune ligne n'est donc modifiée. Un collaborateur reçoit le droit par la case « Mon espace » de l'écran des comptes.
--
-- ⚠️ LE CODE N'EN DÉPEND PAS POUR SE CONNECTER : la lecture des comptes sonde la colonne (`schemaDroits.ts`) ; tant que la migration
-- n'est pas appliquée, le droit vaut « non » pour tout collaborateur.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_mon_espace boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN admin_utilisateur.perm_mon_espace IS
  'Accès à la tuile « Mon espace » (accueil, /admin/mon-espace). Administrateur : implicite (migration 448).';
