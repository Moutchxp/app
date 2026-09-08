-- LOT « page traçable à la main » — DÉBLOCAGE MANUEL de la traçabilité d'UNE PAGE (réversible). Certaines vues en plan parfaitement
-- exploitables sont rangées par la classification auto dans un type non traçable (repli famille inconnue → « plan », ou 'coupe'/'cerfa').
-- Arno peut DÉCLARER une page exploitable pour le tracé : on persiste CE geste, grain = LA PAGE. Identité STABLE = (piece_id =
-- dossier_document.id, page 1-based) — MÊME clé que les exclusions/inclusions du best-of (migrations 190/194), dont ceci est le 3e miroir.
-- La classification AUTO n'est jamais touchée ; on ajoute seulement, par page, une traçabilité VRAIE de plus, lue AUSSI par la route
-- d'enregistrement /emprise (qui revérifie le verrou métier et lèverait un 400 sans ce registre).
-- FK ON DELETE CASCADE → une pièce retirée/remplacée en GED (nouvel id) rend le déblocage SANS OBJET (jamais bloquer une autre page).
-- Le code est RÉSILIENT si la table manque (42P01 → aucun déblocage, comportement d'avant : ces pages restent non traçables).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_page_tracable_manuel (
  dossier_id   bigint      NOT NULL REFERENCES sitadel_dossier(id)   ON DELETE CASCADE,
  piece_id     bigint      NOT NULL REFERENCES dossier_document(id)  ON DELETE CASCADE,
  page         integer     NOT NULL CHECK (page >= 1),
  debloque_le  timestamptz NOT NULL DEFAULT now(),
  debloque_par text,
  PRIMARY KEY (piece_id, page)
);

CREATE INDEX IF NOT EXISTS permis_page_tracable_manuel_dossier_idx ON permis_page_tracable_manuel (dossier_id);

COMMENT ON TABLE permis_page_tracable_manuel IS 'Déblocage MANUEL de la traçabilité d''une page (réversible), 3e miroir des exclusions/inclusions best-of (190/194). PK (piece_id, page) = identité stable ; FK ON DELETE CASCADE → déblocage sans objet si la pièce quitte la GED. Lue par /emprise pour lever le verrou métier à l''enregistrement.';

COMMIT;
