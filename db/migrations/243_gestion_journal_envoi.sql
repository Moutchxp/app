-- 243 — CORRECTIF DU 24/09/2026 : le journal doit accepter l'entité « envoi ».
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 CE QUI S'EST PASSÉ. Le 23/09 au soir, Arno a envoyé son premier vrai message depuis l'application. Le message est
-- PARTI (Gmail l'a accepté, `gestion_envoi` id 1 le porte en état `envoye` avec son `gmail_message_id`). Mais l'écran
-- lui a répondu « Envoi impossible : une erreur interne est survenue. »
--
-- La cause : la ligne de journal écrite APRÈS l'envoi portait `entite = 'envoi'`, que la règle ci-dessous n'autorisait
-- pas. PostgreSQL a refusé (23514), l'exception a remonté jusqu'à la route, et un succès a été rendu comme un échec.
--
-- Le code, lui, ne dépend plus de cette migration pour ENVOYER : depuis le correctif, rien de ce qui suit
-- l'acceptation de Gmail ne peut plus faire échouer un envoi, et un envoi rattaché à un échange se journalise sur
-- l'échange. Cette migration rend seulement au journal ce qui lui manque : la trace des messages NEUFS, ceux qui ne
-- se rattachent à aucun échange existant.
--
-- 🔒 Aucune donnée n'est touchée, aucune ligne n'est relue : on remplace une règle par la même, augmentée d'un mot.
-- `gestion_journal` est en ajout seul (déclencheurs `no_update_delete` / `no_truncate`) — ceux-ci ne gênent pas un
-- changement de contrainte, qui ne lit ni n'écrit aucune ligne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;

ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi'   -- 243 : un courrier PARTI de chez nous. Les huit autres décrivent du courrier reçu ou des réglages.
  ]));

COMMIT;
