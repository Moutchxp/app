-- 419_location_apporteur_interne_remuneration.sql — LOCATION, ANNUAIRE DES APPORTEURS (Arno, 24/10/2026) : APPORTEURS INTERNES /
-- EXTERNES, DURÉE DU RÉCURRENT, RÉMUNÉRATION DU COLLÈGUE DE RATTACHEMENT. Suite des 406, 407, 409 et 413 (qu'elle suppose appliquées).
--
-- DÉCISIONS D'ARNO :
--   · « INTERNE = toute personne ayant un compte d'accès à l'interface, quelles que soient ses permissions. Il est lié à son compte. Un
--     apporteur interne n'est rattaché à personne. » — EXTERNE = sans accès : rattachement OBLIGATOIRE à un collègue ;
--   · « Récurrent : […] pendant une DURÉE réglable : un nombre d'années entier (1 minimum) OU “Indéterminée”. Les apporteurs déjà en
--     récurrent passent en “Indéterminée” (leur calcul ne change pas). » ;
--   · « Rémunération de <collègue> (a apporté cet apporteur) : “Aucune rémunération” (défaut pour l'existant) ou “Rémunération” — One
--     shot ou Récurrent, ses propres taux location et gestion, sa propre durée. Versionné (“applicable à partir du”, historique). »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `gestion_location_apporteur.compte_id` : le COMPTE de l'interface d'un apporteur INTERNE (NULL : externe — tous les apporteurs
--     existants le restent ; le passage en interne se fait par `npm run location:apporteurs-internes`, essai par défaut). Un compte
--     n'est l'apporteur qu'UNE fois (index unique partiel, hors archivés) ;
--   · `gestion_location_apporteur_bareme.duree_annees` : la durée du « Récurrent », en années entières (≥ 1). NULL : « Indéterminée »
--     — c'est la valeur de toutes les règles existantes : aucun montant ne change ;
--   · `gestion_location_apporteur_remuneration` : la rémunération du collègue de rattachement d'un apporteur EXTERNE, en versions
--     datées (comme les taux) — aucune ligne : « Aucune rémunération » (l'existant) ;
--   · le journal accepte l'entité « location_apporteur » (passage en interne, journalisé par le script) — la liste existante est lue
--     et complétée, jamais réécrite (la règle des 260, 331 et 418).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`interneDisponible`) : sans elle, tout apporteur est externe, le récurrent est à durée
-- indéterminée, aucun collègue n'est rémunéré, et les gestes qui en ont besoin sont refusés avec ce motif.

ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS compte_id bigint REFERENCES admin_utilisateur(id);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_apporteur_compte_idx
  ON gestion_location_apporteur (compte_id) WHERE compte_id IS NOT NULL AND archive_le IS NULL;

ALTER TABLE gestion_location_apporteur_bareme ADD COLUMN IF NOT EXISTS duree_annees integer;

CREATE TABLE IF NOT EXISTS gestion_location_apporteur_remuneration (
  id                 bigserial PRIMARY KEY,
  apporteur_id       bigint NOT NULL REFERENCES gestion_location_apporteur(id),
  depuis             date NOT NULL,
  remunere           boolean NOT NULL,
  mode               text NOT NULL DEFAULT 'one_shot',
  taux               numeric(7,4) NOT NULL DEFAULT 0,
  taux_gestion       numeric(7,4) NOT NULL DEFAULT 0,
  duree_annees       integer,
  saisi_le           timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle  text,
  UNIQUE (apporteur_id, depuis)
);

DO $$
DECLARE def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_apporteur_bareme_duree_chk') THEN
    ALTER TABLE gestion_location_apporteur_bareme ADD CONSTRAINT gestion_location_apporteur_bareme_duree_chk
      CHECK (duree_annees IS NULL OR duree_annees >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_apporteur_remuneration_chk') THEN
    ALTER TABLE gestion_location_apporteur_remuneration ADD CONSTRAINT gestion_location_apporteur_remuneration_chk
      CHECK (mode IN ('one_shot', 'recurrent') AND taux >= 0 AND taux <= 1 AND taux_gestion >= 0 AND taux_gestion <= 1
             AND (duree_annees IS NULL OR duree_annees >= 1));
  END IF;
  -- Le journal : « location_apporteur » ajoutée à la liste en place (déjà présente ⇒ rien).
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
  END IF;
  IF position('''location_apporteur''' IN def) = 0 THEN
    EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
    EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
            || replace(def, 'ARRAY[', 'ARRAY[''location_apporteur''::text, ');
  END IF;
END $$;

COMMENT ON COLUMN gestion_location_apporteur.compte_id IS
  'Apporteur INTERNE : son compte de l''interface (419, Arno 24/10/2026) — rattaché à personne. NULL : partenaire externe (collègue obligatoire).';
COMMENT ON COLUMN gestion_location_apporteur_bareme.duree_annees IS
  'Durée du « Récurrent », en années entières (≥ 1) depuis la signature. NULL : « Indéterminée » (les règles d''avant la 419).';
COMMENT ON TABLE gestion_location_apporteur_remuneration IS
  'Rémunération du collègue de rattachement d''un apporteur externe, versionnée (419) : la version en vigueur à la signature fait foi. Aucune ligne : aucune rémunération.';
