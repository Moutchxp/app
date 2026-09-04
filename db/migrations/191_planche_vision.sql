-- LOT 62 — REPÉRAGE des planches encastrées par analyse d'IMAGE (bouton manuel). PRÉSENCE seulement : on stocke {planche, categorie}
-- par page, JAMAIS le contenu d'un plan. Deux tables :
--   • permis_planche_vision      : le VERDICT par page (oui/non/incertain). Le best-of lit les 'oui'. PK (piece_id, page).
--   • permis_planche_vision_run  : l'AUDIT par run/pièce (pages envoyées/écartées + motif, tokens, coût, modèle). 1 ligne par pièce.
-- Identité stable = (piece_id = dossier_document.id, page) ; FK ON DELETE CASCADE → sans objet si la pièce quitte la GED (cf. LOT 61).
-- Livrée NON APPLIQUÉE ; code RÉSILIENT si absente (42P01 → comportement d'avant, aucune erreur à l'écran).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_planche_vision (
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id)  ON DELETE CASCADE,
  piece_id   bigint      NOT NULL REFERENCES dossier_document(id) ON DELETE CASCADE,
  page       integer     NOT NULL CHECK (page >= 1),
  verdict    text        NOT NULL CHECK (verdict IN ('oui', 'non', 'incertain')),
  categorie  text        NOT NULL DEFAULT 'aucune',
  modele     text        NOT NULL,   -- méthode 'ia' : jamais 'confirmee' sur la seule foi du modèle (invariant)
  cree_le    timestamptz NOT NULL DEFAULT now(),
  cree_par   text,
  PRIMARY KEY (piece_id, page)
);
CREATE INDEX IF NOT EXISTS permis_planche_vision_dossier_idx ON permis_planche_vision (dossier_id);

CREATE TABLE IF NOT EXISTS permis_planche_vision_run (
  piece_id       bigint      NOT NULL PRIMARY KEY REFERENCES dossier_document(id) ON DELETE CASCADE,
  dossier_id     bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  modele         text        NOT NULL,
  modele_resolu  text,
  pages_envoyees integer[]   NOT NULL DEFAULT '{}',
  pages_ecartees jsonb       NOT NULL DEFAULT '[]',   -- [{page, motif}] — jamais une abstention muette (N10-R)
  tokens_in      integer     NOT NULL DEFAULT 0,
  tokens_out     integer     NOT NULL DEFAULT 0,
  cout_usd       numeric     NOT NULL DEFAULT 0,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  cree_par       text
);
CREATE INDEX IF NOT EXISTS permis_planche_vision_run_dossier_idx ON permis_planche_vision_run (dossier_id);

COMMENT ON TABLE permis_planche_vision IS 'LOT 62 — verdict de PRÉSENCE d''une planche par page (analyse image). Le best-of lit verdict=''oui''. Jamais le contenu du plan.';
COMMENT ON TABLE permis_planche_vision_run IS 'LOT 62 — audit d''un repérage : pages envoyées/écartées (+motif RGPD), tokens, coût, modèle. 1 ligne/pièce, remplacée au re-clic.';

COMMIT;
