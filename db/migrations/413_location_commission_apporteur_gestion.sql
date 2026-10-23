-- 413_location_commission_apporteur_gestion.sql — LOCATION « OUTILS DE SUIVI » (Arno, 24/10/2026) : LA COMMISSION D'APPORTEUR
-- « ONE SHOT » / « RÉCURRENT », PART LOCATION + PART GESTION. Suite de la 406 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « Le formulaire commence par un choix : “One shot” ou “Récurrent”. Puis deux taux : “Taux sur la location (%)” et
-- “Taux sur la gestion (%)”, plus “Applicable à partir du” (versionné, jamais rétroactif). […] Les règles existantes (un seul taux sur
-- la location) sont reprises en “One shot — location X %, gestion 0 %” : aucun montant historique ne change. »
--
-- CE QU'ELLE FAIT, EN AJOUT (aucune ligne n'est supprimée ; aucune valeur existante n'est modifiée) :
--   · `gestion_location_apporteur_bareme.mode` ('one_shot' | 'recurrent') et `.taux_gestion` (fraction 0 → 1, comme `taux`). Les
--     colonnes naissent avec leur valeur par défaut — « One shot », 0 % — : c'est la REPRISE des règles existantes ;
--   · sur `gestion_location_activite` (une ligne par bail) : `apporteur_mode` et `apporteur_taux_gestion` (le choix de CE bail ;
--     NULL = la règle de l'apporteur à la signature), et `taux_gestion_bien_ht` (le taux de gestion HT du bien RELEVÉ à la
--     signature, en %, ex. 4,5). Les lignes existantes restent NULL : sans taux de gestion relevé, leur part gestion vaut 0 — le
--     contrôle au centime des historiques importés ne bouge pas.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`commissionGestionDisponible`) : sans elle, les règles se lisent « One shot — gestion
-- 0 % », une règle « Récurrent » ou avec un taux sur la gestion est refusée (elle serait perdue), et rien de la part gestion n'est écrit.

ALTER TABLE gestion_location_apporteur_bareme
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'one_shot',
  ADD COLUMN IF NOT EXISTS taux_gestion numeric(7,4) NOT NULL DEFAULT 0;

ALTER TABLE gestion_location_activite
  ADD COLUMN IF NOT EXISTS apporteur_mode text,
  ADD COLUMN IF NOT EXISTS apporteur_taux_gestion numeric(7,4),
  ADD COLUMN IF NOT EXISTS taux_gestion_bien_ht numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_apporteur_bareme_mode_chk') THEN
    ALTER TABLE gestion_location_apporteur_bareme ADD CONSTRAINT gestion_location_apporteur_bareme_mode_chk
      CHECK (mode IN ('one_shot', 'recurrent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_apporteur_bareme_taux_gestion_chk') THEN
    ALTER TABLE gestion_location_apporteur_bareme ADD CONSTRAINT gestion_location_apporteur_bareme_taux_gestion_chk
      CHECK (taux_gestion >= 0 AND taux_gestion <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_apporteur_mode_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_apporteur_mode_chk
      CHECK (apporteur_mode IS NULL OR apporteur_mode IN ('one_shot', 'recurrent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_apporteur_taux_gestion_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_apporteur_taux_gestion_chk
      CHECK (apporteur_taux_gestion IS NULL OR (apporteur_taux_gestion >= 0 AND apporteur_taux_gestion <= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_taux_gestion_bien_chk') THEN
    ALTER TABLE gestion_location_activite ADD CONSTRAINT gestion_location_activite_taux_gestion_bien_chk
      CHECK (taux_gestion_bien_ht IS NULL OR (taux_gestion_bien_ht >= 0 AND taux_gestion_bien_ht <= 100));
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_apporteur_bareme.mode IS
  'Commission d''apporteur : one_shot (part gestion = taux × honoraires de gestion mensuels × 12, à la signature) ou recurrent (chaque mois en gestion) — 413, Arno 24/10/2026.';
COMMENT ON COLUMN gestion_location_apporteur_bareme.taux_gestion IS
  'Taux de l''apporteur sur la gestion (fraction). Les règles d''avant la 413 : 0 (One shot — gestion 0 %).';
COMMENT ON COLUMN gestion_location_activite.taux_gestion_bien_ht IS
  'Taux de gestion HT du bien relevé à la signature (en %) : honoraires de gestion mensuels = loyer CC × ce taux. NULL : part gestion 0.';
