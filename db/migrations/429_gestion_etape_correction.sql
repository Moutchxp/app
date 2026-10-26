-- 429_gestion_etape_correction.sql — GESTION (Arno, 26/10/2026) : LA CORRECTION MANUELLE DE LA FRISE D'UN ÉVÉNEMENT.
--
-- DEMANDE D'ARNO : « quand l'automatisation s'est trompée, pouvoir FACILEMENT modifier chaque point et chaque carte de la frise,
-- et notamment transformer un point d'information en carte d'étape, et inversement. LA CORRECTION HUMAINE FAIT FOI : une relève,
-- un reclassement ou un rattrapage ultérieurs ne doivent JAMAIS écraser un type, un titre, une date ou un statut corrigé à la main.
-- Garde la valeur d'origine calculée par l'automatisation, et une action « Revenir au classement automatique ». »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur `gestion_monga_etape` :
--   · `auto_*`      — la valeur d'ORIGINE (type, titre, date, heure connue, jour connu, statut), copiée au PREMIER geste de correction
--                     d'une étape venue de Monga. NULL tant que personne n'a corrigé : la ligne EST alors sa valeur automatique.
--                     C'est aussi ce que lit la relève pour ne jamais recréer l'étape qu'un humain a transformée (même mail, type
--                     d'origine), et ce que « Revenir au classement automatique » remet.
--   · `corrige_*`   — quand, et par qui (identifiant + nom figé en texte), la dernière correction a été faite.
-- Le détail de chaque correction (avant / après) est écrit au journal append-only existant (`gestion_journal`).
--
-- AUCUNE ligne n'est modifiée ni supprimée : toutes les nouvelles colonnes naissent NULL. IDEMPOTENTE (rejouable). Pas de
-- BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le panneau de correction s'affiche en lecture, avec la mention que la
-- correction sera disponible après la mise à jour, et la relève fait exactement ce qu'elle faisait.

ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_type text;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_titre text;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_survenu_le timestamptz;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_heure_connue boolean;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_jour_connu boolean;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS auto_statut text;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS corrige_le timestamptz;
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS corrige_par bigint REFERENCES admin_utilisateur(id);
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS corrige_par_libelle text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_monga_etape_auto_statut_chk') THEN
    ALTER TABLE gestion_monga_etape ADD CONSTRAINT gestion_monga_etape_auto_statut_chk
      CHECK (auto_statut IS NULL OR auto_statut IN ('vif', 'retire'));
  END IF;
END $$;

-- La relève cherche « une étape de CE mail dont le type d'origine est celui-ci » avant d'en créer une : index partiel, minuscule
-- (seules les étapes corrigées y entrent).
CREATE INDEX IF NOT EXISTS gestion_monga_etape_auto_type_idx
  ON gestion_monga_etape (message_id, auto_type)
  WHERE auto_type IS NOT NULL;

COMMENT ON COLUMN gestion_monga_etape.auto_type IS
  'Correction manuelle (429) : le type calculé par l''automatisation, gardé au premier geste de correction. NULL = jamais corrigée.';
COMMENT ON COLUMN gestion_monga_etape.corrige_par_libelle IS
  'Correction manuelle (429) : nom figé en texte de l''auteur de la dernière correction (la correction humaine fait foi).';
