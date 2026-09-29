-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 276 — LA CORBEILLE DES BROUILLONS (lot LECTURE-HTML-FIL-TROMBONE, 29/09/2026)
--
-- CE QU'ELLE AJOUTE : une seule colonne, `gestion_brouillon.corbeille_le`. Elle porte l'instant où un brouillon a
-- été MIS À LA CORBEILLE — c'est-à-dire jeté avec la promesse de pouvoir revenir.
--
-- ═══ 🔴🔴 POURQUOI UNE COLONNE DE PLUS, ALORS QUE `abandonne_le` SEMBLAIT SUFFIRE ═══════════════════════════════
--
-- C'est la question qu'il fallait se poser, et la réponse s'est vue à l'écran. `abandonne_le` existe depuis les
-- débuts du module et veut dire « jeté POUR DE BON » : le brouillon disparaît de la liste, sans retour. Rien n'a
-- jamais été supprimé (la ligne reste), mais personne ne pouvait la revoir.
--
-- Réutiliser cette colonne pour la corbeille change ce sens RÉTROACTIVEMENT. Mesuré le 29/09/2026 avant de
-- livrer : **34 brouillons abandonnés**, dont **25 jetés avant ce lot**, du 24 au 29 septembre. Tous seraient
-- réapparus d'un coup dans la Corbeille — des décisions prises des jours plus tôt, remises sous les yeux, et une
-- liste illisible dès sa première ouverture (« (sans objet) — sans destinataire », cinq fois de suite).
--
-- 🔴 UN INVARIANT NE SE RÉÉCRIT PAS DANS LE PASSÉ. Ce que quelqu'un a jeté sous une règle reste jeté sous cette
-- règle. La colonne nouvelle date le geste NOUVEAU ; l'ancienne garde son sens et ses 25 lignes, intactes.
--
-- ⚠️ LES DEUX SONT ÉCRITES ENSEMBLE par le geste nouveau : `abandonne_le` (pour que « Brouillons », son compteur
-- et tout le reste du module se comportent exactement comme avant) ET `corbeille_le` (pour que la Corbeille le
-- montre). Réintégrer efface les deux. Une seule vérité, deux lectures — et aucune des deux ne ment.
--
-- ⚠️ NULLABLE : `NULL` = brouillon vivant, ou brouillon abandonné AVANT ce lot. Aucune ligne n'est réécrite,
-- aucune valeur par défaut n'est posée. Appliquer cette migration ne change STRICTEMENT RIEN à ce qui est en base.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture, aucun changement de contrainte, aucun
-- trigger. Réversible par un simple `ALTER TABLE gestion_brouillon DROP COLUMN corbeille_le`.
--
-- ⚠️ AUCUN INDEX. La table compte quelques dizaines de lignes (34 abandonnés, 8 vivants au 29/09/2026) et la
-- liste les lit toutes : un index y coûterait à chaque enregistrement automatique — c'est-à-dire à chaque frappe
-- retenue — sans jamais servir une seule lecture.
--
-- LE CODE TOURNE SANS ELLE. `corbeilleBrouillonDisponible()` (app/lib/gestion/schema.ts) la sonde HORS
-- TRANSACTION ; tant qu'elle est absente, la colonne n'est NOMMÉE NULLE PART, aucun brouillon n'apparaît dans la
-- Corbeille, et l'éditeur revient exactement à ce qu'il faisait avant ce lot : « Supprimer le brouillon », sans
-- bandeau « Annuler » — parce qu'une promesse de retour qu'on ne peut pas tenir est pire que pas de promesse.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/276_gestion_brouillon_corbeille.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_brouillon ADD COLUMN IF NOT EXISTS corbeille_le timestamptz;

COMMENT ON COLUMN gestion_brouillon.corbeille_le IS
  'Instant où ce brouillon a été mis à la corbeille, avec la promesse de pouvoir le réintégrer. '
  'NULL = brouillon vivant, ou brouillon abandonné AVANT le 29/09/2026 (quand « jeté » voulait dire sans retour). '
  'Écrite EN MÊME TEMPS que abandonne_le par le geste nouveau ; effacée avec elle à la réintégration.';

COMMENT ON COLUMN gestion_brouillon.abandonne_le IS
  'Instant où ce brouillon a quitté la liste « Brouillons ». Sens INCHANGÉ depuis l''origine du module. '
  'Depuis le 29/09/2026 le geste écrit AUSSI corbeille_le, qui seule rend le brouillon réintégrable : les lignes '
  'antérieures gardent leur sens d''alors — jetées sans retour.';

COMMIT;
