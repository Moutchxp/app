-- 100_reponse_action_repondu.sql — Module VEILLE PERMIS (chantier T7-B) : le « cas ③ » — un message de mairie qui n'est NI un
-- accusé NI des documents (nature `autre`, T7-A) appelle une RÉPONSE HUMAINE. On grave ici, AU GRAIN MESSAGE (jamais réponse×permis) :
--   (1) demande_reponse.alerte_action_le — idempotence de l'e-mail ① : l'alerte « ce message appelle une réponse » forwardée à
--       l'adresse pro n'est envoyée QU'UNE fois par message (NULL = pas encore envoyée ; NON NULL = déjà partie). Pas de seuil, pas
--       de compte à rebours, pas de retard : le cas ③ n'a AUCUN délai — d'où le refus délibéré de réutiliser alerte_ged (dont
--       seuil_le NOT NULL mentirait) et le choix d'une colonne au grain message.
--   (2) demande_reponse.repondu_le / repondu_par — le bouton ③ « répondu » (MANUEL) : où en est la demande. MUTABLE et RÉVERSIBLE
--       (repondu_le → NULL annule), à la différence du journal append-only alerte_ged. La détection AUTOMATIQUE du « répondu »
--       (depuis nos messages envoyés) est le chantier SUIVANT (T7-C) — ici le bouton est strictement manuel.
--
-- RÈGLE MÉTIER (fondateur, T7-B) : l'alerte ① est armée UNIQUEMENT sur nature='autre' ET nature_classee_le IS NOT NULL (ancre
-- T7-A anti-rétroactif) — un message classé par le backfill historique (099, nature_classee_le NULL, dont la réponse de Paris)
-- ne déclenche JAMAIS d'alerte. L'alerte ① part pour TOUT `autre` (rattaché OU non : un mail non rattaché appelant une réponse
-- ne doit pas passer sous le radar) ; le signal de ligne ② et le bouton ③ restent réservés aux rattachés (sans demande, pas de ligne).
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS, colonnes NULLABLES). Aucun DROP, aucun UPDATE, aucun backfill, aucun
-- trigger, aucun CHECK. Ne touche NI demande.statut, NI satisfait_le, NI dossier_document (Archives) ; ne suit JAMAIS un lien.
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT.
-- Requiert 073 (demande_reponse) et 099 (nature_classee_le). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/100_reponse_action_repondu.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_reponse.alerte_action_le — idempotence de l'e-mail « ce message appelle une réponse » (cas ③). Grain MESSAGE.
--    NULL = jamais envoyée (candidate) ; NON NULL = déjà partie (jamais deux fois). Aucun seuil (l'alerte est due dès qu'un
--    `autre` ancré existe, à la prochaine passe) → une simple date d'envoi suffit, pas la sémantique seuil/retard d'alerte_ged.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS alerte_action_le timestamptz;

COMMENT ON COLUMN demande_reponse.alerte_action_le IS
  'T7-B (cas ③). Instant d''envoi de l''alerte « ce message de mairie appelle une réponse » (nature=autre). NULL = pas encore envoyée (candidate) ; NON NULL = déjà partie (idempotence, jamais deux fois). Armée uniquement si nature_classee_le IS NOT NULL (jamais sur un message rétro-classé). Pas de seuil ni de retard : grain MESSAGE, pas réponse×permis.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) demande_reponse.repondu_le / repondu_par — bouton ③ « répondu » (MANUEL, RÉVERSIBLE). repondu_le NULL = pas (encore)
--    répondu → la ligne du permis reste signalée tant qu'il en reste ≥ 1 non répondu. repondu_par = auteur (audit), comme satisfait_par.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS repondu_le  timestamptz;
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS repondu_par text;

COMMENT ON COLUMN demande_reponse.repondu_le IS
  'T7-B (cas ③). Instant où l''exploitant a marqué « répondu » à ce message de mairie (bouton MANUEL, RÉVERSIBLE : NULL annule). Distinct de traite_le (arbitrage du bruit) et de satisfait_le (dossier reçu). La détection automatique du « répondu » est le chantier T7-C.';
COMMENT ON COLUMN demande_reponse.repondu_par IS 'T7-B. Auteur du marquage « répondu » (audit), ou NULL si non répondu / annulé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--
--   -- (a) les trois colonnes, toutes NULLABLES :
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'demande_reponse' AND column_name IN ('alerte_action_le','repondu_le','repondu_par')
--    ORDER BY column_name;   -- attendu : 3 lignes, is_nullable = YES partout
--
--   -- (b) additive : aucune valeur posée par la migration (tout NULL au départ) :
--   SELECT count(*) FROM demande_reponse WHERE alerte_action_le IS NOT NULL OR repondu_le IS NOT NULL; -- attendu : 0
