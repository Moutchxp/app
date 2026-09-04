-- LOT 67 — DÉCLARATIONS DU CERFA (récapitulatif télé-service). Instantané INFORMATIF de ce que le formulaire déclare, lu de façon
-- DÉTERMINISTE dans la couche texte (régime ① : champs étiquetés ; régime ② : champ libre VERBATIM). Stocké EN DEHORS des colonnes
-- de valeur arbitrées par la précédence des méthodes (nb_places_stationnement, surface_plancher_m2, destinations…) et EN DEHORS des
-- champs Sitadel (date, nb_lgt, superficie, surf_creee) : cet instantané ne les écrase JAMAIS, il les DOUBLE en affichage pour que
-- l'instructeur compare la source déclarative au dérivé. jsonb = forme souple (le formulaire varie d'un millésime à l'autre) ;
-- `piece_source` = la pièce Cerfa identifiée par CONTENU (jamais un nom deviné). Livrée NON APPLIQUÉE ; le code est RÉSILIENT si la
-- table manque (42P01 → aucun bloc « déclarations du Cerfa », comportement d'avant).
BEGIN;

CREATE TABLE IF NOT EXISTS permis_cerfa_recap (
  dossier_id   bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  declarations jsonb       NOT NULL,          -- DeclarationsRecapCerfa (recapCerfa.ts) : scalaires + champ libre + absents/ambigus
  piece_source text,                          -- nom de la pièce Cerfa d'où provient la lecture (identifiée par contenu)
  maj_le       timestamptz NOT NULL DEFAULT now(),
  maj_par      text,
  PRIMARY KEY (dossier_id)
);

COMMENT ON TABLE permis_cerfa_recap IS 'LOT 67 — instantané INFORMATIF des déclarations du Cerfa (récapitulatif). Affiché en lecture seule ; n''écrase jamais Sitadel ni les colonnes arbitrées par la précédence.';

COMMIT;
