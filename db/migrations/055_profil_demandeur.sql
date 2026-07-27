-- 055_profil_demandeur.sql — Module VEILLE PERMIS (chantier S7e) : DEUX profils de demandeur (société / personne physique).
--
-- MOTIF : le droit d'accès CRPA (L311-1 / L311-9 3°) s'exerce par toute personne, physique ou morale. Disposer d'un
-- profil « personne physique » à côté du profil « société » permet d'exercer ce droit SANS exposer la société
-- (dénomination, forme juridique, qualité du représentant) quand ce n'est pas souhaitable. ⚠️ Ce n'est PAS une demande
-- anonyme : la CADA exige un demandeur IDENTIFIÉ (nom + adresse + e-mail) — le recours en cas de silence de
-- l'administration suppose une identité. Le profil « personne » porte donc une identité réduite mais réelle.
--
-- Ce que fait la migration :
--   1. `config_demandeur` cesse d'être un singleton : on retire le CHECK (id = 1), on ajoute `profil` (CHECK IN
--      ('entreprise','personne')) UNIQUE. La ligne existante devient 'entreprise' ; on insère la ligne 'personne'
--      (tous champs '' comme en 053 — Arno les remplira depuis l'écran Réglages, sans psql).
--   2. `config_veille` reçoit `profil_demandeur_defaut` : le profil utilisé par défaut à la création d'une demande.
--   3. `demande` reçoit `profil_demandeur` : le profil PORTÉ par la demande (fige le modèle de courrier employé).
--
-- SÛR : DDL additive + une ligne de config ; aucun DROP de table/colonne, aucune écriture destructive. Idempotent
-- (IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, ON CONFLICT DO NOTHING). GOLDEN-SAFE : aucun contact
-- moteur/config_scoring/batiment → golden 29.107259068449615 intact. N'ENVOIE RIEN.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/055_profil_demandeur.sql
-- Vérification : \d config_demandeur · SELECT profil FROM config_demandeur ORDER BY profil;
--                \d config_veille (profil_demandeur_defaut) · \d demande (profil_demandeur)

BEGIN;

-- 1) config_demandeur : de singleton à deux profils.
ALTER TABLE config_demandeur DROP CONSTRAINT IF EXISTS config_demandeur_id_check; -- le singleton id=1 saute
ALTER TABLE config_demandeur
  ADD COLUMN IF NOT EXISTS profil text NOT NULL DEFAULT 'entreprise'
    CHECK (profil IN ('entreprise','personne')); -- la ligne existante (id=1) devient 'entreprise'
CREATE UNIQUE INDEX IF NOT EXISTS config_demandeur_profil_key ON config_demandeur (profil);

COMMENT ON COLUMN config_demandeur.profil IS 'Profil de demandeur : « entreprise » (société, identité complète) ou « personne » (personne physique : nom + adresse + e-mail seulement — exercice du droit CRPA sans exposer la société, mais demandeur identifié, pas anonyme).';

-- Ligne « personne » (id explicite : le DEFAULT 1 de la colonne id entrerait en conflit avec la ligne entreprise).
INSERT INTO config_demandeur (id, profil) VALUES (2, 'personne') ON CONFLICT (profil) DO NOTHING;

-- 2) config_veille : profil par défaut à la création.
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS profil_demandeur_defaut text NOT NULL DEFAULT 'entreprise'
    CHECK (profil_demandeur_defaut IN ('entreprise','personne'));
COMMENT ON COLUMN config_veille.profil_demandeur_defaut IS 'Profil de demandeur utilisé par défaut à la création de nouvelles demandes (config_demandeur.profil). Éditable au runtime depuis l''écran Réglages.';

-- 3) demande : profil porté (fige le modèle de courrier employé, auditabilité comme les dest_*).
ALTER TABLE demande
  ADD COLUMN IF NOT EXISTS profil_demandeur text NOT NULL DEFAULT 'entreprise'
    CHECK (profil_demandeur IN ('entreprise','personne'));
COMMENT ON COLUMN demande.profil_demandeur IS 'Profil de demandeur porté par la demande (société / personne). Détermine le modèle de courrier et l''identité vérifiée avant le passage en « prête ». Modifiable uniquement tant que la demande est en « brouillon ».';

COMMIT;
