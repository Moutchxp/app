-- 375_location_proprietaire_en_gestion.sql — TUILE LOCATION (Arno, 17/10/2026) : « PROPRIÉTAIRE(S) EN GESTION ? »
--
-- LE BESOIN (Arno) : à la création d'un propriétaire dans la tuile Location, la question « Propriétaire(s) en gestion ? »
-- (Oui / Non) ; « la réponse est ENREGISTRÉE sur chaque fiche propriétaire créée (en gestion : oui / non), avec le n° de
-- mandat si Oui. Rien ne change pour l'instant côté Gestion. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne FACULTATIVE `en_gestion` sur les propriétaires. Vide = la
-- question n'a pas été posée (toutes les fiches existantes, importées ou créées avant ce lot) ; le N° de mandat garde sa
-- colonne (`numero_mandat_gestion`, migration 372). Lue QUE par la tuile Location : l'affichage de la Gestion ne change pas.
-- AUCUNE ligne existante n'est modifiée ; rien n'est supprimé.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS en_gestion boolean;

COMMENT ON COLUMN gestion_annuaire_proprietaire.en_gestion IS 'Réponse à « Propriétaire(s) en gestion ? » à la création dans la tuile Location ; vide = question non posée (migration 375).';
