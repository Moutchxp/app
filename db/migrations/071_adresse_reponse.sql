-- 071_adresse_reponse.sql — Module VEILLE PERMIS (chantier S38) : ADRESSE DE RÉPONSE des demandes CRPA, éditable sans code.
-- ⚠️ AUCUN CODE D'ENVOI ici, aucun octet ne part : cette migration ne fait qu'ajouter le réglage.
--
-- POURQUOI : une demande de communication partie de `noreply@…` est une demande à laquelle la mairie NE PEUT PAS RÉPONDRE —
-- or c'est SA RÉPONSE qui contient la hauteur du bâti neuf. Il faut donc une VRAIE boîte relue en `reply-to`. On en fait un
-- réglage (pilotage sans code) plutôt qu'un préalable codé en dur. SANS VALEUR PAR DÉFAUT : tant qu'elle est vide, le chemin
-- d'envoi REFUSE de s'exécuter (garde-fou côté code, chantier S38).
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT idempotent). Aucun DROP. GOLDEN-SAFE. Idempotent. AUCUN ENVOI.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/071_adresse_reponse.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- NOT NULL DEFAULT '' : '' = « pas encore configurée » (le send refuse). Le CHECK autorise soit '' soit une adresse e-mail
-- de forme valide (miroir du garde applicatif `FORME_EMAIL` de reglagesVeille.ts). Pas de domaine imposé.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS adresse_reponse text NOT NULL DEFAULT '';

DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_adresse_reponse_check
    CHECK (adresse_reponse = '' OR adresse_reponse ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN config_veille.adresse_reponse IS
  'S38 — boîte e-mail RELUE mise en reply-to des demandes aux mairies (c''est là qu''arrive la réponse contenant la hauteur du bâti neuf). Éditable dans l''écran Réglages. '''' = non configurée → le chemin d''envoi REFUSE de s''exécuter (une demande partie de noreply@ serait sans réponse possible). CHECK : '''' ou adresse valide.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT adresse_reponse FROM config_veille WHERE id = 1;   -- '' au départ (non configurée)
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'config_veille_adresse_reponse_check';
--   -- contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET adresse_reponse = 'pas-une-adresse' WHERE id = 1; ROLLBACK;
