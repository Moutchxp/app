-- 125_config_veille_nature_accuse_motifs.sql — FUS-4 : MOTIFS D'OBJET reconnaissant un « accusé de réception ».
--
-- CONTEXTE : la nature 'accuse' n'était posée que sur l'en-tête Auto-Submitted (T3), que Paris N'ENVOIE PAS → son accusé
-- (objet « Accusé de réception (référence SLC…) ») tombait en 'autre', et l'alerte conseillait à tort de répondre à la mairie.
-- FUS-4 ajoute un 3e niveau de classification (dans classerNature) : si le message n'est NI un accusé auto, NI porteur de
-- documents (pièce/lien fort), et que son OBJET contient un motif configuré → 'accuse'. Le motif ne joue donc JAMAIS sur un
-- vrai envoi de documents.
--
-- PILOTAGE SANS CODE : les motifs vivent EN TABLE (éditables dans Réglages), pas en dur — chaque téléservice écrit sa formule.
-- Liste (virgules ou retours à la ligne), normalisée sans accents ni casse AU MOMENT DU MATCH. Le défaut couvre Paris, mais
-- RIEN de spécifique à Paris n'est codé : c'est une valeur de config comme une autre.
--
-- ADDITIVE PURE : une colonne texte, IF NOT EXISTS, NOT NULL DEFAULT. Aucun UPDATE/DROP/trigger, une seule transaction. Ne
-- touche ni le moteur de score ni demande.statut. Repli applicatif : chargerConfigVeille lit '' si la colonne n'existe pas
-- encore (motifs vides → comportement d'AVANT ce lot, aucun message requalifié).
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/125_config_veille_nature_accuse_motifs.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS nature_accuse_motifs text NOT NULL DEFAULT 'accusé de réception';

COMMENT ON COLUMN config_veille.nature_accuse_motifs IS
  'FUS-4 — motifs d''objet (liste virgules/retours) reconnaissant un accusé de réception, normalisés sans accents/casse au match. Ne joue que sans pièce ni lien fort. Éditable dans Réglages. Défaut : couvre Paris, rien de spécifique en dur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonne présente + défaut :'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name = 'nature_accuse_motifs';
\echo '>>> ② valeur du singleton (défaut Paris) :'
SELECT nature_accuse_motifs FROM config_veille WHERE id = 1;
