-- 124_demande_depot_presume.sql — LOT A : TRACE DU SIGNAL « copier » (dépôt téléservice présumé) + VERROU d'unicité par commune.
--
-- CONTEXTE : sur un téléservice (canal 'formulaire' : Paris…), déposer une demande = copier le texte, copier le numéro de
-- permis, puis revenir « Marquer comme déposée » + saisir la référence à la main. Arno veut que les deux clics « copier »
-- VAILLENT signal d'intention. Ce lot CONSTATE ce signal, sans rien décider :
--   · il n'écrit NI demande.statut NI demande_acheminement.envoye_le → AUCUNE échéance CRPA ne court d'ici ;
--   · il pose le VERROU métier voulu par le porteur : tant qu'une demande téléservice est présumée déposée pour une commune,
--     aucune autre ne peut l'être pour la MÊME commune (une seule « en vol » par mairie → l'accusé n'a plus à être discriminant).
--   · il prépare la place des DEUX issues explicites de résolution (« déposée » → marquerDeposee ; « renoncée » → libère la
--     mairie, aucune échéance) — colonnes créées ici, boutons câblés dans un lot ultérieur.
--
-- La FENÊTRE de détection (echeance_detection_le) et le VERROU (resolu_le IS NULL) sont DISTINCTS : la fenêtre PÉRIME ; le
-- verrou dure JUSQU'À RÉSOLUTION et ne se lève jamais seul.
--
-- ADDITIVE PURE : une table neuve + deux index partiels + une contrainte CHECK. Aucun UPDATE/DELETE/DROP/trigger, aucun
-- backfill, une seule transaction. Ne touche NI demande.statut NI l'acheminement NI le moteur de score. « Marquer comme
-- déposée » (marquerDeposee) reste intact.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/124_demande_depot_presume.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS demande_depot_presume (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demande_id            integer     NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
  code_insee            char(5)     NOT NULL,          -- dénormalisé de demande.code_insee : PORTE le verrou par commune (un
                                                       --   index partiel ne peut viser que des colonnes de SA table)
  copie_texte_le        timestamptz,                   -- horodatage du clic « Copier le texte »
  copie_ref_le          timestamptz,                   -- horodatage du clic « Copier le numéro de permis »
  dernier_signal_le     timestamptz NOT NULL,          -- max des deux clics : ancre de la FENÊTRE de détection
  echeance_detection_le timestamptz NOT NULL,          -- dernier_signal_le + délai : PÉREMPTION de la fenêtre (≠ verrou)
  -- RÉSOLUTION — les DEUX issues explicites (préparées ici, actionnées dans un lot suivant) :
  resolu_le             timestamptz,                   -- NULL = VERROU VIVANT ; non-NULL = résolu (verrou levé)
  resolution            text,                          -- 'deposee' (→ marquerDeposee) | 'renoncee' (→ libère la mairie, aucune échéance)
  resolu_par            text,
  cree_le               timestamptz NOT NULL DEFAULT now(),
  maj_le                timestamptz NOT NULL DEFAULT now(),
  -- Cohérence des deux issues : resolu_le et resolution vont ensemble ; resolution ∈ liste fermée quand présente.
  CONSTRAINT demande_depot_presume_resolution_chk
    CHECK ( ((resolu_le IS NULL) = (resolution IS NULL))
            AND (resolution IS NULL OR resolution IN ('deposee', 'renoncee')) )
);

-- ── LE VERROU ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Une seule présomption VIVANTE (resolu_le IS NULL) par commune. MÊME forme prouvée que demande_dossier_unique_actif
-- (migration 053) : index unique PARTIEL. PostgreSQL le fait respecter ATOMIQUEMENT — deux INSERT concurrents pour la même
-- commune : l'un attend l'autre puis échoue en 23505. Insensible à la concurrence, sans verrou applicatif.
CREATE UNIQUE INDEX IF NOT EXISTS demande_depot_presume_verrou_commune
  ON demande_depot_presume (code_insee) WHERE resolu_le IS NULL;

-- Idempotence de l'UPSERT : une seule présomption vivante par DEMANDE (cible du ON CONFLICT — recliquer met à jour, n'empile pas).
CREATE UNIQUE INDEX IF NOT EXISTS demande_depot_presume_demande_vivante
  ON demande_depot_presume (demande_id) WHERE resolu_le IS NULL;

COMMENT ON TABLE demande_depot_presume IS
  'LOT A — dépôt téléservice PRÉSUMÉ (signal des clics « copier »). Verrou d''unicité par commune (index partiel resolu_le IS NULL). Ne modifie jamais la demande elle-même : aucune échéance CRPA ne court d''ici.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — PROUVE, ne suppose pas) :
\echo '>>> ① table + colonnes de résolution présentes :'
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'demande_depot_presume' AND column_name IN ('resolu_le','resolution','resolu_par','echeance_detection_le')
 ORDER BY column_name;
\echo '>>> ② LE VERROU : index unique PARTIEL sur (code_insee) WHERE resolu_le IS NULL :'
SELECT indexdef FROM pg_indexes WHERE indexname = 'demande_depot_presume_verrou_commune';
\echo '>>> ③ aucune échéance possible : la table N''a NI colonne envoye_le NI statut (le verrou ne fait courir aucun délai) :'
SELECT count(*) AS colonnes_interdites FROM information_schema.columns
 WHERE table_name = 'demande_depot_presume' AND column_name IN ('envoye_le','statut');
