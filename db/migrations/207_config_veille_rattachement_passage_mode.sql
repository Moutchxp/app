-- 207 — MODE DE PASSAGE en Rattachement (réglage à deux valeurs, règle Arno du 07/09/2026).
--   'automatique'      : un permis entre en Rattachement dès que toutes ses altitudes ET emprises sont validées (auto-finalisation).
--   'cloture_manuelle' : il reste dans « Analyse et projection » tant qu'Arno n'a pas cliqué « Valider le permis — envoyer en Rattachement ».
-- DÉFAUT 'automatique' = comportement actuel (livré au commit cdfdc0a) : ne rien changer sans geste explicite.
-- Le réglage ne change PAS le critère (estValidationAcquise reste LE calcul) : il change ce qui DÉCLENCHE le passage.
-- La lecture applicative est RÉSILIENTE à l'absence de cette colonne (défaut 'automatique') : migration NON bloquante, applicable à froid.
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS rattachement_passage_mode text NOT NULL DEFAULT 'automatique'
    CHECK (rattachement_passage_mode IN ('automatique', 'cloture_manuelle'));
