-- 469_gestion_tache_sorte_rdv.sql — GESTION (Arno, 11/11/2026, lot C) : « RDV / TÂCHES » — LE TYPE D'UNE ENTRÉE DU MODULE.
--
-- LE BESOIN (Arno) : la fenêtre de création commence par un choix OBLIGATOIRE — « Rendez-vous » (date, heure de début et DURÉE
-- obligatoires) ou « Tâche » (date seule obligatoire). Le type est enregistré, affiché sur la carte et dans les listes (« RDV » /
-- « Tâche »), filtrable en pleine page. Les tâches existantes sont des « Tâche » ; la pré-visite et l'état des lieux de sortie sont des
-- « Rendez-vous ».
--
-- CE QU'ELLE FAIT :
--   · `gestion_tache.sorte` ('rdv' | 'tache'), NON NULL, valeur par défaut 'tache' : toute tâche existante est une « Tâche » ;
--   · les tâches des PRÉ-VISITES (464) et des ÉTATS DES LIEUX DE SORTIE (385) existantes passent en 'rdv' (seule mise à jour de données,
--     bornée à ces liens ; aucune autre colonne touchée, rien d'effacé).
--
-- Sans elle : la fenêtre garde son fonctionnement d'avant (aucun choix de type), rien n'est cassé.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose gestion_tache.

ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS sorte text NOT NULL DEFAULT 'tache';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_tache_sorte_chk') THEN
    ALTER TABLE gestion_tache ADD CONSTRAINT gestion_tache_sorte_chk CHECK (sorte IN ('rdv', 'tache'));
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.gestion_location_previsite') IS NOT NULL THEN
    UPDATE gestion_tache SET sorte = 'rdv'
     WHERE sorte = 'tache' AND id IN (SELECT tache_id FROM gestion_location_previsite WHERE tache_id IS NOT NULL);
  END IF;
  IF to_regclass('public.gestion_location_edls') IS NOT NULL THEN
    UPDATE gestion_tache SET sorte = 'rdv'
     WHERE sorte = 'tache' AND id IN (SELECT tache_id FROM gestion_location_edls WHERE tache_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN gestion_tache.sorte IS
  'Rendez-vous (rdv : date, heure et durée) ou tâche (tache : date seule) — migration 469 ; les tâches d’avant sont des « tache ».';
