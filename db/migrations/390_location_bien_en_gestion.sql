-- 390_location_bien_en_gestion.sql — TUILE LOCATION (Arno, 20/10/2026) : « BIEN EN GESTION ? », PROPRE À CHAQUE BIEN.
--
-- LE BESOIN (Arno) : l'écran « Nouveau bien » ajoute un bien à un propriétaire déjà connu ; « ce bien n'est pas forcément en
-- gestion : chaque bien doit porter son propre statut, en gestion ou hors gestion ». La réponse est portée par le BIEN (le
-- lot), jamais par le propriétaire (dont la colonne `en_gestion`, migration 375, ne change pas).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne `en_gestion` sur les lots, OBLIGATOIRE, « en gestion » (true)
-- par défaut. Tous les biens existants prennent donc « en gestion » : leur statut ne change pas. Elle ne se confond PAS avec
-- `gestion_fin` (la date de sortie de gestion, qui range un bien dans « anciens ») : un bien hors gestion n'a pas de date de
-- fin, il n'a simplement jamais été confié en gestion. Elle n'est lue que pour l'étiquette « Hors gestion » de la carte du
-- bien : aucun comportement (Drive, historique, sorties, tâches) n'en dépend.
-- AUCUNE ligne n'est supprimée ; aucune valeur existante n'est réécrite (la valeur par défaut est posée par PostgreSQL à
-- l'ajout de la colonne, sans réécriture de la table).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS en_gestion boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN gestion_annuaire_lot.en_gestion IS 'Réponse à « Bien en gestion ? » (écran Nouveau bien de la tuile Location) ; true par défaut, donc pour tous les biens antérieurs (migration 390).';
