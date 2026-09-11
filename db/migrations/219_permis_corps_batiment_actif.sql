-- 219_permis_corps_batiment_actif.sql — BAT-3 : RETRAIT NON DESTRUCTIF d'une carte de bâtiment (permis_corps_batiment).
--
-- POURQUOI : BAT-3 permet à l'internaute de CHANGER le nombre de bâtiments (nb_batiments_valide, BAT-1). Diminuer ce nombre doit
-- RETIRER des cartes SANS jamais les détruire : `supprimerCorps` fait un DELETE PHYSIQUE (irréversible, cascade sur le journal, les
-- polygones, les emprises) — inacceptable pour une carte qui porte une altitude VALIDÉE. On introduit donc un RETRAIT SOFT, sur le
-- patron déjà éprouvé du dépôt (collaborateur : `actif` booléen + `desactive_le`) : une carte retirée sort du compte et de TOUS les
-- lecteurs, mais sa ligne et ses valeurs restent en base, RÉACTIVABLES. Aucune donnée validée n'est jamais perdue.
--
--   `actif`        booléen NOT NULL DEFAULT true — false = carte RETIRÉE (sortie du compte, ignorée des lecteurs).
--   `desactive_le` timestamptz — horodatage du retrait (NULL tant qu'active) ; « quand ».
--   `desactive_par` text       — auteur du retrait (id admin / 'analyse:auto' / …) ; « qui ». Sur le patron _le/_par de BAT-1.
--
-- 🔴 NON DESTRUCTIF : cette migration N'AJOUTE aucun DELETE. `supprimerCorps` (DELETE physique) SUBSISTE mais N'EST PLUS APPELÉ par
--    le changement de nombre (BAT-3) — le retrait passe exclusivement par `actif=false`. La colonne `actif` étant DEFAULT true, les
--    cartes existantes restent TOUTES actives (aucune ne disparaît).
--
-- RÉSILIENCE : le code SONDE la présence de `actif` (information_schema, mémoïsé) AVANT de filtrer. Colonne absente (219 non
--    appliquée) → AUCUN filtre ajouté : or avant 219 aucune carte ne peut être inactive, donc « ne pas filtrer » est STRICTEMENT le
--    comportement d'avant (aucune régression, aucun crash 42703). Après 219, les lecteurs écartent les cartes retirées.
--
-- SÛR : DDL strictement ADDITIVE, IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). N'écrit AUCUNE donnée (aucun UPDATE/DELETE/TRUNCATE/DROP).
--    Ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI config_scoring. Un seul BEGIN/COMMIT.
--    Requiert 103 (permis_corps_batiment). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/219_permis_corps_batiment_actif.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS actif         boolean NOT NULL DEFAULT true; -- false = carte RETIRÉE (soft)
ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS desactive_le  timestamptz;                  -- horodatage du retrait (NULL si active)
ALTER TABLE permis_corps_batiment ADD COLUMN IF NOT EXISTS desactive_par text;                         -- auteur du retrait (id admin / 'analyse:auto')

COMMENT ON COLUMN permis_corps_batiment.actif IS
  'BAT-3 — carte ACTIVE (true) ou RETIRÉE (false, retrait NON destructif). Une carte retirée sort du compte de bâtiments et de TOUS les lecteurs, mais sa ligne et ses valeurs (altitude validée, emprise, repère) restent en base, RÉACTIVABLES. Jamais de DELETE. DEFAULT true : toutes les cartes existantes restent actives.';
COMMENT ON COLUMN permis_corps_batiment.desactive_le IS 'BAT-3 — quand la carte a été retirée (actif=false). NULL tant qu''active. Remis à NULL à la réactivation.';
COMMENT ON COLUMN permis_corps_batiment.desactive_par IS 'BAT-3 — qui a retiré la carte (id admin / ''analyse:auto''). NULL tant qu''active. Remis à NULL à la réactivation.';

-- Index partiel : les lecteurs ne veulent QUE les cartes actives d'un dossier — l'immense majorité (retrait rare).
CREATE INDEX IF NOT EXISTS permis_corps_batiment_actif_idx ON permis_corps_batiment (dossier_id) WHERE actif;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
\echo '>>> Colonnes actif/desactive_* après 219 (attendu : boolean NOT NULL, timestamptz, text) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
  WHERE table_name = 'permis_corps_batiment' AND column_name IN ('actif', 'desactive_le', 'desactive_par') ORDER BY column_name;
\echo '>>> Preuve que TOUTES les cartes existantes restent ACTIVES (attendu : nb_inactives = 0) :'
SELECT count(*) FILTER (WHERE NOT actif) AS nb_inactives, count(*) AS nb_total FROM permis_corps_batiment;
\echo '>>> Index partiel des cartes actives (attendu : permis_corps_batiment_actif_idx) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'permis_corps_batiment' AND indexname = 'permis_corps_batiment_actif_idx';
