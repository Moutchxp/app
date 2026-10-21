-- 401_location_id_fiscal.sql — LOCATION (Arno, 21/10/2026) : « ID FISCAL DU BIEN ».
--
-- LA RÈGLE (Arno) : l'identifiant fiscal du local, tel qu'il figure sur l'avis de taxe foncière, saisi pour le BIEN principal
-- (logement, local, parking nu) — jamais pour une annexe. FACULTATIF ; espaces retirés à l'enregistrement ; un avertissement
-- (non bloquant) à l'écran s'il ne compte pas 12 chiffres. Modifiable depuis la fiche du bien, affiché dans son encart.
-- Il n'entre PAS dans le mail « Nouvelle location ».
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne FACULTATIVE `id_fiscal` (texte) sur `gestion_annuaire_lot`.
-- AUCUNE ligne existante n'est modifiée ; rien n'est supprimé.
--
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS id_fiscal text;

COMMENT ON COLUMN gestion_annuaire_lot.id_fiscal IS 'Identifiant fiscal du local (avis de taxe foncière), sans espaces ; vide = non renseigné ; jamais saisi pour une annexe (migration 401).';
