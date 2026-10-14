-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 351 — LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) : LE RATTACHEMENT CHOISI DANS LE COMPOSEUR, COMPLET.
--
-- « Classer ce mail » du composeur ouvre la MÊME fenêtre que « Modifier le rattachement » : biens actuellement suivis
-- (case à cocher), propositions et recherche, événement, PORTÉE DU SUIVI (4 positions). Rien n'est écrit avant l'envoi :
-- les choix sont gardés avec le brouillon, voyagent avec l'envoi, et sont appliqués — par `poserClassement`, la fonction
-- de « Modifier le rattachement » — une fois le mail parti ET capturé par la relève.
--
-- ADDITIF SEULEMENT : deux colonnes facultatives et une table. Aucune donnée existante n'est touchée.
--   · gestion_brouillon.rattachement   — la portée choisie et les biens du suivi de fond décochés, avec le brouillon ;
--   · gestion_envoi_file.rattachement  — les mêmes, le temps que l'envoi attende dans la file ;
--   · gestion_envoi_classement         — l'intention attachée à l'envoi parti, jusqu'à ce que la relève capture le mail.
-- ⚠️ AUCUNE CASCADE : une intention appliquée est une trace (qui, quand, quel mail, quelle issue) et ne s'efface pas.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_brouillon ADD COLUMN IF NOT EXISTS rattachement jsonb;
ALTER TABLE gestion_envoi_file ADD COLUMN IF NOT EXISTS rattachement jsonb;

CREATE TABLE IF NOT EXISTS gestion_envoi_classement (
  id bigserial PRIMARY KEY,
  envoi_id bigint NOT NULL REFERENCES gestion_envoi(id),
  -- Les biens choisis dans les propositions et la recherche : [{cle, libelle}].
  biens jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Les biens du suivi de fond DÉCOCHÉS dans le bloc « Biens actuellement suivis » : [cle].
  retires jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- La position de la glissière touchée à la main ; NULL = la position par défaut de la fenêtre pour ce mail.
  position text,
  auteur_id bigint REFERENCES admin_utilisateur(id),
  auteur_libelle text NOT NULL,
  pose_le timestamptz NOT NULL DEFAULT now(),
  applique_le timestamptz,
  message_id bigint REFERENCES gestion_message(id),
  -- Ce que l'application a fait : « origine : rien à écrire », « pose : suite », ou le refus de poserClassement.
  issue text,
  CONSTRAINT gestion_envoi_classement_envoi_unique UNIQUE (envoi_id),
  CONSTRAINT gestion_envoi_classement_position_chk
    CHECK (position IS NULL OR position = ANY (ARRAY['origine', 'one_shot', 'suite', 'conversation'])),
  CONSTRAINT gestion_envoi_classement_humain_chk
    CHECK (btrim(auteur_libelle) <> '' AND lower(btrim(auteur_libelle)) <> 'automatique'),
  CONSTRAINT gestion_envoi_classement_application_chk
    CHECK ((applique_le IS NULL AND message_id IS NULL) OR (applique_le IS NOT NULL AND message_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_envoi_classement_attente_idx
  ON gestion_envoi_classement (envoi_id) WHERE applique_le IS NULL;
