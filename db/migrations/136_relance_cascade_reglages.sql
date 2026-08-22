-- 136_relance_cascade_reglages.sql — LOT 2/6 (cascade de relance) : élargir la VARIANTE à la cascade + poser ses RÉGLAGES.
--
-- CONTEXTE : le lot 1 a livré les 3 textes de la cascade — 'rappel' (J-10, courtois), 'avis' (J-3, annonce l'échéance +
-- possibilité CADA), 'saisine' (jour J, refus tacite + saisine CADA). Écart transitoire refermé ICI : les callers écrivaient
-- encore variante='formelle' car le CHECK de la migration 128 n'acceptait que ('rappel','formelle'). On élargit la liste fermée
-- et on externalise les 3 délais de la cascade + un booléen d'auto-saisine CADA (pilotage SANS CODE, bornes lues au runtime).
--
-- ① demande_relance.variante — liste fermée élargie à ('rappel','avis','saisine','formelle'). 'formelle' est CONSERVÉE : des
--    lignes historiques la portent et on ne réécrit JAMAIS une donnée existante (elle est remplacée par 'saisine' dans la cascade).
--    On DROP + rétablit le CHECK NOMMÉ (demande_relance_variante_check, posé inline par la 128) → idempotent (rejouable).
--    ⚠️ L'index demande_relance_vivante_uniq (sur (demande_id, type), migration 076) N'EST PAS TOUCHÉ : il ne cite pas variante.
-- ② config_veille — 3 délais de la cascade (bornés 1..30, CHECK EN LIGNE → lus par parserBornesCheck) + auto-saisine CADA :
--    relance_rappel_jours_avant (10), relance_avis_jours_avant (3), relance_saisine_delai_jours (4), saisine_cada_auto_active (false).
--    relance_jours_avant_echeance (128) devient le DOUBLON de relance_rappel_jours_avant : NON supprimée (sa suppression est un
--    chantier séparé), sa valeur courante est REPORTÉE une fois dans relance_rappel_jours_avant, et elle est marquée VESTIGIALE par COMMENT.
--
-- ADDITIVE / SÛRE : un DROP+ADD du seul CHECK de variante (aucune donnée touchée), quatre ADD COLUMN IF NOT EXISTS, un UPDATE
-- CIBLÉ et GARDÉ (idempotent) du singleton. Aucun DROP de table/colonne/index, aucun DELETE/TRUNCATE, aucun trigger. Ne touche NI
-- le CHECK de demande_relance.type, NI l'index unique « une relance vivante par (demande_id, type) », NI demande.statut, NI le
-- moteur de score. Une seule transaction. GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment). Requiert 076, 128.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/136_relance_cascade_reglages.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① VARIANTE : liste fermée élargie à la cascade ('formelle' conservée, héritée).
ALTER TABLE demande_relance DROP CONSTRAINT IF EXISTS demande_relance_variante_check;
ALTER TABLE demande_relance ADD CONSTRAINT demande_relance_variante_check
  CHECK (variante IN ('rappel', 'avis', 'saisine', 'formelle'));

COMMENT ON COLUMN demande_relance.variante IS
  'LOT 1/2 — registre de langage du brouillon, liste fermée de la CASCADE : ''rappel'' (J-10, courtois, ni refus tacite ni CADA), ''avis'' (J-3, annonce l''échéance + possibilité de saisir la CADA), ''saisine'' (jour J, refus tacite R.311-12 + saisine CADA R.343-1). ''formelle'' = valeur HÉRITÉE (lot A/B, avant la cascade), CONSERVÉE (jamais réécrite) et REMPLACÉE par ''saisine'' dans la cascade. N''a de sens QUE pour type=''relance''.';

