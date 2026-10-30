-- 443_transaction_personne_type.sql — LOT BJ (Arno, 30/10/2026) : LES VENDEURS ET ACQUÉREURS — PARTICULIER OU SOCIÉTÉ, ET SES REPRÉSENTANTS.
--
--   · sur `transaction_personne`, trois colonnes NEUVES et vides :
--       - `type` : 'particulier' ou 'societe' ; NULL (toutes les fiches d'avant) : un particulier, son ancien texte dans « Nom » ;
--       - `civilite` : 'M.' ou 'Mme' (facultative) ; NULL : non renseignée ;
--       - `prenom` : le prénom d'un particulier ou d'un représentant (facultatif) ; pour une société, `nom` est le nom de la société ;
--   · `transaction_personne_representant` : les représentants d'une société (chacun est une fiche `transaction_personne`, particulier),
--     dans l'ordre (`rang`) ; un représentant se retire par `retire_le` (réversible), jamais supprimé.
--   · 🔴 RIEN NE S'EFFACE : ni DELETE ni TRUNCATE sur la table neuve (la fonction de la 433, comme la 434).
-- AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour
-- l'enveloppe dans UNE transaction. Suppose la 434.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, les fiches se lisent comme avant (un nom, des coordonnées) et s'affichent comme des
-- particuliers ; le choix « Société », la civilité, le prénom et les représentants ne s'enregistrent pas (message clair, rien n'est écrit).

ALTER TABLE transaction_personne ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE transaction_personne DROP CONSTRAINT IF EXISTS transaction_personne_type_check;
ALTER TABLE transaction_personne ADD CONSTRAINT transaction_personne_type_check CHECK (type IS NULL OR type IN ('particulier', 'societe'));
ALTER TABLE transaction_personne ADD COLUMN IF NOT EXISTS civilite text;
ALTER TABLE transaction_personne DROP CONSTRAINT IF EXISTS transaction_personne_civilite_check;
ALTER TABLE transaction_personne ADD CONSTRAINT transaction_personne_civilite_check CHECK (civilite IS NULL OR civilite IN ('M.', 'Mme'));
ALTER TABLE transaction_personne ADD COLUMN IF NOT EXISTS prenom text;
COMMENT ON COLUMN transaction_personne.type IS 'particulier | societe — migration 443 ; NULL : fiche d''avant, lue comme un particulier (son texte dans « Nom »).';
COMMENT ON COLUMN transaction_personne.civilite IS 'M. | Mme (facultative) — migration 443.';
COMMENT ON COLUMN transaction_personne.prenom IS 'Prénom d''un particulier ou d''un représentant (facultatif) — migration 443.';

CREATE TABLE IF NOT EXISTS transaction_personne_representant (
  id                 bigserial     PRIMARY KEY,
  societe_id         bigint        NOT NULL REFERENCES transaction_personne(id),
  personne_id        bigint        NOT NULL REFERENCES transaction_personne(id),
  rang               integer       NOT NULL DEFAULT 0,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text,
  CHECK (societe_id <> personne_id)
);
CREATE INDEX IF NOT EXISTS transaction_personne_representant_societe_idx ON transaction_personne_representant (societe_id) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_personne_representant IS 'Les représentants d''une société vendeuse ou acquéreuse (migration 443) ; retirés par retire_le, jamais supprimés.';

-- ── Ni DELETE ni TRUNCATE sur la table neuve (la fonction de la 433) ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_personne_representant_sans_effacement') THEN
    CREATE TRIGGER transaction_personne_representant_sans_effacement BEFORE DELETE ON transaction_personne_representant
      FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_personne_representant_sans_vidage') THEN
    CREATE TRIGGER transaction_personne_representant_sans_vidage BEFORE TRUNCATE ON transaction_personne_representant
      FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;
