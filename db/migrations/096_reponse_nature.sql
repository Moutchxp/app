-- 096_reponse_nature.sql — Module VEILLE PERMIS (chantier T3) : NATURE d'un message entrant + compteur d'accusés au journal.
-- ⚠️ POURQUOI : un accusé de réception automatique de mairie/téléservice (en-tête Auto-Submitted) était capté comme un
-- « rebond » et, sans Message-ID d'origine, jeté en silence (« rebond étranger », non enregistré). Le système perdait donc
-- l'information « la mairie a accusé réception » — ce que le projet interdit (aucun message relevé sans trace). On grave ici :
--   (1) demande_reponse.nature — liste FERMÉE (accuse | documents | autre | indetermine | rebond), défaut 'indetermine'.
--       'accuse' n'est posé que sur un signal FORT (Auto-Submitted / gabarit téléservice) par le code de relève ; tout le
--       reste reste 'indetermine' et se comporte comme un vrai retour (défaut sûr = MONTRER). 'rebond' = un rebond de
--       non-remise RATTACHÉ, conservé comme PREUVE mais qui n'est ni « a écrit » ni « a répondu » (échec de livraison).
--   (2) releve_run.accuses — nombre d'accusés ENREGISTRÉS pendant un run (visibilité au journal, « plus aucun rejet muet »).
--
-- RÈGLE MÉTIER (fondateur, T3) : un accusé ne fait JAMAIS changer d'étape. Le permis reste « en cours » ; « la mairie a écrit »
-- (nb_reponses, accusé COMPRIS, rebond EXCLU) et « la mairie a répondu » (hors accusé ET hors rebond) sont DEUX faits distincts.
-- Cette migration ne fait QUE le schéma : la logique de classification et les deux compteurs vivent dans le code (lu au runtime).
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS ; contrainte CHECK posée par DROP IF EXISTS + ADD, ÉLARGISSABLE, jamais
-- un rétrécissement). Aucun DROP de table/colonne/index, aucun UPDATE, aucun trigger. N'écrit JAMAIS demande.statut, ne pose
-- aucun satisfait_le, ne bascule rien vers Archives. GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden
-- 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT. Requiert 073 (demande_reponse) et 074 (releve_run).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/096_reponse_nature.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_reponse.nature — NATURE du message entrant. Liste FERMÉE, défaut 'indetermine' (les lignes existantes prennent
--    'indetermine', ce qui préserve leur comportement de « vrai retour »). La contrainte est nommée + recréée (DROP IF EXISTS
--    + ADD) pour rester idempotente ET élargissable sans jamais perdre les valeurs existantes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'indetermine';

ALTER TABLE demande_reponse DROP CONSTRAINT IF EXISTS demande_reponse_nature_chk;
ALTER TABLE demande_reponse ADD CONSTRAINT demande_reponse_nature_chk
  CHECK (nature IN ('accuse','documents','autre','indetermine','rebond'));

COMMENT ON COLUMN demande_reponse.nature IS
  'Nature du message entrant (liste fermée) : accuse (accusé de réception automatique, signal FORT Auto-Submitted/téléservice) | documents | autre | indetermine (défaut : se comporte comme un vrai retour) | rebond (non-remise rattachée, preuve conservée mais NI « a écrit » NI « a répondu »). « accuse » et « rebond » sont exclus de « a répondu » (entrée dans Réponses) ; « rebond » est en plus exclu de « a écrit » (nb_reponses).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) releve_run.accuses — nombre d'accusés ENREGISTRÉS pendant ce run. Compteur d'ÉVÉNEMENT (cumulable), à côté des motifs
--    d'écartement déjà tracés (deja_connus, hors_perimetre, rebonds_etrangers…). Rend visible au journal le nouveau chemin
--    « accusé enregistré » : plus aucun message relevé sans trace.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS accuses integer;

COMMENT ON COLUMN releve_run.accuses IS
  'Nombre d''accusés de réception (nature=accuse) ENREGISTRÉS pendant ce run. Compteur d''événement (cumulable). Un accusé est enregistré et rattaché comme un message, mais ne compte pas comme « a répondu » (reste hors de Réponses).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--   \d releve_run
--
--   -- (a) colonne nature (text, NOT NULL, défaut 'indetermine') + CHECK à 5 valeurs :
--   SELECT column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_name = 'demande_reponse' AND column_name = 'nature';   -- attendu : NO / 'indetermine'::text
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_reponse_nature_chk';
--     -- doit lister : accuse, documents, autre, indetermine, rebond
--
--   -- (b) compteur accuses présent sur releve_run :
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'releve_run' AND column_name = 'accuses';
--
--   -- (c) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE demande_reponse SET nature = 'bidon' WHERE false; ROLLBACK;  -- viole la liste fermée
--   -- BEGIN; UPDATE demande_reponse SET nature = 'accuse' WHERE false; ROLLBACK; -- OK (valeur admise)
