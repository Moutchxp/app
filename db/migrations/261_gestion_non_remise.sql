-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 261 — LOT ENVOI-DIAG : LES AVIS DE NON-REMISE, RATTACHÉS AU MESSAGE QU'ILS CONCERNENT.
--
-- ═══ LE PROBLÈME ════════════════════════════════════════════════════════════════════════════════════════════════
-- Quand un mail n'arrive pas, le serveur d'en face le dit : il renvoie un avis dans la boîte de gestion@. Il y en a
-- 137 en base. Ils y dormaient comme des messages ordinaires, dans un échange à eux, sans lien avec le message
-- qu'ils concernent — et l'application continuait d'afficher « envoyé » pour un mail refusé.
--
-- Un envoi accepté par Gmail n'est PAS un envoi arrivé : Gmail accepte, met en file, puis tente la remise. Le refus
-- vient des secondes ou des heures plus tard. La réponse à l'appel d'envoi ne peut donc rien en dire — la seule
-- vérité sur l'arrivée est cet avis, ou son absence.
--
-- ═══ 🔴 POURQUOI UNE TABLE, ALORS QUE TOUT EST DÉJÀ DANS LE CORPS DE L'AVIS ═════════════════════════════════════
-- Le module préfère toujours DÉRIVER plutôt que STOCKER, et la règle tient : ici, ce qui est stocké n'est pas un
-- ÉTAT (qui pourrait divenger de la réalité), c'est le RÉSULTAT DE LECTURE d'un contenu immuable, plus le LIEN qu'on
-- ne peut établir qu'en interrogeant la base. Reparser 137 avis — demain des milliers — à chaque affichage de liste
-- pour retrouver un lien qui ne changera jamais serait payer sans fin un travail fait une fois.
--
-- ⚠️ `origine_message_id` EST NULLABLE, ET C'EST UNE INFORMATION. 73 avis sur 137 portent un rapport machine, et
-- tous ne citent pas un message que nous connaissons (l'outil de comptabilité envoie aussi au nom de CRITERIMMO,
-- hors de l'application). Un avis non rattaché est un avis LU mais orphelin : on le garde tel quel, on ne l'accroche
-- pas au hasard à un message plausible.
--
-- 🔴 AJOUT SEUL, TENU PAR UN TRIGGER. Un avis de non-remise est une pièce de preuve : il ne se corrige pas.
--
-- ⚠️ SANS CETTE MIGRATION, TOUT FONCTIONNE COMME AVANT. La sonde `nonRemiseDisponible` est consultée avant chaque
-- lecture : absente, aucune mention n'apparaît, aucune requête ne nomme la table, et la relève ne tente rien.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE CRÉÉE : la table est vide. Une ligne portera une adresse de destinataire et la phrase
-- du serveur distant — jamais le contenu d'un message.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/261_gestion_non_remise.sql
--   npm run gestion:non-remise:rattraper      # lit les 137 avis déjà en base (lecture seule côté Gmail)
--
-- POUR REVENIR EN ARRIÈRE (rien n'est perdu : les avis restent des messages ordinaires) :
--   DROP TABLE IF EXISTS gestion_non_remise;
--   DROP FUNCTION IF EXISTS gestion_non_remise_append_only();
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_message') IS NULL THEN
    RAISE EXCEPTION 'La migration 228 (module gestion) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_non_remise (
  id                 bigserial   PRIMARY KEY,
  -- L'AVIS lui-même : c'est un message comme un autre, capturé par la relève. Unique : un avis ne se lit qu'une fois,
  --   et c'est cette clé qui rend le rattrapage idempotent.
  avis_message_id    bigint      NOT NULL UNIQUE REFERENCES gestion_message(id) ON DELETE CASCADE,
  -- LE MESSAGE CONCERNÉ. `NULL` = l'avis est lisible mais cite un message que nous ne connaissons pas (envoi fait
  --   hors de l'application). On ne devine pas : voir l'encadré ci-dessus.
  origine_message_id bigint          NULL REFERENCES gestion_message(id) ON DELETE SET NULL,
  -- L'échange du message concerné, recopié pour que la liste n'ait pas à repasser par le message. Dérivable, mais
  --   c'est le chemin de lecture le plus fréquent (une ligne de liste par échange).
  origine_fil_id     bigint          NULL REFERENCES gestion_fil(id) ON DELETE SET NULL,
  sorte              text        NOT NULL,
  destinataire       text            NULL,
  action             text            NULL,
  statut             text            NULL,
  diagnostic         text            NULL,
  motif              text        NOT NULL,
  constate_le        timestamptz NOT NULL DEFAULT now(),
  -- 🔴 « permanent » = le mail n'arrivera pas. « temporaire » = le serveur distant réessaiera. Les confondre ferait
  --   annoncer une perte pour un retard qui se résout tout seul.
  CONSTRAINT gestion_non_remise_sorte_chk CHECK (sorte = ANY (ARRAY['permanent', 'temporaire'])),
  CONSTRAINT gestion_non_remise_motif_chk CHECK (btrim(motif) <> ''),
  -- Un avis ne peut pas se rattacher à lui-même : ce serait le signe d'un appariement parti de travers.
  CONSTRAINT gestion_non_remise_pas_soi_chk CHECK (origine_message_id IS DISTINCT FROM avis_message_id)
);

-- « Ce message a-t-il été refusé ? » — la question posée pour CHAQUE message d'un fil ouvert, et pour chaque ligne
--   de la liste Envoyés. Les deux chemins de lecture, les deux index.
CREATE INDEX IF NOT EXISTS gestion_non_remise_origine_idx ON gestion_non_remise (origine_message_id);
CREATE INDEX IF NOT EXISTS gestion_non_remise_fil_idx     ON gestion_non_remise (origine_fil_id, constate_le DESC);

CREATE OR REPLACE FUNCTION gestion_non_remise_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_non_remise est APPEND-ONLY (avis d''un serveur distant) : % interdit.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_non_remise_no_update_delete ON gestion_non_remise;
CREATE TRIGGER gestion_non_remise_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_non_remise
  FOR EACH ROW EXECUTE FUNCTION gestion_non_remise_append_only();
DROP TRIGGER IF EXISTS gestion_non_remise_no_truncate ON gestion_non_remise;
CREATE TRIGGER gestion_non_remise_no_truncate
  BEFORE TRUNCATE ON gestion_non_remise
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_non_remise_append_only();

COMMENT ON TABLE gestion_non_remise IS
  'LOT ENVOI-DIAG — un avis de non-remise lu, et le message qu''il concerne quand nous le connaissons. Append-only. '
  'Le contenu de l''avis reste dans `gestion_message` : cette table ne porte que le RÉSULTAT DE SA LECTURE et le LIEN.';
COMMENT ON COLUMN gestion_non_remise.origine_message_id IS
  'NULL = avis lisible mais citant un message inconnu de la base (envoi fait hors de l''application). On ne rattache '
  'jamais au hasard : un avis accroché au mauvais message ferait croire à un échec qui n''a pas eu lieu.';

-- ── LE JOURNAL DU MODULE ────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 ON AJOUTE À LA LISTE EXISTANTE, ON NE LA RÉÉCRIT PAS — et ce n'est pas un raffinement.
--   Toutes les migrations précédentes recopiaient la liste entière en dur. Deux migrations non appliquées en attente
--   (260 pour « vidage_stockage », celle-ci pour « non_remise ») suffisent alors à créer un piège : appliquée en
--   second, chacune EFFACE la valeur ajoutée par l'autre, et une écriture de journal parfaitement légitime se met à
--   être refusée — sans que rien ne le dise avant le jour où la fonctionnalité sert.
--   Lire la contrainte en place et y insérer la valeur rend l'ordre d'application indifférent, et le geste
--   réexécutable : si « non_remise » y est déjà, on ne touche à rien.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
  END IF;
  IF position('''non_remise''' IN def) > 0 THEN RETURN; END IF;
  EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
  EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
          || replace(def, 'ARRAY[', 'ARRAY[''non_remise''::text, ');
END $$;

COMMIT;
