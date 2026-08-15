-- 110_permis_destinations.sql — Module VEILLE PERMIS (chantier N13) : DESTINATIONS RÉELLES du permis, en TABLEAU.
-- ⚠️ POURQUOI : `nature_projet` (scalaire, migration 106) écrase l'information — un projet bureaux + commerce + restauration
-- devient « mixte », et l'écran n'en montre rien. On ajoute une colonne TABLEAU `destinations`, chaque élément contraint à la
-- LISTE FERMÉE des sous-destinations du Cerfa 13409 (lues champ par champ dans l'AcroForm, N13 — PAS une liste réglementaire de
-- mémoire). Le libellé composé (« Bureau, artisanat et commerce de détail, et restauration ») est GÉNÉRÉ à l'affichage, jamais
-- stocké : la combinatoire ne s'énumère pas dans un CHECK, les sous-destinations atomiques si. `nature_projet` devient VESTIGIALE
-- (conservée, plus alimentée — comme `parking` en N7-E). Aucune suppression de colonne.
--
-- La contrainte `destinations <@ ARRAY[...]` = « tout élément appartient à la liste » : c'est cette liste que le code RELIT du
-- schéma (parserListeArrayCheck), jamais recopiée en dur. `_origine` alignée sur 103/106 : IN ('saisie','extraite').
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune contrainte resserrée, aucune colonne
-- existante touchée. Idempotente. Un seul BEGIN/COMMIT. Requiert 106. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/110_permis_destinations.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_caracteristique
  ADD COLUMN IF NOT EXISTS destinations text[] CONSTRAINT permis_caract_destinations_chk CHECK (
    destinations IS NULL OR destinations <@ ARRAY[
      'Exploitation agricole',
      'Exploitation forestière',
      'Logement',
      'Hébergement',
      'Artisanat et commerce de détail',
      'Restauration',
      'Commerce de gros',
      'Activités de services où s’effectue l’accueil d’une clientèle',
      'Hôtels',
      'Autres hébergements touristiques',
      'Cinéma',
      'Cuisine dédiée à la vente en ligne',
      'Locaux et bureaux accueillant du public des administrations publiques et assimilés',
      'Locaux techniques et industriels des administrations publiques et assimilés',
      'Établissements d’enseignement, de santé et d’action sociale',
      'Salles d’art et de spectacles',
      'Équipements sportifs',
      'Lieux de culte',
      'Autres équipements recevant du public',
      'Industrie',
      'Entrepôt',
      'Bureau',
      'Centre de congrès et d’exposition'
    ]::text[]),
  ADD COLUMN IF NOT EXISTS destinations_origine text CONSTRAINT permis_caract_destinations_origine_chk CHECK (destinations_origine IN ('saisie','extraite'));

COMMENT ON COLUMN permis_caracteristique.destinations IS
  'N13 — sous-destinations du Cerfa 13409 présentes dans le projet (tableau ; chaque élément ∈ la liste fermée portée par le CHECK, lue des champs W2·F1 de l''AcroForm). Remplace nature_projet, désormais VESTIGIALE. Libellé composé généré à l''affichage, jamais stocké. Portée par destinations_origine.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> Colonnes destinations + destinations_origine sur permis_caracteristique :'
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='permis_caracteristique' AND column_name IN ('destinations','destinations_origine') ORDER BY column_name;
\echo '>>> Contrainte de liste fermée (doit citer les sous-destinations) :'
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_caracteristique'::regclass AND conname IN ('permis_caract_destinations_chk','permis_caract_destinations_origine_chk') ORDER BY conname;
