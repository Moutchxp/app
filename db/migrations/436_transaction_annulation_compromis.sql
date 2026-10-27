-- 436_transaction_annulation_compromis.sql — TUILE « TRANSACTION », LOT G (Arno, 27/10/2026) : L'ANNULATION D'UN COMPROMIS.
--
-- DÉCISION D'ARNO : un bouton « Annulation » sur chaque compromis ouvre une modale — motif obligatoire (« Défaut de crédit » ou un autre
-- motif écrit), date de l'annulation (aujourd'hui par défaut), note facultative. Le compromis sort des compromis en cours et du
-- prévisionnel, ne compte dans aucun CA, reste consultable dans « Compromis annulés (N) » et se RÉTABLIT d'un clic. Journalisé.
--
-- EN AJOUT SEUL : trois colonnes NEUVES et vides sur `transaction_vente` (le statut « annulee » existe depuis la 433 : rien d'autre ne
-- change). Aucune ligne existante modifiée. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le bouton « Annulation » est visible mais inactif (« disponible après la mise à
-- jour (migration 436) ») et rien ne lit ni n'écrit ces colonnes.

ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS annulation_date  date;
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS annulation_motif text CHECK (annulation_motif IS NULL OR btrim(annulation_motif) <> '');
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS annulation_note  text;
COMMENT ON COLUMN transaction_vente.annulation_motif IS
  'Le motif de l''annulation d''un compromis (« Défaut de crédit » ou le motif écrit), avec annulation_date et annulation_note (migration 436). Rétablir les vide.';
