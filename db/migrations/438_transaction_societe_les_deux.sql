-- 438_transaction_societe_les_deux.sql — TUILE « TRANSACTION », LOT K (Arno, 28/10/2026) : UN COLLABORATEUR DES DEUX SOCIÉTÉS.
--
-- DÉCISION D'ARNO : la société d'un compte (page Comptes) accepte une troisième valeur, « CRITERIMMO et MACJ » (`les_deux`), pour un
-- collaborateur qui négocie pour l'une ou l'autre. Règle générique : aucun nom. Pour un tel compte, la société d'une vente se CHOISIT à la
-- saisie (« Pour cette vente, il travaille pour : CRITERIMMO / MACJ ») et s'enregistre SUR LA VENTE : c'est la colonne `societe` de sa
-- partie (`transaction_partie`, 434), qui n'accepte que CRITERIMMO ou MACJ — elle ne change pas.
--
-- SEUL CHANGEMENT : la contrainte de `transaction_societe_compte.societe` (434) accepte aussi 'les_deux'. Aucune ligne existante n'est
-- lue, modifiée ni convertie ; l'historique importé ne bouge pas. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE
-- transaction (la contrainte est retirée puis reposée dans la même transaction).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, « CRITERIMMO et MACJ » est montré grisé dans Comptes (« disponible après la
-- mise à jour (migration 438) ») et refusé par le serveur ; tout le reste marche comme avant.

ALTER TABLE transaction_societe_compte DROP CONSTRAINT IF EXISTS transaction_societe_compte_societe_check;
ALTER TABLE transaction_societe_compte ADD CONSTRAINT transaction_societe_compte_societe_check CHECK (societe IN ('criterimmo', 'macj', 'les_deux'));
COMMENT ON COLUMN transaction_societe_compte.societe IS
  'CRITERIMMO, MACJ, ou « les_deux » (CRITERIMMO et MACJ, migration 438) : la société d''une vente se choisit alors à la saisie et s''enregistre sur sa partie.';
