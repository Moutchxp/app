-- 411_location_origine_personnalisee.sql — LOCATION « SUIVI COMMERCIAL » (Arno, 24/10/2026) : L'ORIGINE DU CONTACT « PERSONNALISÉ ».
-- Suite de la 407 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « ajouter en fin de liste “Personnalisé” ; choisi, un champ texte apparaît (obligatoire, 80 caractères max) pour
-- saisir l'origine voulue. Stocké et affiché tel quel dans le Suivi du mois et les exports ; regroupé sous “Personnalisé” dans les
-- totaux par origine. »
--
-- CE QU'ELLE FAIT, EN AJOUT (aucune ligne n'est modifiée ni supprimée) :
--   · la colonne `gestion_location_activite.origine_contact_precision` (texte, 80 caractères au plus, NULL permis) ;
--   · la liste admise de `origine_contact` (contrainte CHECK posée par la 407) reçoit la valeur « personnalise » : la contrainte est
--     retirée puis reposée, élargie — les valeurs déjà admises le restent toutes.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, « Personnalisé » n'est pas proposé (`personnalisableDisponible`) et
-- la colonne n'est jamais nommée.

ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS origine_contact_precision text;

DO $$
DECLARE c record;
BEGIN
  -- La contrainte de la 407 porte un nom engendré : on retire TOUTE contrainte CHECK de la table qui porte sur origine_contact
  -- (et seulement elles), puis on pose la nôtre, nommée.
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'gestion_location_activite'::regclass AND con.contype = 'c'
       AND (pg_get_constraintdef(con.oid) LIKE '%(origine_contact = ANY%' OR pg_get_constraintdef(con.oid) LIKE '%origine_contact IN%')
       AND con.conname <> 'gestion_location_activite_origine_contact_liste_chk'
  LOOP
    EXECUTE format('ALTER TABLE gestion_location_activite DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_origine_contact_liste_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_origine_contact_liste_chk
      CHECK (origine_contact IS NULL OR origine_contact IN
        ('collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'passage_agence', 'campagne', 'personnalise'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_origine_precision_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_origine_precision_chk
      CHECK (origine_contact_precision IS NULL OR char_length(origine_contact_precision) BETWEEN 1 AND 80);
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_activite.origine_contact_precision IS
  'Le texte d''une origine du contact « Personnalisé » (411, Arno 24/10/2026), 80 caractères au plus ; NULL pour toute autre origine.';
