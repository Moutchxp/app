-- 126_rattachement_reference_differee.sql — FUS-4 ② : ajoute la méthode 'reference_differee' à demande_reponse.rattachement_methode.
--
-- CONTEXTE : quand une référence mairie (SLC…) est ajoutée à la main APRÈS COUP (l'accusé arrive après le dépôt — cas de la
-- demande 233), la cascade de rattachement à la relève n'avait rien à comparer. FUS-4 ② re-tente le rattachement des messages
-- non rattachés qui citent cette référence, dès sa saisie. Ces rattachements DIFFÉRÉS portent une méthode dédiée
-- 'reference_differee' (distincte de 'reference_mairie', posée à la relève, et de 'manuel', posé par un rattachement à la main),
-- pour la traçabilité.
--
-- ADDITIVE PURE : RECRÉATION de la liste fermée du CHECK (élargissement), même patron que la migration 091 (qui avait ajouté
-- 'reference_mairie'). Réversible sans perte, données existantes conformes. Ne touche NI demande.statut NI envoye_le NI le moteur
-- de score. Une seule transaction.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/126_rattachement_reference_differee.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE demande_reponse DROP CONSTRAINT IF EXISTS demande_reponse_rattachement_methode_chk;
ALTER TABLE demande_reponse ADD CONSTRAINT demande_reponse_rattachement_methode_chk
  CHECK (rattachement_methode IN (
    'message_id', 'reference_objet', 'reference_corps', 'numero_dossier', 'reference_mairie', 'manuel', 'aucun',
    'reference_differee' -- FUS-4 ② : rattachement re-tenté à la saisie d'une référence
  ));

COMMENT ON COLUMN demande_reponse.rattachement_methode IS
  'Comment le rattachement a été fait : message_id | reference_objet | reference_corps | numero_dossier | reference_mairie | reference_differee (re-tenté à la saisie d''une référence) | manuel | aucun.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> CHECK recréé, contient reference_differee :'
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_reponse_rattachement_methode_chk';
