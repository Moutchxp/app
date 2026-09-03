-- LOT 47 — ACQUITTEMENT « nouvelles pièces vues » (par DOSSIER / permis).
--
-- OBJET : le signal « de nouvelles pièces sont arrivées » (badge « nouvelles pièces reçues ») est un ÉVÉNEMENT, distinct de l'état
-- « dossier incomplet (N) » du LOT 46. Il s'accroche au fait RÉEL : une ligne `dossier_document.depose_le` postérieure au dernier
-- acquittement. Un recalcul de diagnostic qui n'ajoute aucune pièce (diagnosticsVague) ne l'allume donc jamais.
--
-- CETTE TABLE ne stocke QUE l'acquittement EXPLICITE au niveau permis (bouton « vu » ; LOT 48 ajoutera 'complet' — même table, motif
-- extensible). L'acquittement par RELANCE n'est PAS stocké ici : il est DÉRIVÉ à la lecture de la trace universelle des relances
-- (`demande_journal` + `demande_acheminement`) — aucun code d'envoi n'a à écrire ici, et la dérivation vaut RÉTROACTIVEMENT.
--
-- Le signal de nouveauté (lu par app/lib/veille/reponsesSuivi.ts) est donc :
--   EXISTS dossier_document.depose_le > GREATEST(acquittement.vu_le, dernière relance de la demande).
-- Pas de délai/seuil/durée introduit → AUCUN réglage config_veille (invariant « pilotage sans code » sans objet ici).
--
-- Appliquer À LA MAIN (non appliquée à la livraison) :
--   psql -v ON_ERROR_STOP=1 -f /Users/macbookprom4arnaud/sansvisavis/app/db/migrations/188_dossier_pieces_acquittement.sql "$DATABASE_URL"

CREATE TABLE IF NOT EXISTS dossier_pieces_acquittement (
  dossier_id bigint      PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  vu_le      timestamptz NOT NULL DEFAULT now(),   -- instant d'acquittement : les pièces déposées AVANT sont « vues »
  vu_par     text,                                 -- e-mail de l'administrateur ayant acquitté (traçabilité)
  motif      text        NOT NULL DEFAULT 'vu'      -- 'vu' (bouton LOT 47) | 'complet' (bouton LOT 48) — liste ouverte, jamais un statut de demande
);

COMMENT ON TABLE dossier_pieces_acquittement IS
  'LOT 47 — acquittement EXPLICITE « nouvelles pièces vues » par DOSSIER (permis). vu_le = borne : une pièce (dossier_document) déposée APRÈS est « nouvelle ». UPSERT (une ligne par dossier, vu_le réécrit à chaque geste). L''acquittement par RELANCE n''est PAS ici : il est dérivé de demande_journal/demande_acheminement (rétroactif). N''écrit JAMAIS demande.statut.';
