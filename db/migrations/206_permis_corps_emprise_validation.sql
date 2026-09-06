-- 206 — VALIDATION DE PROJECTION AU NIVEAU DU BÂTIMENT (la validation n'est plus un geste unique niveau permis). Calque EXACT du
--   patron « validation d'altitude » (altitude_sommet_ngf_confirme_le/_par) : qui a validé, quand, et SUR QUELLE EMPRISE.
--   `emprise_validee_id` référence la ligne permis_emprise_reconstruite validée → une emprise RETRACÉE/RETOUCHÉE/SUPPRIMÉE après coup
--   ne reste JAMAIS validée par accident (le code compare l'emprise validée à l'emprise courante du bâtiment ; FK ON DELETE SET NULL
--   retire la validation si l'emprise validée disparaît). 1:1 avec le bâtiment (aucune jointure) → colonnes, pas de table dédiée.
--
-- RÉSILIENT (patron journalAltitude / to_regclass) : le code (lireEtatEmprisesPermis, action valider_emprise) gère l'ABSENCE de ces
--   colonnes (SQLSTATE 42703) sans poisonner la transaction — l'écran reste utilisable ; la validation PAR BÂTIMENT est simplement
--   indisponible (message clair « mise à jour de la base requise ») tant que cette migration n'est pas appliquée.
--
-- Reprise de l'existant : un dossier qui aurait DÉJÀ une ligne permis_projection (validation legacy niveau permis) reste affiché
--   « validé » sur tous ses bâtiments couverts (le code fait le OR entre `emprise_validee_id` et l'existence de permis_projection) —
--   aucune donnée à migrer, aucune régression pour les dossiers déjà validés.
--
-- ⚠️ Ce fichier N'EST PAS lancé automatiquement — Arno l'applique :
--     psql "$DATABASE_URL" -f db/migrations/206_permis_corps_emprise_validation.sql
ALTER TABLE permis_corps_batiment
  ADD COLUMN IF NOT EXISTS emprise_validee_id  bigint REFERENCES permis_emprise_reconstruite(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emprise_validee_le  timestamptz,
  ADD COLUMN IF NOT EXISTS emprise_validee_par text;

COMMENT ON COLUMN permis_corps_batiment.emprise_validee_id IS
  'Emprise (permis_emprise_reconstruite) VALIDÉE pour ce bâtiment. Validé ⟺ cette emprise existe ENCORE pour le bâtiment ; retrace/retouche/suppression la fait retomber (FK ON DELETE SET NULL + effacement explicite côté code). Décision humaine, jamais un recompute.';
COMMENT ON COLUMN permis_corps_batiment.emprise_validee_le IS 'Horodatage de la validation de l’emprise de ce bâtiment (qui/quand, comme altitude_sommet_ngf_confirme_le).';
COMMENT ON COLUMN permis_corps_batiment.emprise_validee_par IS 'Auteur de la validation de l’emprise de ce bâtiment (e-mail/ID admin).';
