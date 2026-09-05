-- LOT 95 (B2) — ANALYSE AU GRAIN PAGE : lecture de VALEURS (altitude de sommet NGF) sur LA page affichée, par analyse d'image (bouton
-- « analyse de la page », geste manuel payant). Les VALEURS lues vivent là où vivent déjà les extractions : les colonnes de
-- `permis_caracteristique`/`permis_corps_batiment` (invariant 103) + le JOURNAL `permis_extraction_journal` (méthode 'ia', provenance
-- pièce+page, confiance). CETTE table n'ajoute qu'une chose : l'ÉTAT DATÉ « cette page a été analysée » AU GRAIN PAGE — pour qu'une
-- page « jamais analysée par image » devienne un état honnête après passage, MÊME quand la vision n'a rien lu (aucune ligne de journal
-- n'est alors écrite). 1 ligne par (piece_id, page), REMPLACÉE au re-clic (rejouable, jamais doublée).
-- Identité stable = (piece_id = dossier_document.id, page). FK ON DELETE CASCADE → sans objet si la pièce quitte la GED.
-- Livrée NON APPLIQUÉE ; code RÉSILIENT si absente (42P01/42703 → comportement d'avant : la lecture écrit toujours les valeurs via les
-- tables existantes, seul l'audit daté au grain page est ignoré, sans erreur à l'écran).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_page_lecture (
  piece_id      bigint      NOT NULL REFERENCES dossier_document(id) ON DELETE CASCADE,
  page          integer     NOT NULL CHECK (page >= 1),
  dossier_id    bigint      NOT NULL REFERENCES sitadel_dossier(id)  ON DELETE CASCADE,
  envoyee       boolean     NOT NULL DEFAULT true,   -- false = page NON envoyée (écartée par le pré-filtre RGPD, motif ci-dessous)
  motif_ecart   text,                                 -- motif d'abstention RGPD si envoyee=false (jamais une abstention muette)
  nb_valeurs    integer     NOT NULL DEFAULT 0,        -- nb de champs VIDES remplis par cette lecture (0 = rien d'exploitable)
  resume        text,                                  -- phrase lisible (« altitude de sommet NGF : 61,09 » / « aucune valeur exploitable »)
  modele        text,
  modele_resolu text,
  tokens_in     integer     NOT NULL DEFAULT 0,
  tokens_out    integer     NOT NULL DEFAULT 0,
  cout_usd      numeric     NOT NULL DEFAULT 0,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  cree_par      text,
  PRIMARY KEY (piece_id, page)
);
CREATE INDEX IF NOT EXISTS permis_page_lecture_dossier_idx ON permis_page_lecture (dossier_id);

COMMENT ON TABLE permis_page_lecture IS 'LOT 95 — état DATÉ « page analysée par image pour lire des valeurs » AU GRAIN PAGE. Les valeurs lues vont aux colonnes + au journal (méthode ia) ; cette table ne porte que l''audit daté par page (rejouable, remplacée au re-clic).';

COMMIT;
