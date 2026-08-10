-- 090_renommer_statut_abandonnee_en_annulee.sql — Module VEILLE PERMIS (chantier Q7) : RENOMME la valeur de statut de DEMANDE
-- 'abandonnee' → 'annulee'. Correction de vocabulaire métier : ce que l'app appelait « abandonner » = ANNULER une demande
-- (souvent un groupement) pour REMETTRE ses permis dans le stock demandable (demande_dossier.actif=false → dossiers libérés,
-- de nouveau proposables). Le VRAI abandon — écarter DÉFINITIVEMENT un permis — n'existe pas ; le mot lui est réservé.
-- Le comportement est INCHANGÉ (aucune transition ajoutée/supprimée) : seul le nom de la valeur change. Requiert 053.
--
-- PÉRIMÈTRE STRICT : agit sur la SEULE table `demande` et sa SEULE contrainte `demande_statut_check`. NE TOUCHE PAS
-- `demande_relance.statut` = 'abandonnee' (autre table, autre CHECK `demande_relance_statut_chk`, autre objet : abandon d'une
-- relance / d'une saisine CADA — un vrai abandon de démarche, hors périmètre Q7). `demande_journal` (append-only) N'EST PAS
-- réécrit : ses lignes gardent 'abandonnee' « avec les mots de l'époque » ; c'est leur AFFICHAGE (STATUT_LIBELLE) qui les traduit.
--
-- SÛR : remplace UNIQUEMENT la contrainte CHECK de `demande.statut` (DROP IF EXISTS puis ADD) + UPDATE des lignes 'abandonnee'.
-- Aucun DROP de table/colonne, aucun trigger. GOLDEN-SAFE (n'approche pas le score). Un seul BEGIN/COMMIT. Idempotente
-- (2e exécution : DROP IF EXISTS + UPDATE 0 ligne + ADD → même état). TU NE L'APPLIQUES PAS.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/090_renommer_statut_abandonnee_en_annulee.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- 1) Lever la contrainte le temps de la bascule (elle interdirait encore 'annulee'). La colonne, son défaut ('brouillon')
--    et son NOT NULL sont conservés ; seule la liste fermée change.
ALTER TABLE demande DROP CONSTRAINT IF EXISTS demande_statut_check;

-- 2) Convertir les lignes existantes (99 attendues au moment du chantier). Idempotent : 0 ligne aux exécutions suivantes.
UPDATE demande SET statut = 'annulee', maj_le = now() WHERE statut = 'abandonnee';

-- 3) Recréer la contrainte sur la NOUVELLE liste fermée : 'abandonnee' → 'annulee'. Après l'UPDATE, plus aucune ligne ne
--    porte l'ancienne valeur → l'ADD ne peut pas échouer sur les données existantes.
ALTER TABLE demande ADD CONSTRAINT demande_statut_check
  CHECK (statut IN ('brouillon', 'prete', 'envoyee', 'close', 'annulee'));

COMMENT ON COLUMN demande.statut IS 'Statut d''une demande (liste fermée). brouillon → prete → envoyee → close ; annulee = demande annulée, ses dossiers sont libérés (demande_dossier.actif=false) et redeviennent proposables. Q7 : ''annulee'' a remplacé ''abandonnee'' (le vrai abandon définitif d''un permis n''existe pas). demande_journal (append-only) peut encore contenir ''abandonnee'' pour les lignes d''avant Q7 — traduites à l''affichage.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'demande'::regclass AND conname = 'demande_statut_check';
--   -- attendu : CHECK (statut IN ('brouillon','prete','envoyee','close','annulee'))
--
--   SELECT statut, count(*) FROM demande GROUP BY statut ORDER BY 2 DESC;  -- 'abandonnee' = 0 ; 'annulee' = ex-99
--
--   -- La table VOISINE n'a PAS bougé (hors périmètre Q7) :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_relance_statut_chk';  -- garde 'abandonnee'
--
--   -- Contrôles (en transaction annulée) :
--   -- BEGIN; UPDATE demande SET statut = 'annulee'    WHERE id = (SELECT id FROM demande LIMIT 1); ROLLBACK;  -- OK
--   -- BEGIN; UPDATE demande SET statut = 'abandonnee' WHERE id = (SELECT id FROM demande LIMIT 1); ROLLBACK;  -- ÉCHOUE (hors liste)
