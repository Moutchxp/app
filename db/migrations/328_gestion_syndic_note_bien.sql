-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 328 — LOT SYNDIC-NOTE-PAR-BIEN-ET-GROUPES-COPROS : UNE NOTE DE SYNDIC PROPRE À CHAQUE BIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « une note saisie depuis la fiche syndic ouverte DEPUIS UN BIEN ne concerne QUE ce bien. On ne la lit que
-- sur ce bien, jamais sur un autre bien du même syndic. »
--
-- MIGRATION D'AJOUT UNIQUEMENT : une table nouvelle. La note générale du cabinet (`gestion_syndic.note`) ne bouge pas ;
-- aucune note existante n'est déplacée ni recopiée.
--
-- La note vaut pour le COUPLE (lot, syndic) : si le bien change de syndic, la note du couple précédent reste en base
-- et n'est plus affichée sur le nouveau couple.
--
-- 🔴 HISTORISÉE, JAMAIS EFFACÉE : modifier la note FERME la ligne en cours (`fin`, qui) et en ouvre une nouvelle ;
-- la vider ferme la ligne sans en ouvrir. Un index unique partiel garantit UNE note en cours par couple.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_syndic_note_bien (
  id                bigserial PRIMARY KEY,
  lot_id            bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  syndic_id         bigint NOT NULL REFERENCES gestion_syndic(id),
  texte             text NOT NULL CHECK (btrim(texte) <> ''),
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint,
  cree_par_libelle  text NOT NULL,
  fin               timestamptz,
  fin_par           bigint,
  fin_par_libelle   text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_note_bien_en_cours
  ON gestion_syndic_note_bien (lot_id, syndic_id) WHERE fin IS NULL;
COMMENT ON TABLE gestion_syndic_note_bien IS
  'Lot SYNDIC-NOTE-PAR-BIEN (328) — la note d''un syndic pour UN bien (couple lot, syndic). Historisée : on ferme (fin), on n''efface jamais.';
