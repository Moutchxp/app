-- 101_reponse_repondu_auto.sql — Module VEILLE PERMIS (chantier T7-C) : PRÉ-COCHAGE automatique du bouton « répondu ».
-- ⚠️ POURQUOI : T7-B a posé le bouton MANUEL « répondu » (repondu_le/repondu_par). T7-C le PRÉ-COCHE en lisant le dossier
-- ENVOYÉS du compte pro : si une réponse au fil est partie vers la mairie, la ligne se coche seule. On grave ici l'ANCRE
-- ANTI-RÉSURRECTION, cœur du chantier :
--   demande_reponse.repondu_auto_le — instant où le SYSTÈME a auto-coché ce message. Les candidats au pré-cochage exigent
--   repondu_auto_le IS NULL : le système n'auto-coche QU'UNE FOIS par message. Sans cette colonne, si le fondateur ANNULE un
--   pré-cochage (T7-B annulerRepondu remet repondu_le/repondu_par à NULL), la passe suivante reverrait la ligne « ouverte » et
--   la RE-cocherait — le système écraserait une décision humaine délibérée. Même famille que nature_classee_le (099) et
--   alerte_action_le (100) : le système ne revient JAMAIS sur un geste humain.
--
-- DISTINCTION SYSTÈME vs HUMAIN (décision fondateur) : PAS de sentinelle dans repondu_par. Le fait « auto » se lit sur
-- repondu_auto_le IS NOT NULL ; repondu_par reste RÉSERVÉ à l'humain (NULL quand c'est le système). À l'écran : « pré-coché
-- automatiquement » (repondu_auto_le posé, repondu_par NULL) vs « marqué par X » (repondu_par renseigné).
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS, colonne NULLABLE). Aucun DROP, aucun UPDATE, aucun backfill, aucun trigger,
-- aucun CHECK. Ne touche NI demande.statut, NI satisfait_le, NI Archives. Lecture stricte du dossier envoyés côté code (EXAMINE,
-- en-têtes seuls). GOLDEN-SAFE (golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT. Requiert 073 + 100.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/101_reponse_repondu_auto.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- repondu_auto_le — ANCRE anti-résurrection du pré-cochage. NULL = jamais auto-évalué avec succès (candidat) ; NON NULL = déjà
--   auto-coché une fois (plus jamais re-coché, même après annulation humaine). Ne se confond pas avec repondu_le (l'état
--   « répondu », que l'humain peut remettre à NULL) : repondu_auto_le SURVIT à l'annulation, c'est ce qui protège la décision humaine.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS repondu_auto_le timestamptz;

COMMENT ON COLUMN demande_reponse.repondu_auto_le IS
  'T7-C (pré-cochage « répondu »). Instant où le SYSTÈME a auto-coché ce message (réponse au fil détectée dans le dossier envoyés). NULL = candidat au pré-cochage ; NON NULL = déjà auto-coché une fois → JAMAIS re-coché, même si l''humain annule ensuite (anti-résurrection). Le fait « auto » se lit ici (repondu_par reste réservé à l''humain, NULL quand c''est le système).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--
--   -- (a) colonne repondu_auto_le (timestamptz, nullable) :
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'demande_reponse' AND column_name = 'repondu_auto_le';   -- attendu : timestamp with time zone / YES
--
--   -- (b) additive : rien posé par la migration (tout NULL au départ) :
--   SELECT count(*) FROM demande_reponse WHERE repondu_auto_le IS NOT NULL; -- attendu : 0
