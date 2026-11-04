-- 454_permissions_tuiles.sql — ADMINISTRATIF › COMPTES, D37 (Arno, 04/11/2026) : UNE CASE DE PERMISSION POUR CHAQUE TUILE DU MENU.
--
-- LE BESOIN (Arno) : dans la fiche d'un utilisateur, toutes les tuiles du menu ont leur case, pour donner ou retirer l'accès au cas par cas.
-- Décisions d'Arno du 04/11/2026 : « Administratif » reste réservé aux administrateurs (aucune case) ; « Audit » et « Sources de données »
-- ont leur case, « non » pour tous les collaborateurs ; « Les coûts » (onglet de Mon espace) : option A — la case remplace la condition
-- « associé », pré-cochée pour les associés actuels, et reste réservée aux administrateurs par le mode « Voir ».
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `perm_audit`, `perm_sources` : booléens, faux par défaut, sur le patron EXACT de `perm_mon_espace` (448). Un administrateur a ces
--     droits implicitement (le code ne lit pas ses colonnes) : aucune ligne n'est modifiée, AUCUN accès ne change ;
--   · `perm_couts` : la case « Les coûts », PRÉ-COCHÉE pour chaque compte au statut « Associé » (la règle d'avant : associé ET administrateur ;
--     l'onglet reste dans « Voir », réservé aux administrateurs) — l'accès effectif de chacun est donc INCHANGÉ. Chaque pré-cochage est
--     journalisé (`admin_utilisateur_log`, « changement_permissions », auteur : la migration). Le pré-cochage n'a lieu qu'à la CRÉATION de la
--     colonne : rejouée, la migration ne recoche jamais une case qu'Arno aurait décochée.
-- AUCUNE donnée n'est effacée. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_audit boolean NOT NULL DEFAULT false;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_sources boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = 'admin_utilisateur' AND column_name = 'perm_couts') THEN
    ALTER TABLE admin_utilisateur ADD COLUMN perm_couts boolean NOT NULL DEFAULT false;
    UPDATE admin_utilisateur u SET perm_couts = true WHERE to_jsonb(u) ->> 'statut' = 'associe';
    INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
    SELECT 'changement_permissions', u.id, NULL, jsonb_build_object('perm_couts', NULL),
           jsonb_build_object('perm_couts', true, 'origine', 'migration 454 : statut « Associé » (règle d''avant)')
      FROM admin_utilisateur u WHERE u.perm_couts;
  END IF;
END $$;

COMMENT ON COLUMN admin_utilisateur.perm_audit IS
  'D37 (454) — accès à la tuile « Audit » (/admin/audit). Administrateur : implicite.';
COMMENT ON COLUMN admin_utilisateur.perm_sources IS
  'D37 (454) — accès à la tuile « Sources de données » (/admin/sources). Administrateur : implicite.';
COMMENT ON COLUMN admin_utilisateur.perm_couts IS
  'D37 (454, option A) — l''onglet « Les coûts » de Mon espace (dans « Voir », réservé aux administrateurs) ; remplace la condition « associé » ; pré-cochée pour les associés.';
