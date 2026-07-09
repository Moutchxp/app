-- 017_action_changement_identite.sql — M3-4 Lot F1 : nouvelle action de journal « changement_identite ».
--
-- MOTIF : le Lot F2 permettra à un administrateur de modifier le PRÉNOM et le NOM d'un compte (F-2). Cette
-- écriture doit être journalisée dans admin_utilisateur_log ; or son CHECK d'actions (recréé en 016) ne contient
-- aucune action correspondant à une modification d'identité. On l'ÉTEND avec 'changement_identite' — sans retirer
-- aucune des 7 actions existantes. L'identifiant (e-mail) reste IMMUABLE (F-1) : cette action ne concerne QUE
-- prénom/nom.
--
-- REJOUABLE / IDEMPOTENTE — comme 016. Le CHECK d'actions PRÉ-EXISTE (créé en 014, recréé en 016) : un simple
-- « ADD if not exists » gardé par NOM le laisserait avec l'ancienne définition (piège). On le RECRÉE donc par
-- DROP IF EXISTS + ADD (déterministe, rejouable) DANS un DO-block, le tout en transaction explicite.
-- AUCUN DELETE/TRUNCATE/DROP TABLE|COLUMN. AUCUN UPDATE de données. Additif pur (une valeur en plus dans un IN).
--
-- ROLLBACK (non destructif) : rien à défaire côté données. Tant que le code F2 n'écrit pas 'changement_identite'
-- (F1 ne l'écrit jamais), revenir en arrière = redéployer l'ancien code ; laisser la valeur en plus dans le IN est
-- inoffensif. Si un DROP de la valeur est vraiment voulu APRÈS que des lignes l'utilisent, il faudrait d'abord les
-- réétiqueter — ne pas le faire à l'aveugle.
--
-- Application MANUELLE (Arno), arrêt au 1er échec pour un rollback lisible :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/017_action_changement_identite.sql

BEGIN;

DO $$
BEGIN
  ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
  ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check
    CHECK (action IN ('creation','desactivation','reactivation','changement_role',
                      'changement_permissions','reinitialisation_mot_de_passe','changement_mot_de_passe',
                      'changement_identite'));
END $$;

COMMIT;
