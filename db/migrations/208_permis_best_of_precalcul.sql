-- 208 — PRÉ-CALCUL du « best-of » PDF en tâche de fond (recon P-precompute). NON APPLIQUÉE (écrite pour le plan).
--
-- POURQUOI une table : le cache P1 (bestOfCache.ts) vit en MÉMOIRE du processus et meurt au redémarrage → insuffisant pour un
--   pré-calcul fait EN AMONT (par veille:run) et servi à une AUTRE instance (route HTTP). On persiste donc le résultat déterministe.
--
-- PÉRIMÈTRE BORNÉ (règles Arno) : n'est peuplée QUE pour les dossiers en cours d'INSTRUCTION (qui reçoivent des pièces), et PURGÉE à
--   l'entrée en Rattachement (DELETE dans ecrireProjectionValidee). Volume mesuré : best-of ≈ 1,5–15 Ko/dossier (max 78 pièces) ×
--   univers d'instruction (4 dossiers aujourd'hui ; quelques dizaines à centaines en prod) → < quelques Mo. Négligeable.
--
-- CLÉ D'INVALIDATION : `empreinte` = la MÊME empreinte GED que P1 (pièces PDF triées par id, jointes en id:cle_stockage:taille:nom).
--   Un best-of servi n'est valide que si l'empreinte STOCKÉE == l'empreinte COURANTE ; sinon on recalcule (jamais un best-of qui ment).
--   (Option plus robuste, colonne dossier_document.empreinte_sha256 remplie à 100 % : bâtir l'empreinte sur les hachages de CONTENU
--    plutôt que clé+taille+nom — à décider en même temps pour P1 afin de garder UNE seule règle.)
--
-- PK = dossier_id : une entrée par dossier (le best-of de son état de GED courant). Purge = DELETE par dossier_id. ON DELETE CASCADE
--   suit la suppression d'un dossier. `resultat` jsonb = le best-of sérialisé (pièces enrichies + indisponibilités) — exactement ce que
--   sert /emprise. `calcule_par` distingue le pré-calcul de fond ('fond') d'un remplissage à la volée par la route ('a_la_volee').

CREATE TABLE IF NOT EXISTS permis_best_of_precalcul (
  dossier_id  bigint PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  empreinte   text        NOT NULL,
  resultat    jsonb       NOT NULL,
  calcule_le  timestamptz NOT NULL DEFAULT now(),
  calcule_par text        NOT NULL DEFAULT 'fond'
);

COMMENT ON TABLE permis_best_of_precalcul IS
  'P-precompute — best-of PDF pré-calculé (accélérateur, JAMAIS un prérequis). Peuplée pour les dossiers en instruction, purgée à l''entrée en Rattachement. Invalidation par la colonne empreinte (== empreinte GED de P1).';

-- Commande d'application (à lancer quand le lot d'implémentation sera prêt) :
--   psql "postgresql://localhost:5432/sansvisavis" -f db/migrations/208_permis_best_of_precalcul.sql
