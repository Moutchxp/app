-- 222_teleservice_verrou_reference.sql — Interrupteur du VERROU « référence mairie » sur le vivier Téléservice.
--
-- POURQUOI : une commune téléservice dont une demande a été déposée reste « en attente d'accusé » tant que la mairie n'a pas
-- renvoyé sa référence (le verrou de commune `demande_depot_presume` VIVANT, resolu_le IS NULL, levé par le trigger 163 à la
-- capture d'une référence — ou par 'sans_accuse'/'renoncee'). Ce lot fait LIRE cet état par le vivier : tant que le verrou tient,
-- la commune sort du compteur/de la recherche/du mode manuel ET de « Préparer les demandes ». C'est une LECTURE de l'état
-- existant (`communesBloqueesTeleservice`) — aucun code de levée n'est ajouté, la levée reste le trigger 163.
--
-- ⚠️ DÉFAUT TRUE — À L'INVERSE des autres bascules téléservice (teleservice_instruction_auto_active,
-- teleservice_alerte_non_depose_active) qui sont DÉFAUT FALSE (opt-in) : ici le filtre est ACTIVÉ par défaut (décision porteur).
-- Le code est RÉSILIENT si la colonne MANQUE (lecteur isolé try/catch → repli TRUE, filtre ON) : même comportement par défaut avant
-- comme après application. La décocher REND simplement les communes bloquées de nouveau proposables (comportement d'avant ce lot).
--
-- SÛR : DDL additive, idempotente (ADD COLUMN IF NOT EXISTS). N'écrit AUCUNE donnée (chaque ligne existante prend le DEFAULT TRUE).
-- N'ALTÈRE aucune autre colonne, aucun index, aucun trigger. GOLDEN-SAFE (aucun contact moteur/config_scoring/bâtiment →
-- golden 29.107259068449615 intact). Un seul BEGIN/COMMIT. Requiert 124 (demande_depot_presume) et 163 (trigger reference_captee),
-- toutes deux déjà appliquées.
-- Application MANUELLE (Arno), sur son go :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/222_teleservice_verrou_reference.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_verrou_reference_actif boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN config_veille.teleservice_verrou_reference_actif IS
  'Verrou « référence mairie » du vivier Téléservice : quand TRUE (défaut, à l''inverse des autres bascules téléservice), une commune dont une demande téléservice est en attente d''accusé (verrou demande_depot_presume vivant) est retirée du compteur/recherche/mode manuel ET de « Préparer les demandes », jusqu''à la capture de sa référence (trigger 163) ou une autre résolution (sans_accuse/renoncee). LECTURE seule de l''état existant ; ne touche jamais demande.statut. Décocher = comportement d''avant (communes bloquées de nouveau proposables).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (s'exécute au lancement — PROUVE, ne suppose pas) :
\echo '>>> Colonne teleservice_verrou_reference_actif après 222 (attendu : boolean NOT NULL DEFAULT true) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
  WHERE table_name = 'config_veille' AND column_name = 'teleservice_verrou_reference_actif';
\echo '>>> Valeur du singleton id=1 (attendu : t) :'
SELECT teleservice_verrou_reference_actif FROM config_veille WHERE id = 1;