-- ② CONFIG_VEILLE : les 3 délais de la cascade (bornes 1..30 EN LIGNE, lues par parserBornesCheck) + auto-saisine CADA.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_rappel_jours_avant integer NOT NULL DEFAULT 10
  CHECK (relance_rappel_jours_avant BETWEEN 1 AND 30);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_avis_jours_avant integer NOT NULL DEFAULT 3
  CHECK (relance_avis_jours_avant BETWEEN 1 AND 30);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_saisine_delai_jours integer NOT NULL DEFAULT 4
  CHECK (relance_saisine_delai_jours BETWEEN 1 AND 30);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS saisine_cada_auto_active boolean NOT NULL DEFAULT false;

-- Report ONE-SHOT de la valeur courante du réglage VESTIGIAL vers son successeur. GARDÉ pour l'idempotence : ne copie QUE si le
-- successeur est encore à son DEFAULT (10) et que la valeur héritée en diffère → un 2e passage (ou une valeur déjà divergée par
-- l'admin) ne l'écrase jamais. Cas courant (héritée = 10) : aucune ligne touchée (déjà identiques).
UPDATE config_veille SET relance_rappel_jours_avant = relance_jours_avant_echeance
 WHERE id = 1 AND relance_rappel_jours_avant = 10 AND relance_jours_avant_echeance <> 10;

COMMENT ON COLUMN config_veille.relance_rappel_jours_avant IS
  'Cascade lot 2 — nombre de jours AVANT l''échéance du délai d''un mois où le RAPPEL (courtois, sans CADA ni refus tacite) est préparé. SUCCESSEUR de relance_jours_avant_echeance (dont il reprend la valeur). Borné 1..30, défaut 10.';
COMMENT ON COLUMN config_veille.relance_avis_jours_avant IS
  'Cascade lot 2 — nombre de jours AVANT l''échéance où l''AVIS (annonce l''échéance à venir + possibilité de saisir la CADA) est préparé. Borné 1..30, défaut 3.';
COMMENT ON COLUMN config_veille.relance_saisine_delai_jours IS
  'Cascade lot 2 — délai (jours) APRÈS l''échéance au terme duquel la SAISINE CADA annoncée sera déposée (la relance ''saisine'' l''annonce le jour de l''échéance). Borné 1..30, défaut 4.';
COMMENT ON COLUMN config_veille.saisine_cada_auto_active IS
  'Cascade lot 2 — activer ce réglage fait partir une saisine CADA SANS relecture humaine. SANS EFFET tant que cada_email est vide : la saisine part alors en file de DÉPÔT MANUEL sur le formulaire en ligne de la CADA. Défaut false (rien ne part sans un clic).';
COMMENT ON COLUMN config_veille.relance_jours_avant_echeance IS
  'VESTIGIAL (cascade lot 2) — remplacé par relance_rappel_jours_avant, qui en reprend la valeur. CONSERVÉ (jamais supprimé) : sa suppression est un chantier séparé. Ne pas éditer : régler relance_rappel_jours_avant à la place.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① variante : liste fermée élargie à la cascade (rappel/avis/saisine/formelle) :'
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_relance_variante_check';
\echo '>>> ② l''index demande_relance_vivante_uniq est INCHANGÉ (porte sur (demande_id, type), pas variante) :'
SELECT indexdef FROM pg_indexes WHERE tablename = 'demande_relance' AND indexname = 'demande_relance_vivante_uniq';
\echo '>>> ③ les 4 colonnes config_veille + défauts (10 / 3 / 4 / false) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'config_veille'
  AND column_name IN ('relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours', 'saisine_cada_auto_active')
ORDER BY column_name;
\echo '>>> ④ bornes des 3 délais (lisibles par parserBornesCheck : >= 1 et <= 30) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'config_veille'::regclass
  AND conname LIKE 'config_veille_relance_%_check'
ORDER BY conname;
\echo '>>> ⑤ valeurs du singleton (le report vestigial → rappel a eu lieu si nécessaire) :'
SELECT relance_jours_avant_echeance, relance_rappel_jours_avant, relance_avis_jours_avant, relance_saisine_delai_jours, saisine_cada_auto_active
FROM config_veille WHERE id = 1;
