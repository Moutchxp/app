-- 150_emprise_par_batiment.sql — Module VEILLE PERMIS (chantier PROJ-2b) : l'emprise reconstituée est désormais rattachée à UN
-- BÂTIMENT du permis (permis_corps_batiment), et une projection peut être explicitement IGNORÉE par bâtiment (avec motif).
--
-- POURQUOI : PROJ-2 clait l'emprise au DOSSIER seul (dossier_id + libellé texte). Or un permis porte souvent PLUSIEURS bâtiments
-- (11434 = 2D1 + 2D2) : sans lien vers le bâtiment, on ne sait pas quelle emprise correspond à quoi. PROJ-2b intègre le tracé
-- DANS l'onglet Rattachement, bâtiment par bâtiment, et en fait un PRÉALABLE à la validation : chaque bâtiment doit avoir soit une
-- emprise tracée, soit une projection explicitement ignorée (motif obligatoire, réversible, tracée au journal append-only).
--
-- 🔴 GARDE FONDAMENTALE INCHANGÉE (PROJ-2) : une emprise reste une RECONSTITUTION, jamais une mesure. CHECK (reconstitution = true)
-- conservé, aucune écriture vers batiment / verdict / altitude / certificat. Ce lot n'AJOUTE qu'un lien vers le bâtiment déclaré et
-- un registre d'« ignorances » — il n'ouvre AUCUN chemin de la reconstitution vers le moteur (garde statique toujours testée).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS ; CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucune écriture de
-- données. GOLDEN-SAFE. Idempotent. Un seul BEGIN/COMMIT. AUCUN ENVOI. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/150_emprise_par_batiment.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- 1) L'emprise reconstituée pointe vers le BÂTIMENT déclaré du permis. Nullable (compat des rares lignes PROJ-2 d'avant ce lot) ;
--    toute nouvelle écriture applicative fournit corps_id. ON DELETE CASCADE : si le bâtiment disparaît, son emprise aussi.
ALTER TABLE permis_emprise_reconstruite
  ADD COLUMN IF NOT EXISTS corps_id bigint REFERENCES permis_corps_batiment(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS permis_emprise_reconstruite_corps_idx ON permis_emprise_reconstruite (corps_id);

-- 2) Registre des projections IGNORÉES, par bâtiment. Présence d'une ligne = projection ignorée (RÉVERSIBLE : on supprime la ligne
--    pour tracer finalement). Motif OBLIGATOIRE (NOT NULL). UNIQUE (corps_id) = au plus une décision d'ignorance courante par bâtiment.
--    ⚠️ L'AUDIT reste au journal append-only (permis_rattachement_evenement, types 'projection_ignoree'/'projection_retablie') :
--    cette table ne porte QUE l'état COURANT, jamais l'historique.
CREATE TABLE IF NOT EXISTS permis_projection_ignoree (
  id         bigserial PRIMARY KEY,
  dossier_id bigint NOT NULL REFERENCES sitadel_dossier(id)      ON DELETE CASCADE,
  corps_id   bigint NOT NULL REFERENCES permis_corps_batiment(id) ON DELETE CASCADE,
  motif      text   NOT NULL,
  par        text,
  le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permis_projection_ignoree_corps_unique UNIQUE (corps_id),
  CONSTRAINT permis_projection_ignoree_motif_chk CHECK (btrim(motif) <> '')  -- un motif vide n'a pas de valeur d'audit
);
CREATE INDEX IF NOT EXISTS permis_projection_ignoree_dossier_idx ON permis_projection_ignoree (dossier_id);

COMMENT ON COLUMN permis_emprise_reconstruite.corps_id IS 'PROJ-2b — bâtiment déclaré (permis_corps_batiment) que cette emprise reconstitue. Un permis peut porter plusieurs bâtiments → une emprise chacun. NULL = ligne PROJ-2 antérieure au rattachement par bâtiment.';
COMMENT ON TABLE permis_projection_ignoree IS 'PROJ-2b — bâtiments dont la projection d''emprise est explicitement IGNORÉE (motif obligatoire). État COURANT uniquement (réversible = suppression de la ligne) ; l''historique vit au journal append-only permis_rattachement_evenement. Permet de débloquer la validation d''un dossier sans tracer un bâtiment (cas particulier assumé).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'permis_emprise_reconstruite' AND column_name = 'corps_id'; -- présente
--   SELECT conname FROM pg_constraint WHERE conname IN ('permis_projection_ignoree_corps_unique','permis_projection_ignoree_motif_chk'); -- 2 lignes
--   -- Garde inchangée : permis_emprise_reconstruite.reconstitution reste NOT NULL DEFAULT true avec son CHECK (= true).
