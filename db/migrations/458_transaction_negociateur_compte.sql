-- 458_transaction_negociateur_compte.sql — TRANSACTION / MON ESPACE (Arno, 05/11/2026) : LE COMPTE DU NÉGOCIATEUR SUR LES LIGNES.
--
-- LE CONSTAT (Arno) : « Mon espace » de Pierre Thevenin était vide alors qu'il a des ventes. CAUSE : les lignes de commission
-- (`transaction_vente_ligne.negociateur`) et les rétrocessions (`transaction_retrocession.negociateur`) ne désignent le collaborateur
-- que par un TEXTE (« PIERRE », « Pierre Thevenin »), rapproché d'un compte à chaque lecture ; un second compte au même prénom ou au
-- même nom rend ce rapprochement ambigu, et l'espace se vide. Les parties (`transaction_partie.compte_id`) et le dossier
-- (`negociateur_entree_id` / `negociateur_sortie_id`) portent déjà le compte.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une colonne `compte_id` (facultative) sur les deux tables. Elle n'écrase rien : le texte d'origine
-- (`negociateur`) reste tel quel. AUCUNE ligne n'est remplie ici : le rattachement des lignes existantes se fait par
-- `app/scripts/relier-comptes-transaction.ts` (essai à blanc par défaut ; `--reel` ne remplit que les cases vides, et seulement quand
-- le compte est SÛR — rattachement posé par Arno, ou libellé égal au « prénom nom », « nom prénom » ou à l'adresse d'UN SEUL compte).
-- Les nouvelles saisies remplissent la colonne au même moment que le texte.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose admin_utilisateur et les tables 433.

ALTER TABLE transaction_vente_ligne ADD COLUMN IF NOT EXISTS compte_id bigint REFERENCES admin_utilisateur(id);
ALTER TABLE transaction_retrocession ADD COLUMN IF NOT EXISTS compte_id bigint REFERENCES admin_utilisateur(id);

CREATE INDEX IF NOT EXISTS transaction_vente_ligne_compte_idx ON transaction_vente_ligne (compte_id) WHERE compte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_retrocession_compte_idx ON transaction_retrocession (compte_id) WHERE compte_id IS NOT NULL;

COMMENT ON COLUMN transaction_vente_ligne.compte_id IS
  'Le compte du négociateur de la ligne (migration 458) ; NULL = rapproché par le texte `negociateur`, comme avant. Jamais écrasé.';
COMMENT ON COLUMN transaction_retrocession.compte_id IS
  'Le compte du négociateur de la rétrocession (migration 458) ; NULL = rapproché par le texte `negociateur`, comme avant. Jamais écrasé.';
