-- 092_reactiver_dossiers_prete_envoyee.sql — Module VEILLE PERMIS (chantier B1) : RÉPARATION de données.
-- ⚠️ Bug corrigé côté code (B1) : la réouverture annulee→prete ne restaurait pas demande_dossier.actif=true. Des demandes
-- annulées puis rouvertes gardent donc des dossiers DÉTACHÉS (actif=false) alors qu'elles sont PRÊTES (sur le point de
-- partir) ou ENVOYÉES → comptés comme LIBRES (reproposables → double démarchage), affichés « demande annulée » (colonne
-- Démarchage), invisibles à la relance. Aujourd'hui : 4 dossiers de la demande 119 (envoyée) + 2 sur des demandes prêtes.
-- Requiert 053.
--
-- SÛR : un SEUL UPDATE de `demande_dossier.actif` (false → true), STRICTEMENT borné aux demandes PRÊTES ou ENVOYÉES dont le
-- dossier n'est actif nulle part ailleurs (conflict-safe : l'index unique partiel `demande_dossier_unique_actif` ne peut pas
-- être violé). N'écrit JAMAIS demande.statut. Ne touche PAS les demandes annulées (leurs dossiers DOIVENT rester inactifs :
-- ils ont été légitimement libérés, parfois déjà repris ailleurs). Idempotente (2ᵉ exécution : les lignes sont déjà
-- actif=true → `NOT dd.actif` faux → 0 ligne). Un seul BEGIN/COMMIT. GOLDEN-SAFE. TU NE L'APPLIQUES PAS.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/092_reactiver_dossiers_prete_envoyee.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- Réactive les liens des demandes PRÊTES ou ENVOYÉES restés à actif=false, SAUF si le dossier est déjà actif sur une autre
-- demande (dans ce cas on ne touche à rien : l'autre demande le détient légitimement). Attendu aujourd'hui : 6 lignes
-- (4 sur la demande 119 envoyée + 2 sur des demandes prêtes). Une demande prête est sur le point de partir : ses dossiers
-- détachés créent le même risque de double démarchage qu'une envoyée.
UPDATE demande_dossier dd SET actif = true
  FROM demande d
 WHERE dd.demande_id = d.id
   AND d.statut IN ('prete', 'envoyee')
   AND NOT dd.actif
   AND NOT EXISTS (SELECT 1 FROM demande_dossier o WHERE o.dossier_id = dd.dossier_id AND o.actif AND o.demande_id <> dd.demande_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- Plus aucun lien inactif sur une demande PRÊTE/ENVOYÉE sans conflit (doit renvoyer 0) :
--   SELECT count(*) FROM demande_dossier dd JOIN demande d ON d.id = dd.demande_id
--     WHERE d.statut IN ('prete','envoyee') AND NOT dd.actif
--       AND NOT EXISTS (SELECT 1 FROM demande_dossier o WHERE o.dossier_id = dd.dossier_id AND o.actif AND o.demande_id <> dd.demande_id);
--
--   -- Les 4 dossiers de 119 sont de nouveau actifs :
--   SELECT dossier_id, actif FROM demande_dossier WHERE demande_id = 119 ORDER BY dossier_id;
--
--   -- Invariant tenu : aucun dossier actif sur >1 demande (doit renvoyer 0 ligne) :
--   SELECT dossier_id, count(*) FROM demande_dossier WHERE actif GROUP BY dossier_id HAVING count(*) > 1;
