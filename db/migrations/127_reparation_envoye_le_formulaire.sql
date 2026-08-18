-- 127_reparation_envoye_le_formulaire.sql — FUS : réparer les envoye_le de dépôts TÉLÉSERVICE postérieurs au premier accusé.
--
-- CONTEXTE : pour un dépôt de canal 'formulaire', marquerDeposee écrivait envoye_le = now() (l'instant du clic « marquer
-- déposée »), pas l'instant du dépôt réel. Quand l'accusé de la mairie est rattaché APRÈS ce clic (cas de la demande 233 /
-- SVAV-DEM-2026-000157 : accusé recu_le = 2026-08-18 10:38:51, envoye_le = 10:39:53 → l'envoi paraît POSTÉRIEUR à son accusé,
-- chronologiquement impossible), le clamp posé désormais à l'écriture (LEAST(coalesce($2,now()), min(accusé))) ne pouvait rien :
-- l'accusé n'existait pas encore au moment du clic. Cette migration REJOUE l'invariant sur les lignes déjà écrites.
--
-- RÈGLE APPLIQUÉE : envoye_le ne peut JAMAIS être postérieur au PREMIER accusé rattaché à la demande. On garde l'instant de
-- validation, SAUF s'il dépasse cet accusé — auquel cas on prend l'accusé (le plus ancien recu_le nature='accuse'). L'accusé
-- PROUVE que le dépôt existait à cet instant ; pour un téléservice qui accuse immédiatement, c'est l'estimation la plus serrée.
--
-- PÉRIMÈTRE STRICT :
--   • canal = 'formulaire' UNIQUEMENT → le canal E-MAIL (qui horodate l'émission SMTP réelle) n'est JAMAIS touché ;
--   • seules les lignes dont envoye_le > premier accusé sont corrigées (les autres sont déjà conformes) ;
--   • demande_journal N'EST PAS touché : il dit la vérité (le clic a bien eu lieu à 10:39:53) — piste d'audit complémentaire.
-- IDEMPOTENTE : après correction, envoye_le = accusé ⇒ « envoye_le > accusé » est faux ⇒ un 2e passage ne touche plus rien.
-- Effet dérivé (échéance CRPA / relance / éligibilité CADA, tous ancrés sur min(envoye_le)) : reculé d'autant — ici ~1 min,
-- négligeable, et conservateur (l'échéance arrive plus tôt, jamais manquée trop tard).
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/127_reparation_envoye_le_formulaire.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; » (les SELECT de contrôle s'affichent quand même, la mise à jour est annulée).
-- TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

\echo '>>> AVANT — lignes formulaire dont envoye_le > premier accusé (à réparer) :'
SELECT d.reference,
       a.envoye_le,
       (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = 'accuse') AS premier_accuse
FROM demande_acheminement a
JOIN demande d ON d.id = a.demande_id
WHERE a.canal = 'formulaire'
  AND a.statut = 'envoye'
  AND a.envoye_le > (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = 'accuse')
ORDER BY d.reference;

UPDATE demande_acheminement a
   SET envoye_le = (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = 'accuse'),
       maj_a = now()
 WHERE a.canal = 'formulaire'
   AND a.statut = 'envoye'
   AND a.envoye_le > (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = 'accuse');

\echo '>>> APRÈS — lignes formulaire restant avec envoye_le > premier accusé (attendu : 0) :'
SELECT count(*) AS restantes
FROM demande_acheminement a
WHERE a.canal = 'formulaire'
  AND a.statut = 'envoye'
  AND a.envoye_le > (SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = a.demande_id AND r.nature = 'accuse');

COMMIT;
