-- 081_selection_candidats.sql — Module VEILLE PERMIS (chantier V2) : rendre PILOTABLES les deux dernières valeurs recopiées
-- en dur du chemin de sélection des candidats aux demandes CRPA : la PROFONDEUR examinée (ex-const NB_CANDIDATS) et l'ORDRE
-- SECONDAIRE de tri (ex-const ORDRE_SECONDAIRE). Invariant « pilotage sans code » : toute variable de moteur est en config,
-- éditable au runtime, avec type + défaut + plage. TU NE L'APPLIQUES PAS. Requiert 080.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, avec CHECK inline). Aucun DROP de table/colonne/index/contrainte,
-- aucun UPDATE, aucun trigger. N'écrit JAMAIS demande.statut. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/081_selection_candidats.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille.nb_candidats_examines : PROFONDEUR du haut du classement examinée pour constituer les demandes (ex-const
--    NB_CANDIDATS=600). Défaut 5000 : large devant le vivier réellement atteignable (~2500 dossiers), pour ne plus rater de
--    dossier récent enterré sous les gros permis anciens (le tri « surface d'abord » remontait ces derniers). Borne
--    100–50000 : plancher pour garder un lot utile, plafond de sécurité.
--    ⚠️ AVERTISSEMENT : au-delà de la taille de la table sitadel_dossier, la requête trie l'INTÉGRALITÉ des lignes ; le tri,
--    porté par une EXPRESSION (rang calculé), ne peut pas s'appuyer sur un index et BASCULE ALORS SUR DISQUE (tri external
--    merge, fichiers temporaires) — plus lent. Rester en deçà de la taille de la table garde un tri top-N en mémoire.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS nb_candidats_examines integer NOT NULL DEFAULT 5000
  CHECK (nb_candidats_examines BETWEEN 100 AND 50000);

COMMENT ON COLUMN config_veille.nb_candidats_examines IS 'Profondeur du haut du classement examinée pour constituer les demandes (ex-const NB_CANDIDATS). Défaut 5000. Au-delà de la taille de sitadel_dossier, le tri (sur expression, non indexable) bascule sur disque : plus lent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) config_veille.tri_candidats : ORDRE SECONDAIRE de départage (après le rang de catégorie), ex-const ORDRE_SECONDAIRE.
--    Variable de GARDE (liste FERMÉE) : une valeur invalide fausserait tout l'ordonnancement. Défaut 'surface_puis_date' =
--    comportement historique (surface décroissante, puis date décroissante, puis num_dau). 'date_puis_surface' inverse les
--    deux premiers critères (les plus RÉCENTS d'abord) — utile quand le haut du classement est saturé de gros permis anciens.
--    ⚠️ Cet ordre gouverne À LA FOIS la sélection des candidats aux demandes ET l'affichage de la liste des dossiers
--    (onglet « Dossiers ») : les deux réutilisent la même requête.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS tri_candidats text NOT NULL DEFAULT 'surface_puis_date'
  CHECK (tri_candidats IN ('surface_puis_date', 'date_puis_surface'));

COMMENT ON COLUMN config_veille.tri_candidats IS 'Ordre secondaire de départage des dossiers (ex-const ORDRE_SECONDAIRE), liste fermée. surface_puis_date = historique (surface puis date) ; date_puis_surface = plus récents d''abord. Gouverne aussi l''ordre de la liste des dossiers affichée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT nb_candidats_examines, tri_candidats FROM config_veille WHERE id = 1;  -- défauts : 5000 / surface_puis_date
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%nb_candidats_examines%' OR conname LIKE '%tri_candidats%';
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET nb_candidats_examines = 99   WHERE id = 1; ROLLBACK;  -- viole le CHECK (min 100)
--   -- BEGIN; UPDATE config_veille SET nb_candidats_examines = 50001 WHERE id = 1; ROLLBACK; -- viole le CHECK (max 50000)
--   -- BEGIN; UPDATE config_veille SET tri_candidats = 'au_hasard'  WHERE id = 1; ROLLBACK;  -- viole la liste fermée
