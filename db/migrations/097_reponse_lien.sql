-- 097_reponse_lien.sql — Module VEILLE PERMIS (chantier L1) : capter les LIENS de téléchargement d'une réponse mairie.
-- ⚠️ POURQUOI : une mairie (cas réel : Paris) peut ne joindre AUCUN document et donner à la place un LIEN vers sa GED, valable
-- quelques jours. Aujourd'hui `imap.ts` ne conserve que le corps TEXTE (jamais le HTML) et n'extrait aucune URL : la réponse
-- peut contenir les documents demandés sans que le système en sache rien, et le lien meurt en silence. On grave ici :
--   (1) demande_reponse.corps_html — le corps HTML est désormais conservé (permet la ré-extraction et l'audit d'une capture ratée) ;
--   (2) demande_reponse_lien — les URL candidates extraites d'une réponse, avec le marqueur « fort » (chemin porteur d'un jeton,
--       ex. /share/s/<jeton>/) et l'expiration EXPLICITE si elle est écrite (jamais devinée : nulle sinon).
--
-- RÈGLE MÉTIER (fondateur, L1) : on ne SUIT JAMAIS un lien automatiquement (usage unique / tracé) — le téléchargement est un
-- geste HUMAIN. Un lien ne fait JAMAIS basculer en Archives ni ne pose satisfait_le (déjà acté en T2) ; il produit une alerte
-- datée, pas un archivage. L'expiration n'est captée que si elle est explicite ; approximative (« environ 7 jours ») → NULLE.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN / CREATE TABLE / CREATE INDEX IF NOT EXISTS ; FK CASCADE lien→réponse). Aucun DROP,
-- aucun UPDATE, aucun trigger. N'écrit JAMAIS demande.statut, ne pose aucun satisfait_le, ne bascule rien vers Archives.
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul
-- BEGIN/COMMIT. Requiert 073 (demande_reponse). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/097_reponse_lien.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_reponse.corps_html — corps HTML conservé (nullable : un message peut être texte seul). Sans lui, un parseur amélioré
--    ne pourrait jamais rattraper les liens des messages déjà reçus, et aucun audit d'extraction ne serait possible.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS corps_html text;

COMMENT ON COLUMN demande_reponse.corps_html IS 'Corps HTML brut du message (nullable). Conservé pour la ré-extraction des liens et l''audit d''une extraction ratée (chantier L1). Jamais parsé pour suivre un lien.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) demande_reponse_lien — une URL candidate extraite d'une réponse. `fort` = chemin porteur d'un jeton (candidat sérieux) —
--    indice d'AFFICHAGE, jamais une décision (on n'en choisit aucun automatiquement). `expire_le` NULL tant que l'expiration
--    n'est pas écrite EXPLICITEMENT dans le message (jamais devinée). `expiration_source` dit COMMENT elle a été lue.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demande_reponse_lien (
  id                 bigserial   PRIMARY KEY,
  reponse_id         bigint      NOT NULL REFERENCES demande_reponse(id) ON DELETE CASCADE,
  url                text        NOT NULL,                 -- forme BRUTE (jamais réécrite/normalisée : un lien à jeton reste intact)
  fort               boolean     NOT NULL DEFAULT false,   -- chemin à jeton → candidat FORT (affichage en tête, jamais choisi auto)
  expire_le          timestamptz,                          -- expiration EXPLICITE, sinon NULL (« durée de validité non précisée »)
  expiration_source  text
                       CONSTRAINT demande_reponse_lien_exp_source_chk
                       CHECK (expiration_source IS NULL OR expiration_source IN ('absolue','relative')),
  expiration_indice  text,                                 -- fragment reconnu (« 7 jours », « jusqu'au 17/08/2026 ») — audit + rendu
  capte_le           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demande_reponse_lien_unique UNIQUE (reponse_id, url)  -- une URL n'est captée qu'une fois par message
);

COMMENT ON TABLE demande_reponse_lien IS
  'URL candidates extraites du corps (texte + HTML) d''une réponse mairie (chantier L1). On ne SUIT JAMAIS un lien. `fort` = chemin à jeton (candidat sérieux, indice d''affichage, jamais une décision). `expire_le` NULL sauf expiration écrite explicitement. Ne fait NI archivage NI satisfait_le.';
COMMENT ON COLUMN demande_reponse_lien.fort IS 'Chemin porteur d''un jeton opaque (ex. /share/s/<jeton>/) → candidat FORT. Indice d''affichage (forts en tête) ; JAMAIS un choix automatique.';
COMMENT ON COLUMN demande_reponse_lien.expire_le IS 'Date d''expiration EXPLICITE (absolue ou durée relative écrite). NULL si non précisée ou approximative — jamais devinée.';

CREATE INDEX IF NOT EXISTS demande_reponse_lien_reponse_idx ON demande_reponse_lien (reponse_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--   \d demande_reponse_lien
--
--   -- (a) colonne corps_html (text, nullable) :
--   SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'demande_reponse' AND column_name = 'corps_html';
--
--   -- (b) table des liens : FK CASCADE, CHECK source, UNIQUE (reponse_id, url), index :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'demande_reponse_lien'::regclass;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'demande_reponse_lien';
--
--   -- (c) contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO demande_reponse_lien (reponse_id, url, expiration_source) VALUES (1,'x','devinee'); ROLLBACK; -- viole le CHECK
