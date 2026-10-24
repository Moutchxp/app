-- 422_location_apporteur_interne_depuis.sql — LOCATION, ANNUAIRE DES APPORTEURS (Arno, 24/10/2026) : LA DATE DU PASSAGE EN INTERNE.
-- Suite de la 419 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « “Passer en interne” : le rattachement à <collègue> et la rémunération de ce collègue prennent fin à compter
-- d'aujourd'hui ; les dossiers déjà signés gardent leur calcul. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `gestion_location_apporteur.interne_depuis` : le jour où un apporteur EXTERNE est passé INTERNE (bouton de la fiche, ou script
--     `location:apporteurs-internes`). Un dossier signé AVANT ce jour garde son collègue de rattachement et la rémunération de ce
--     collègue ; à partir de ce jour, l'apporteur est interne (rattaché à personne). NULL : interne depuis toujours (créé interne), ou
--     externe. Les rattachements et rémunérations d'avant restent en base : l'historique est conservé.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`passageInterneDisponible`) : sans elle, « Passer en interne » est refusé (le calcul des
-- dossiers passés ne pourrait pas être gardé).

ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS interne_depuis date;

COMMENT ON COLUMN gestion_location_apporteur.interne_depuis IS
  'Jour du passage d''externe à INTERNE (422) : les dossiers signés avant gardent collègue et rémunération du collègue. NULL : interne dès sa création, ou externe.';
