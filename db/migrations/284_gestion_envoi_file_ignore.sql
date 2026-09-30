-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 284 — LOT BANDEAU-ET-BROUILLONS : « IGNORER » UN ÉCHEC D'ENVOI
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QU'ARNO DEMANDE : « un lien “Ignorer” sur le bandeau, qui le masque durablement pour cet échec, SANS RIEN
-- SUPPRIMER ». Le bandeau « N tentatives non envoyées » est utile tant qu'il reste quelque chose à faire ; quand
-- la question est réglée autrement — le mail renvoyé depuis Gmail, par exemple — il n'a plus qu'à se taire.
--
-- 🔴 ON DATE, ON N'EFFACE PAS. C'est la règle du module, la même que pour « abandonner » un brouillon : la ligne
-- de file reste en base avec sa cause et son heure, elle cesse seulement d'appeler à l'écran. Un échec effacé,
-- c'est un incident dont plus rien ne garde la trace.
--
-- ⚠️ QUI a ignoré EST ENREGISTRÉ, comme pour tous les gestes réversibles du module (corbeille, « interne »,
-- « sans suite ») : un bandeau qui disparaît sans qu'on sache qui l'a fait taire est une décision sans auteur.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : trois colonnes NULL ajoutées à une table de dix-neuf lignes. Rien ne change
-- pour l'existant, et sans cette migration le lien « Ignorer » est simplement absent (la sonde
-- `envoiIgnoreDisponible` le dit à l'écran, avec son motif).
--
-- RÉVERSIBLE : ALTER TABLE gestion_envoi_file
--   DROP COLUMN ignore_le, DROP COLUMN ignore_par, DROP COLUMN ignore_par_libelle;

ALTER TABLE gestion_envoi_file
  ADD COLUMN IF NOT EXISTS ignore_le          timestamptz,
  ADD COLUMN IF NOT EXISTS ignore_par         integer,
  ADD COLUMN IF NOT EXISTS ignore_par_libelle text;

-- ⚠️ INDEX PARTIEL, et seulement sur ce qui est ignoré : les lignes ignorées sont rares et la liste des échecs
--    les écarte à chaque lecture. Un index sur toute la colonne coûterait de l'écriture pour rien.
CREATE INDEX IF NOT EXISTS gestion_envoi_file_ignore_idx
  ON gestion_envoi_file (id) WHERE ignore_le IS NOT NULL;

COMMENT ON COLUMN gestion_envoi_file.ignore_le IS
  'LOT BANDEAU-ET-BROUILLONS — quand cet échec a été mis en sourdine. NULL = il appelle encore à l''écran. '
  'On DATE, on n''efface pas : la cause et l''heure de l''échec restent lisibles.';
