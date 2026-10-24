-- 414_location_apporteur_nom_prenom.sql — LOCATION, ANNUAIRE DES APPORTEURS (Arno, 24/10/2026) : NOM DE FAMILLE ET PRÉNOM SÉPARÉS.
-- Suite de la 406 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « Liste “Apporteur d'affaires” : affichage “NOM Prénom” (nom de famille d'abord) et tri alphabétique par nom de
-- famille, puis prénom. Les apporteurs qui sont des structures (agence, Internet, société) sont triés par leur nom. Si la fiche
-- apporteur n'a pas de champs nom / prénom séparés, ajoute-les […] avec une reprise qui propose le dernier mot comme nom de famille,
-- corrigeable dans la fiche. »
--
-- CE QU'ELLE FAIT :
--   · AJOUT : `gestion_location_apporteur.nom_famille` et `.prenom` (texte, NULL permis). Le champ `nom` existant ne change pas : il
--     reste l'identifiant de l'apporteur (unicité, reprise du suivi mensuel) ;
--   · REPRISE (ne remplit que les colonnes NEUVES encore vides — rejouable, jamais une correction écrasée) : pour un apporteur qui
--     peut être une personne (partenaire externe, collaborateur), le DERNIER mot du nom devient le nom de famille, le reste le prénom
--     (un seul mot : le nom seul). Une agence ou Internet reste vide : une STRUCTURE, affichée et triée par son nom.
--     La même règle que le code (`separerNomPrenom`) ; une séparation douteuse se corrige dans la fiche (« Fiche et cumul »).
-- Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`nomPrenomDisponible`) : sans elle, la séparation est proposée à l'affichage.

ALTER TABLE gestion_location_apporteur
  ADD COLUMN IF NOT EXISTS nom_famille text,
  ADD COLUMN IF NOT EXISTS prenom text;

UPDATE gestion_location_apporteur
   SET nom_famille = (regexp_match(btrim(regexp_replace(nom, '\s+', ' ', 'g')), '(\S+)$'))[1],
       prenom = nullif(btrim(regexp_replace(btrim(regexp_replace(nom, '\s+', ' ', 'g')), '\s*\S+$', '')), '')
 WHERE nom_famille IS NULL AND prenom IS NULL AND type IN ('partenaire', 'collaborateur') AND btrim(nom) <> '';

COMMENT ON COLUMN gestion_location_apporteur.nom_famille IS
  'Nom de famille (affiché en capitales, « NOM Prénom » ; tri) — 414, Arno 24/10/2026. NULL : non séparé (proposé à l''affichage) ; '''' : une structure.';
COMMENT ON COLUMN gestion_location_apporteur.prenom IS 'Prénom de l''apporteur (414).';
