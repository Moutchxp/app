-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 342 — LOT TRACE-ONE-SHOT : LA PORTÉE DES GESTES « INTERNE » / « HORS GESTION », ET LA PHOTO DU SUIVI DE FOND
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISION D'ARNO (11/10/2026), en réponse aux trois points du lot PASTILLE-SUIVI-MODIFIE-ONE-SHOT :
--   ② « À partir de maintenant, les boutons “Interne” et “Hors gestion” enregistrent la portée choisie (“ce mail
--      uniquement” ou “toute la conversation”). Migration d'AJOUT, aucune donnée existante réécrite. »
--   ③ « À partir de maintenant, chaque geste “ce mail uniquement” enregistre aussi une photo du suivi de fond JUSTE
--      AVANT le geste (statut, biens, parties), en ajout seul. »
--
-- CE QUE POSE CETTE MIGRATION (AJOUT, AUCUNE PERTE, AUCUNE LIGNE RÉÉCRITE) :
--   ① `gestion_message_interne.portee` et `gestion_hors_gestion.portee` : NULL pour toutes les lignes existantes
--      (« portée inconnue » — on ne la devine pas après coup) ;
--   ② `fond_avant` (jsonb) sur ces deux tables et sur `gestion_message_exception`, et `sorti_fond_avant` sur
--      `gestion_rattachement` : la photo du suivi de fond juste avant un geste « ce mail uniquement ». NULL partout
--      pour l'existant : la modale dit alors « (suivi de fond recalculé aujourd'hui) ».
--
-- Forme de la photo : { "fenetre": <classement de la fenêtre qui couvrait le mail, ou null>, "interneEchange": bool,
-- "le": <horodatage ISO> } — un classement est { sorte, biens: [{cle, libelle}], personnes?: [{sorte, cle, libelle}] }.
--
-- ⚠️ `sorti_fond_avant` N'EST PAS DANS LE VERROU DE LA 340 (`gestion_rattachement_verrou`) : c'est une donnée
-- d'explication, écrite par la même fonction dédiée que `sorti_le`, et remise à NULL par la restauration.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_message_interne ADD COLUMN IF NOT EXISTS portee text;
ALTER TABLE gestion_message_interne ADD COLUMN IF NOT EXISTS fond_avant jsonb;
ALTER TABLE gestion_message_interne DROP CONSTRAINT IF EXISTS gestion_message_interne_portee_chk;
ALTER TABLE gestion_message_interne ADD CONSTRAINT gestion_message_interne_portee_chk
  CHECK (portee IS NULL OR portee IN ('mail', 'suite', 'conversation'));
COMMENT ON COLUMN gestion_message_interne.portee IS
  'Portée choisie au geste (342) : mail = ce mail uniquement, suite = ce mail et la conversation à venir, conversation = toute la conversation. NULL = inconnue (antérieur à 342, ou posé par la projection d''une fenêtre).';

ALTER TABLE gestion_hors_gestion ADD COLUMN IF NOT EXISTS portee text;
ALTER TABLE gestion_hors_gestion ADD COLUMN IF NOT EXISTS fond_avant jsonb;
ALTER TABLE gestion_hors_gestion DROP CONSTRAINT IF EXISTS gestion_hors_gestion_portee_chk;
ALTER TABLE gestion_hors_gestion ADD CONSTRAINT gestion_hors_gestion_portee_chk
  CHECK (portee IS NULL OR portee IN ('mail', 'conversation'));
COMMENT ON COLUMN gestion_hors_gestion.portee IS
  'Portée choisie au geste (342) : mail = ce mail uniquement, conversation = toute la conversation. NULL = inconnue.';

ALTER TABLE gestion_message_exception ADD COLUMN IF NOT EXISTS fond_avant jsonb;
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS sorti_fond_avant jsonb;

COMMENT ON COLUMN gestion_message_exception.fond_avant IS
  'Photo du suivi de fond juste avant le geste « ce mail uniquement » (342). NULL = antérieur : recalculé à la lecture.';
COMMENT ON COLUMN gestion_rattachement.sorti_fond_avant IS
  'Photo du suivi de fond juste avant la sortie du suivi faite à la main (342). NULL = antérieur ou sortie automatique.';

COMMIT;
