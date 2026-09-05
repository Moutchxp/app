-- LOT 92 — PAGES AJOUTÉES AU BEST-OF à la main (réversible). MIROIR de `permis_best_of_exclusion` (LOT 61, migration 190) : le best-of
-- reste calculé à la volée depuis la GED (classement contenu-prioritaire, LOTs 87/88), et on lui AJOUTE ces pages. Identité STABLE
-- d'une page = (piece_id = dossier_document.id, page 1-based) — même clé que l'exclusion.
-- 🔴 PRÉSÉANCE : le geste MANUEL l'emporte sur le calcul auto, dans les DEUX sens. Exclusion et inclusion sont MUTUELLEMENT EXCLUSIVES par
--    construction (chaque geste, côté route, supprime l'entrée de l'autre table) → une page n'est jamais dans les deux, aucune ambiguïté.
-- FK ON DELETE CASCADE → une pièce retirée/remplacée en GED (nouvel id) rend l'inclusion SANS OBJET (jamais bloquer une autre page).
-- Livrée NON APPLIQUÉE ; le code est RÉSILIENT si la table manque (42P01 → aucun ajout manuel, best-of = comportement d'avant / LOTs 87/88).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_best_of_inclusion (
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id)   ON DELETE CASCADE,
  piece_id   bigint      NOT NULL REFERENCES dossier_document(id)  ON DELETE CASCADE,
  page       integer     NOT NULL CHECK (page >= 1),
  inclus_le  timestamptz NOT NULL DEFAULT now(),
  inclus_par text,
  PRIMARY KEY (piece_id, page)
);

CREATE INDEX IF NOT EXISTS permis_best_of_inclusion_dossier_idx ON permis_best_of_inclusion (dossier_id);

COMMENT ON TABLE permis_best_of_inclusion IS 'LOT 92 — pages AJOUTÉES au best-of à la main (réversible), miroir de permis_best_of_exclusion. PK (piece_id, page) = identité stable ; FK ON DELETE CASCADE → inclusion sans objet si la pièce quitte la GED. Mutuellement exclusive de l''exclusion (géré côté route).';

COMMIT;
