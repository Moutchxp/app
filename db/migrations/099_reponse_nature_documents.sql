-- 099_reponse_nature_documents.sql — Module VEILLE PERMIS (chantier T7-A) : distinguer enfin `documents` de `autre`, + ANCRE T7-B.
-- ⚠️ POURQUOI : T3 (migration 096) a posé la liste fermée nature (accuse | documents | autre | indetermine | rebond) mais le code
-- ne posait que `accuse` (signal FORT Auto-Submitted) ; tout le reste restait `indetermine`. T7-A pose enfin `documents` vs `autre`
-- à partir du CONTENU CAPTÉ (jamais du texte du message) : `documents` = au moins une pièce jointe (ligne demande_reponse_piece,
-- STOCKÉE OU NON — la nature décrit ce que la mairie a ENVOYÉ, pas ce qu'on a réussi à garder) OU au moins un lien FORT (L1) ;
-- sinon `autre`. On grave ici :
--   (1) demande_reponse.nature_classee_le — ANCRE pour le chantier T7-B (alertes « cas ③ »). Posée à now() UNIQUEMENT par un
--       ÉVÉNEMENT (relève live ou reclassement manuel) qui classe documents/autre ; laissée NULL par le BACKFILL ci-dessous.
--       INVARIANT : un message documents/autre dont nature_classee_le IS NULL a été classé par le backfill HISTORIQUE, jamais par
--       un événement. T7-B n'armera le cas ③ que sur nature_classee_le IS NOT NULL → AUCUNE alerte rétroactive possible.
--   (2) BACKFILL RÉTROACTIF des messages déjà en base : `indetermine` → `documents` (si pièce OU lien fort) sinon `autre`. Motif :
--       sans ça on garderait pour toujours deux populations (anciens `indetermine`, nouveaux `documents`/`autre`) pour un contenu
--       identique. Le changement est purement DESCRIPTIF : documents/autre/indetermine sont tous « ≠ rebond » ET « ∉ {accuse,rebond} »
--       → identiques dans TOUS les consommateurs actuels (nb_reponses, nb_reponses_reelles, derniere_reponse_le, alertes GED).
--       `accuse` et `rebond` ne sont JAMAIS touchés (WHERE nature = 'indetermine').
--
-- RÈGLE MÉTIER (fondateur, T7-A) : la nature se déduit du CONTENU CAPTÉ, JAMAIS du texte (déterministe, aucun classifieur, aucune
-- dérive). Le backfill ne SUIT aucun lien, ne pose aucun satisfait_le, n'écrit JAMAIS demande.statut, ne bascule rien vers Archives.
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS) + DEUX UPDATE bornés à `nature = 'indetermine'` (idempotents : un second passage
-- ne trouve plus aucun `indetermine`). Aucun DROP de table/colonne/index, aucun DELETE/TRUNCATE, aucun trigger. Ne touche NI
-- demande.statut, NI satisfait_le, NI dossier_document (Archives). N'écrit PAS nature_classee_le (le backfill reste NULL — l'ancre).
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT.
-- Requiert 096 (nature) et 097 (demande_reponse_lien). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/099_reponse_nature_documents.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_reponse.nature_classee_le — ANCRE T7-B. Nullable. Écrite (now()) UNIQUEMENT par un événement live/manuel classant
--    documents/autre (côté CODE) ; le backfill ci-dessous la laisse NULL. « documents/autre + NULL » ⟺ classé par l'historique.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS nature_classee_le timestamptz;

COMMENT ON COLUMN demande_reponse.nature_classee_le IS
  'ANCRE T7-B (chantier T7-A). Instant où la nature « documents »/« autre » a été posée par un ÉVÉNEMENT (relève live ou reclassement manuel). NULL si la nature vient du BACKFILL historique (migration 099) ou si nature ∈ {accuse, indetermine, rebond}. T7-B (cas ③) ne s''arme QUE sur nature_classee_le IS NOT NULL → aucune alerte rétroactive sur un message antérieur à la mise en service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) BACKFILL — `indetermine` → `documents` : au moins une pièce jointe (stockée OU non) OU au moins un lien FORT (L1). La
--    présence de la LIGNE demande_reponse_piece suffit (indépendante de cle_stockage) : décision porteur T7-A.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE demande_reponse r
   SET nature = 'documents'
 WHERE r.nature = 'indetermine'
   AND ( EXISTS (SELECT 1 FROM demande_reponse_piece p WHERE p.reponse_id = r.id)
      OR EXISTS (SELECT 1 FROM demande_reponse_lien  l WHERE l.reponse_id = r.id AND l.fort) );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) BACKFILL — `indetermine` restant (ni pièce ni lien fort) → `autre`. Après ce pas, plus aucun `indetermine` historique.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE demande_reponse r
   SET nature = 'autre'
 WHERE r.nature = 'indetermine';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--
--   -- (a) colonne nature_classee_le (timestamptz, nullable) :
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'demande_reponse' AND column_name = 'nature_classee_le';   -- attendu : timestamp with time zone / YES
--
--   -- (b) plus aucun message 'indetermine' ; l'ancre du backfill est bien NULL (documents/autre historiques) :
--   SELECT nature, count(*) FROM demande_reponse GROUP BY nature ORDER BY nature;  -- 'indetermine' → 0
--   SELECT count(*) FROM demande_reponse WHERE nature IN ('documents','autre') AND nature_classee_le IS NOT NULL; -- backfill → 0
--
--   -- (c) accuse / rebond INTACTS (le backfill ne les touche jamais) : comparer aux comptes d'avant application.
