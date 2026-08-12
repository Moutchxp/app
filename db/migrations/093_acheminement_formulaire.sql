-- 093_acheminement_formulaire.sql — Module VEILLE PERMIS (chantier B2) : le canal TÉLÉSERVICE entre dans le registre juridique.
-- ⚠️ Un dépôt manuel sur téléservice (marquerDeposee) passait la demande en 'envoyee' SANS écrire de ligne
-- demande_acheminement → pas d'ancre envoye_le → etatEcheance reste « pas encore envoyée » → aucune relance, aucune saisine
-- CADA possible, pour TOUTES les communes à téléservice (la demande 119 aujourd'hui). Cette migration (a) autorise le canal
-- 'formulaire' dans le registre, (b) répare les dépôts déjà passés en ancrant envoye_le sur l'horodatage du dépôt lu dans
-- demande_journal (source, pas une date devinée). Requiert 073.
--
-- SÛR : RECRÉATION de la SEULE contrainte CHECK des canaux (DROP+ADD, même transaction : ÉLARGISSEMENT de la liste fermée,
-- jamais un rétrécissement ; toutes les valeurs existantes restent valides) + un INSERT de réparation borné et idempotent.
-- N'écrit JAMAIS demande.statut. Ne touche PAS le chemin e-mail. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente (2ᵉ exécution :
-- DROP IF EXISTS + ADD identiques ; l'INSERT ne cible que les demandes SANS ligne d'acheminement → 0 ligne). TU NE L'APPLIQUES PAS.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/093_acheminement_formulaire.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- 1) Le registre juridique accepte désormais le canal TÉLÉSERVICE ('formulaire'), en plus d'e-mail et recommandé.
ALTER TABLE demande_acheminement DROP CONSTRAINT IF EXISTS demande_acheminement_canal_chk;
ALTER TABLE demande_acheminement ADD CONSTRAINT demande_acheminement_canal_chk
  CHECK (canal IN ('email', 'recommande', 'formulaire'));

-- 2) RÉPARATION : pour chaque demande FORMULAIRE déjà passée en 'envoyee' mais SANS ligne d'acheminement, créer la ligne
--    manquante. `envoye_le` = horodatage du dépôt trouvé dans demande_journal (statut→envoyee, motif « dépôt manuel … ») :
--    la SOURCE de ce qui s'est passé, jamais une date inventée. message_id / retour_fournisseur restent NULL (un dépôt
--    téléservice n'en produit pas). Attendu aujourd'hui : 1 ligne (demande 119).
INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le)
SELECT d.id, 'formulaire', 'envoye',
       (SELECT j.horodatage FROM demande_journal j
         WHERE j.demande_id = d.id AND j.statut_apres = 'envoyee' AND j.motif LIKE 'dépôt manuel%'
         ORDER BY j.id ASC LIMIT 1)
  FROM demande d
 WHERE d.dest_canal = 'formulaire' AND d.statut = 'envoyee'
   AND NOT EXISTS (SELECT 1 FROM demande_acheminement a WHERE a.demande_id = d.id)
   AND EXISTS (SELECT 1 FROM demande_journal j WHERE j.demande_id = d.id AND j.statut_apres = 'envoyee' AND j.motif LIKE 'dépôt manuel%');

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_acheminement_canal_chk';
--     -- doit lister : email, recommande, formulaire
--
--   -- La demande 119 a désormais sa ligne d'acheminement AVEC envoye_le (= son horodatage de dépôt du journal) :
--   SELECT demande_id, canal, statut, envoye_le, message_id FROM demande_acheminement WHERE demande_id = 119;
--
--   -- Plus aucune demande formulaire ENVOYÉE sans ligne d'acheminement (doit renvoyer 0) :
--   SELECT count(*) FROM demande d WHERE d.dest_canal = 'formulaire' AND d.statut = 'envoyee'
--     AND NOT EXISTS (SELECT 1 FROM demande_acheminement a WHERE a.demande_id = d.id);
