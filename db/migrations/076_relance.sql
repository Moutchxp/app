-- 076_relance.sql — Module VEILLE PERMIS (chantier R6b) : BROUILLON de RELANCE à l'échéance d'un mois.
-- ⚠️ Ce chantier ne fait que PRÉPARER un texte : aucun envoi, aucune alerte, demande.statut jamais écrit. La saisine CADA
-- sera un chantier SÉPARÉ — la colonne `type` prévoit l'extension mais sa liste reste fermée à 'relance' pour l'instant.
-- AUCUN nouveau job launchd, AUCUNE nouvelle clé de verrou (le déclenchement passe par le corps d'executerVeille, déjà sous
-- CLE_VERROU). TU NE L'APPLIQUES PAS. Prérequis d'ordre : 075 appliquée avant.
--
-- SÛR : DDL ADDITIVE (CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucun trigger, aucune donnée modifiée. GOLDEN-SAFE.
-- Un seul BEGIN/COMMIT. Idempotente (rejouable sans effet).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/076_relance.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- demande_relance — brouillon de relance rattaché à UNE demande. `type` = 'relance' aujourd'hui (liste fermée ; la saisine
-- CADA viendra dans un chantier dédié). `statut` : brouillon (généré, non envoyé) → envoyee (chantier d'envoi ultérieur) ou
-- abandonnee. `objet`/`corps` FIGÉS à la génération (comme le courrier initial). `generee_le` = fait ; `envoyee_le` posée à
-- l'envoi réel (plus tard). N'écrit JAMAIS demande.statut.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demande_relance (
  id                bigserial   PRIMARY KEY,
  demande_id        bigint      NOT NULL REFERENCES demande(id),
  type              text        NOT NULL DEFAULT 'relance'
                      CONSTRAINT demande_relance_type_chk CHECK (type IN ('relance')),
  objet             text        NOT NULL,
  corps             text        NOT NULL,
  profil_demandeur  text        NOT NULL
                      CONSTRAINT demande_relance_profil_chk CHECK (profil_demandeur IN ('entreprise','personne')),
  statut            text        NOT NULL DEFAULT 'brouillon'
                      CONSTRAINT demande_relance_statut_chk CHECK (statut IN ('brouillon','envoyee','abandonnee')),
  generee_le        timestamptz NOT NULL DEFAULT now(),
  envoyee_le        timestamptz,
  note              text
);

COMMENT ON TABLE demande_relance IS 'Brouillons de relance CRPA (chantier R6b) : texte préparé à l''échéance d''un mois, JAMAIS envoyé ici. type=''relance'' (la saisine CADA sera un type séparé). N''écrit jamais demande.statut.';

CREATE INDEX IF NOT EXISTS demande_relance_demande_idx ON demande_relance (demande_id);

-- UNE SEULE relance VIVANTE par demande et par type : l'unique partiel exclut les abandonnées (on peut réabandonner puis
-- régénérer). C'est le garde-fou dur derrière la vérification applicative « relance vivante déjà présente ? ».
CREATE UNIQUE INDEX IF NOT EXISTS demande_relance_vivante_uniq
  ON demande_relance (demande_id, type) WHERE statut <> 'abandonnee';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_relance
--   SELECT indexname FROM pg_indexes WHERE tablename = 'demande_relance';
--
--   -- (a) listes fermées (type / profil / statut) lisibles :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'demande_relance'::regclass AND contype = 'c';
--
--   -- (b) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO demande_relance (demande_id, type, objet, corps, profil_demandeur)
--   --   VALUES ((SELECT id FROM demande LIMIT 1), 'cada', 'o', 'c', 'entreprise'); ROLLBACK;  -- viole type_chk (liste fermée)
--   -- BEGIN; INSERT INTO demande_relance (demande_id, objet, corps, profil_demandeur, statut)
--   --   VALUES ((SELECT id FROM demande LIMIT 1), 'o', 'c', 'entreprise', 'brouillon'); ...
--   --   puis un 2e INSERT identique dans la MÊME transaction → viole demande_relance_vivante_uniq ; ROLLBACK;
