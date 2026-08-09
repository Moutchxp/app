-- 084_proposition_cada.sql — Module VEILLE PERMIS (chantier X5) : PROPOSITION de saisine CADA par e-mail. Trace des
-- propositions envoyées (à soi-même, jamais à une mairie/la CADA) + interrupteur d'activation. TU NE L'APPLIQUES PAS. Requiert 083.
--
-- STRICTEMENT ADDITIVE : CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT idempotent. Aucun DROP de
-- table/colonne/index, aucune recréation de contrainte existante. GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment
-- → golden 29.107259068449615 intact). Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/084_proposition_cada.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) proposition_cada : TRAÇABILITÉ des propositions de saisine envoyées par e-mail (à l'exploitant). UNE ligne par demande
--    proposée. La CONTRAINTE D'UNICITÉ sur demande_id est le GARDE-FOU « une seule proposition par demande, jamais de rappel » :
--    la veille n'insère qu'APRÈS émission confirmée ; la présence d'une ligne empêche toute nouvelle proposition (le SELECT de
--    la veille l'exclut, et l'unique tranche un doublon concurrent). demande_id → FK vers demande (CASCADE : si la demande
--    disparaît, sa trace de proposition n'a plus d'objet).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposition_cada (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demande_id    bigint NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
  destinataire  text NOT NULL,            -- adresse d'alerte à laquelle la proposition a été envoyée (trace)
  message_id    text,                     -- message-id SMTP si le fournisseur l'a renvoyé (NULL sinon)
  envoyee_le    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposition_cada_demande_id_uniq UNIQUE (demande_id)  -- ⟵ garantit « une seule proposition par demande »
);

COMMENT ON TABLE proposition_cada IS
  'X5 — trace des e-mails de PROPOSITION de saisine CADA (envoyés à l''exploitant, JAMAIS à une mairie ni à la CADA). Écrite APRÈS émission confirmée.';
COMMENT ON CONSTRAINT proposition_cada_demande_id_uniq ON proposition_cada IS
  'X5 — GARANTIT qu''une demande n''est proposée qu''UNE FOIS (jamais de rappel quotidien) : la veille exclut les demandes déjà tracées, et cette unique tranche tout doublon concurrent (23505).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) config_veille : interrupteur d'activation des propositions (opt-in, défaut false). Le destinataire n'est PAS un nouveau
--    champ : c'est l'adresse d'alerte déjà configurée (config_veille.alerte_email). Éditable dans l'écran Réglages (booléen).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS proposition_cada_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN config_veille.proposition_cada_active IS
  'X5 — quand true, la veille envoie (à alerte_email) une proposition de saisine CADA pour chaque demande devenue saisissable, UNE seule fois par demande (trace proposition_cada). Opt-in, défaut false. N''envoie JAMAIS rien à une mairie ni à la CADA.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   \d proposition_cada        -- colonnes + UNIQUE (demande_id) + FK demande
--   SELECT proposition_cada_active FROM config_veille WHERE id = 1;  -- false par défaut
--
--   -- DRY-RUN complet en transaction ANNULÉE (ne persiste RIEN) — nécessite une demande existante :
--   -- BEGIN;
--   --   SELECT id AS d FROM demande LIMIT 1 \gset
--   --   INSERT INTO proposition_cada (demande_id, destinataire) VALUES (:d, 'a@x.fr');           -- 1re : OK
--   --   INSERT INTO proposition_cada (demande_id, destinataire) VALUES (:d, 'a@x.fr');           -- 2e même demande : DOIT ÉCHOUER (unique)
--   -- ROLLBACK;   -- rien ne persiste ; \d proposition_cada après ROLLBACK ne doit plus montrer la table si elle a été créée dans CE dry-run
--   -- (pour un dry-run intégral : remplacer le COMMIT ci-dessus par ROLLBACK, relancer, puis vérifier qu'aucune table/colonne n'a persisté)
