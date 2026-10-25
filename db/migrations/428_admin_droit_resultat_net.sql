-- 428_admin_droit_resultat_net.sql — LOCATION (Arno, 26/10/2026) : LE DROIT « ACCÈS AU RÉSULTAT NET DE L'AGENCE ».
--
-- DÉCISION D'ARNO : dans la page Comptes, sous la tuile « Location » cochée, la question « Accès au Résultat net de l'agence ? »
-- (Oui / Non, Non par défaut). Le bloc « Résultat net de l'agence » (Suivi du mois, « Résumé de la période » du Suivi annuel) se voit :
-- administrateur → toujours ; compte avec Location + Oui → en entier ; tout autre compte → bloc absent, et l'API n'en envoie rien.
-- Décocher la tuile Location retire le droit (l'application l'écrit à faux, journalisé).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la colonne `admin_utilisateur.perm_resultat_net`, À FAUX POUR TOUS LES COMPTES EXISTANTS.
-- AUCUN compte n'est autorisé d'office (Arno donnera le droit lui-même, compte par compte). Aucune ligne n'est supprimée.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le bloc n'est visible que des administrateurs, et la question de la page
-- Comptes dit qu'il faut d'abord appliquer la 428 (rien n'est écrit).

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_resultat_net boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN admin_utilisateur.perm_resultat_net IS
  'Accès au « Résultat net de l''agence » (Location, 428) : vaut seulement avec perm_location ; un administrateur le voit toujours. Faux par défaut.';
