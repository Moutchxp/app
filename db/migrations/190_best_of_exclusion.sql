-- LOT 61 — PAGES RETIRÉES DU BEST-OF à la main (réversible). On ne persiste QUE les EXCLUSIONS : le best-of reste calculé à la
-- volée depuis la GED, on lui SOUSTRAIT ces pages. Identité STABLE d'une page = (piece_id = dossier_document.id, page 1-based).
-- FK ON DELETE CASCADE → une pièce retirée/remplacée en GED (nouvel id) rend l'exclusion SANS OBJET (jamais bloquer une autre page).
-- Livrée NON APPLIQUÉE ; le code est RÉSILIENT si la table manque (42P01 → best-of complet, comportement d'avant).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_best_of_exclusion (
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id)   ON DELETE CASCADE,
  piece_id   bigint      NOT NULL REFERENCES dossier_document(id)  ON DELETE CASCADE,
  page       integer     NOT NULL CHECK (page >= 1),
  exclu_le   timestamptz NOT NULL DEFAULT now(),
  exclu_par  text,
  PRIMARY KEY (piece_id, page)
);

CREATE INDEX IF NOT EXISTS permis_best_of_exclusion_dossier_idx ON permis_best_of_exclusion (dossier_id);

COMMENT ON TABLE permis_best_of_exclusion IS 'LOT 61 — pages retirées du best-of (réversible). PK (piece_id, page) = identité stable ; FK ON DELETE CASCADE → exclusion sans objet si la pièce quitte la GED.';

COMMIT;
