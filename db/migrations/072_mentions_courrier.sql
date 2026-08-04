-- 072_mentions_courrier.sql — Module VEILLE PERMIS (chantier S40) : deux MENTIONS de pratique ajoutées au corps des
-- demandes, ACTIVABLES et ÉDITABLES sans code. ⚠️ AUCUN ENVOI, aucun octet ne part : simple ajout de réglages.
--
-- FRONTIÈRE (verrouillée) : ces mentions sont des PHRASES DE PRATIQUE (rappel du délai d'un mois, mention du service
-- destinataire) — pilotables. Le FONDEMENT JURIDIQUE de la demande (articles L311-1 / L311-9 3° CRPA, formule « En
-- application… », salutations, gabarit de l'objet, ligne structurelle « rappeler la référence ») RESTE EN DUR dans le code
-- (`genererTexte`) : on ne rend jamais modifiable à la volée le socle légal de la demande.
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucune écriture. Défauts : mentions DÉSACTIVÉES et textes VIDES
-- (Arno les active et rédige à l'écran — aucune valeur posée à sa place). GOLDEN-SAFE. Idempotent. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/072_mentions_courrier.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- Mention « service destinataire » (ex. « À l'attention du service de l'urbanisme ») — en TÊTE du corps.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_service_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_service_texte  text    NOT NULL DEFAULT '';
-- Mention « délai d'un mois » (silence = refus tacite) — près de la clôture du corps.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_delai_active   boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_delai_texte    text    NOT NULL DEFAULT '';

COMMENT ON COLUMN config_veille.mention_service_active IS 'S40 — active/désactive la mention « service destinataire » en tête du corps (les deux profils). Défaut false.';
COMMENT ON COLUMN config_veille.mention_service_texte  IS 'S40 — texte ÉDITABLE de la mention « service destinataire » (ex. « À l''attention du service de l''urbanisme »). Phrase de PRATIQUE, pas du fondement juridique. Vide = rien.';
COMMENT ON COLUMN config_veille.mention_delai_active   IS 'S40 — active/désactive la mention « délai d''un mois » (silence = refus tacite) près de la clôture du corps. Défaut false.';
COMMENT ON COLUMN config_veille.mention_delai_texte    IS 'S40 — texte ÉDITABLE de la mention « délai d''un mois ». Phrase de PRATIQUE. Le socle légal (L311-1/L311-9 3°) reste EN DUR dans genererTexte. Vide = rien.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT mention_service_active, mention_service_texte, mention_delai_active, mention_delai_texte FROM config_veille WHERE id = 1;
--   -- attendu au départ : false / '' / false / '' (désactivées, vides — à activer et rédiger dans Réglages).
