-- 420_location_apporteur_depuis_toujours_versions.sql — LOCATION, ANNUAIRE DES APPORTEURS (Arno, 24/10/2026) : UNE RÈGLE « DEPUIS
-- TOUJOURS ». Suite de la 419 (qu'elle suppose appliquée, avec la 413).
--
-- DÉCISION D'ARNO : « À côté de “Applicable à partir du”, une case “Depuis toujours” : le nouveau taux s'applique à TOUS les dossiers de
-- l'apporteur, y compris passés. Elle remplace les versions antérieures dans le calcul SANS les effacer : l'historique garde la trace,
-- compte et session journalisés. Même option pour la rémunération du collègue. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `toujours` sur `gestion_location_apporteur_bareme` et `gestion_location_apporteur_remuneration` (faux pour tout l'existant : aucun
--     montant ne change). Une version « depuis toujours » garde comme `depuis` le jour où elle a été enregistrée : dans le calcul, elle
--     remplace TOUTES les versions enregistrées avant elle (lues dans l'ordre d'enregistrement, `id`) et vaut pour tous les dossiers ;
--     pour l'apporteur, les taux et montants saisis sur les dossiers signés AVANT ce jour sont remplacés eux aussi (un dossier signé
--     ensuite garde ce qui y a été saisi). Les versions remplacées restent en base et dans l'historique.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`toujoursDisponible`) : sans elle, la case « Depuis toujours » est refusée avec ce motif.

ALTER TABLE gestion_location_apporteur_bareme ADD COLUMN IF NOT EXISTS toujours boolean NOT NULL DEFAULT false;
ALTER TABLE gestion_location_apporteur_remuneration ADD COLUMN IF NOT EXISTS toujours boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gestion_location_apporteur_bareme.toujours IS
  'Version « depuis toujours » (420) : remplace dans le calcul toutes les versions enregistrées avant elle (id) et vaut pour tous les dossiers ; `depuis` = jour d''enregistrement.';
COMMENT ON COLUMN gestion_location_apporteur_remuneration.toujours IS
  'Version « depuis toujours » de la rémunération du collègue (420) : remplace les versions enregistrées avant elle, pour tous les dossiers.';
