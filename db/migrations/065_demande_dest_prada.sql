-- 065_demande_dest_prada.sql — Module VEILLE PERMIS (chantier S14d) : tracer l'ORIGINE du destinataire d'une demande.
--
-- MOTIF : le destinataire peut désormais être la PRADA (Personne Responsable de l'Accès aux Documents Administratifs) de
-- la commune plutôt que le contact générique `mairie_contact`. `demande` figeait déjà l'ENVELOPPE (dest_canal/email/url/
-- adresse) mais ne disait NI pourquoi ce destinataire a été retenu (PRADA vs contact générique), NI l'identité de la PRADA.
-- Sans cette trace, une demande n'est plus auditable (« à qui, et pourquoi lui ? »). On ajoute donc, au même titre que les
-- `dest_*` déjà figés à la création (le registre peut évoluer ensuite), l'origine + le lien vers la ligne d'annuaire + le
-- nom instantané de la PRADA.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun NOT NULL sans défaut (dest_origine a un
-- DEFAULT → les lignes existantes restent valides). Aucune modif de commune / mairie_contact / config_* / sitadel_*.
-- GOLDEN-SAFE. Idempotent (IF NOT EXISTS + garde DO/EXCEPTION sur la contrainte). Un seul BEGIN/COMMIT. Application MANUELLE
-- (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/065_demande_dest_prada.sql
-- Vérification : \d demande

BEGIN;

ALTER TABLE demande ADD COLUMN IF NOT EXISTS dest_origine text NOT NULL DEFAULT 'mairie_contact';
DO $$ BEGIN
  ALTER TABLE demande ADD CONSTRAINT demande_dest_origine_chk CHECK (dest_origine IN ('mairie_contact','prada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE demande ADD COLUMN IF NOT EXISTS dest_prada_import_id bigint REFERENCES prada_import(id);
ALTER TABLE demande ADD COLUMN IF NOT EXISTS dest_nom text;

COMMENT ON COLUMN demande.dest_origine IS 'Pourquoi ce destinataire : mairie_contact (contact générique de la mairie) | prada (courriel de la PRADA). Trace l''arbitrage pour l''auditabilité — un e-mail ne dit pas à lui seul s''il vient de la PRADA ou du contact générique.';
COMMENT ON COLUMN demande.dest_prada_import_id IS 'Ligne prada_import (annuaire CADA) à l''origine du destinataire quand dest_origine = ''prada'' ; NULL sinon.';
COMMENT ON COLUMN demande.dest_nom IS 'Instantané du nom de la PRADA au moment de la création (le registre PRADA peut évoluer ensuite), au même titre que les autres dest_* figés. NULL si destinataire = contact générique.';

COMMIT;
