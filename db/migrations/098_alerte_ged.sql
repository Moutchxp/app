-- 098_alerte_ged.sql — Module VEILLE PERMIS (chantier G1) : compte à rebours « contenu reçu mais pas encore classé en GED ».
-- ⚠️ POURQUOI : un mail de mairie porteur de pièces jointes et/ou d'un LIEN de téléchargement peut voir son contenu PERDU si
-- personne ne le téléverse dans la GED du permis avant l'expiration du lien (cas réel : lien Paris valable 7 jours). On grave
-- ici le JOURNAL D'IDEMPOTENCE des deux alertes e-mail (J-3 puis 24 h) : une ligne par (réponse × permis × type) — aucune
-- alerte ne doit repartir à chaque relève.
--
-- RÈGLE MÉTIER (fondateur, G1) : grain = (réponse × permis) — un permis classé éteint SON rappel, jamais celui des autres
-- permis du même message. « Classé » = une ligne `dossier_document` (089) sur CE permis, STRICTEMENT (jamais `satisfait_le` :
-- le fichier dans la GED, pas une déclaration). Délai = l'expiration captée par L1 si elle existe, sinon 7 j à compter de la
-- réception (défaut, jamais un plafond). Envoi à TOUTE heure (jamais bridé par alerte_heure_locale). `dossier_id` NULL = réponse
-- NON rattachée porteuse d'un lien (permis inconnu → sujet dédié « contenu non rattaché qui va expirer »). `en_retard` = l'alerte
-- est partie APRÈS son seuil (machine éteinte entre deux passes) → le retard doit rester VISIBLE, jamais un silence.
--
-- SÛR : DDL ADDITIVE uniquement (CREATE TABLE / INDEX IF NOT EXISTS ; FK CASCADE). Aucun DROP, aucun UPDATE, aucun trigger.
-- N'écrit JAMAIS demande.statut, ne pose aucun satisfait_le, ne bascule rien vers Archives, ne suit JAMAIS un lien. GOLDEN-SAFE.
-- Idempotente. Un seul BEGIN/COMMIT. Requiert 073 (demande_reponse), 047 (sitadel_dossier), 089 (dossier_document).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/098_alerte_ged.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

CREATE TABLE IF NOT EXISTS alerte_ged (
  id          bigserial   PRIMARY KEY,
  reponse_id  bigint      NOT NULL REFERENCES demande_reponse(id) ON DELETE CASCADE,
  dossier_id  bigint      REFERENCES sitadel_dossier(id) ON DELETE CASCADE, -- NULL = réponse non rattachée (permis inconnu)
  type        text        NOT NULL
                CONSTRAINT alerte_ged_type_chk CHECK (type IN ('j3','h24')),
  seuil_le    timestamptz NOT NULL,                 -- l'instant où l'alerte était DUE (expiration − 3 j / − 24 h)
  envoye_le   timestamptz NOT NULL DEFAULT now(),   -- l'instant où elle est réellement PARTIE
  en_retard   boolean     NOT NULL DEFAULT false,   -- partie après son seuil (interruption) → doit rester visible à l'écran
  sujet       text                                  -- objet réellement envoyé (audit + affichage)
);

COMMENT ON TABLE alerte_ged IS
  'Journal d''idempotence des alertes « contenu à classer / télécharger en GED » (chantier G1). UNE ligne par (réponse × permis × type ∈ j3|h24) : une alerte ne repart JAMAIS deux fois. dossier_id NULL = réponse non rattachée (lien qui va expirer, permis inconnu). en_retard = partie après son seuil (machine éteinte) — le retard reste VISIBLE. Ne suit jamais un lien, ne pose ni satisfait_le ni demande.statut.';
COMMENT ON COLUMN alerte_ged.dossier_id IS 'Permis (sitadel_dossier) concerné, ou NULL pour une réponse non rattachée (permis inconnu). Le grain (réponse × permis) fait qu''un permis classé éteint SON rappel sans toucher les autres.';
COMMENT ON COLUMN alerte_ged.en_retard IS 'true si envoyée APRÈS son seuil (rattrapage d''une passe manquée). Rend le retard visible — jamais un silence supposé normal.';

-- IDEMPOTENCE : au plus UNE alerte par (réponse, permis, type). `coalesce(dossier_id, 0)` neutralise la sémantique « NULL
--   distinct » de Postgres → une réponse non rattachée n'a qu'UNE alerte j3 et qu'UNE alerte h24 (0 n'est jamais un dossier réel).
CREATE UNIQUE INDEX IF NOT EXISTS alerte_ged_unique ON alerte_ged (reponse_id, coalesce(dossier_id, 0), type);
CREATE INDEX IF NOT EXISTS alerte_ged_reponse_idx ON alerte_ged (reponse_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d alerte_ged
--   SELECT indexname FROM pg_indexes WHERE tablename = 'alerte_ged';  -- alerte_ged_unique + alerte_ged_reponse_idx
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'alerte_ged'::regclass;
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO alerte_ged (reponse_id, type, seuil_le) VALUES (1,'x', now()); ROLLBACK;   -- viole alerte_ged_type_chk
--   -- BEGIN; INSERT INTO alerte_ged (reponse_id, dossier_id, type, seuil_le) VALUES (1, NULL, 'j3', now());
--   --        INSERT INTO alerte_ged (reponse_id, dossier_id, type, seuil_le) VALUES (1, NULL, 'j3', now()); ROLLBACK; -- viole l'unique (coalesce 0)
