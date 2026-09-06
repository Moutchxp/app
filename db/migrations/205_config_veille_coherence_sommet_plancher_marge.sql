-- 205 — CONTRÔLE DE COHÉRENCE SOMMET/PLANCHER (DEMANDE 2) : marge d'ÉGALITÉ (m) sous laquelle le sommet est considéré « au niveau »
--   du dernier plancher (avertissement) plutôt que « au-dessus ». Variable de CONFIG éditable au runtime (jamais une constante en dur),
--   même mécanique que projection_mitoyen_seuil_aire_m2 (migration 203). RÉSILIENT : la lecture (lireMargeCoherenceSommetPlancherM)
--   retombe sur le défaut si la colonne est absente → cette migration peut être appliquée quand on veut, sans casser le rendu.
-- Le DEFAULT ici EST le défaut centralisé du code (MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT = 0.10) : aucune 2e vérité.
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS coherence_sommet_plancher_marge_m numeric NOT NULL DEFAULT 0.10;

COMMENT ON COLUMN config_veille.coherence_sommet_plancher_marge_m IS
  'Marge (m) d’égalité sommet/dernier plancher : |sommet−plancher| ≤ marge → avertissement « au niveau » ; sommet < plancher−marge → incohérence. Contrôle NON bloquant. Défaut 0,10 m.';
