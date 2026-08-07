-- 073_demande_reponse.sql — Module VEILLE PERMIS (chantier R1) : SCHÉMA DE L'ENTRANT (boucle de retour CRPA).
-- ⚠️ CE CHANTIER NE LIT AUCUNE BOÎTE, NE STOCKE AUCUNE PIÈCE, N'ÉCRIT AUCUN demande.statut : il ne fait que créer les
-- tables qui accueilleront un message ENTRANT et ses pièces. La lecture IMAP, le dépôt S3 et la clôture sont des chantiers
-- ultérieurs.
--
-- POURQUOI : la chaîne sait ÉMETTRE une demande (demande_acheminement, strictement SORTANT) mais rien ne modélise une
-- RÉPONSE de mairie. On grave d'abord la table qui conservera TOUT message relevé — y compris NON rattaché à une demande
-- (demande_id NULL VOULU : un message qu'on n'a pas su relier ne doit jamais être perdu ; c'est la file « à rattacher »).
--
-- SÛR : DDL ADDITIVE uniquement (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS). Aucun DROP, aucun ALTER
-- destructeur, aucun trigger. N'étend PAS demande_acheminement (sortant). Ne touche NI demande.statut NI son CHECK.
-- FK NULLABLE vers demande(id) (stable) + FK CASCADE piece→réponse. GOLDEN-SAFE (aucun contact
-- moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotent. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/073_demande_reponse.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer la commande ci-dessus.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_reponse — UN message ENTRANT relevé dans une boîte de réponse (profil entreprise ou personne).
--    demande_id NULLABLE : un message NON rattaché est conservé (file « à rattacher », cf. index partiel plus bas).
--    message_id AVEC chevrons, comme demande_acheminement.message_id (ex. « <29d8…@sansvisavis.com> ») → UNIQUE :
--    un même message relevé deux fois n'est enregistré qu'une fois.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demande_reponse (
  id                    bigserial   PRIMARY KEY,
  demande_id            bigint      REFERENCES demande(id),   -- NULL VOULU : message non rattaché, jamais perdu
  profil_boite          text        NOT NULL
                          CONSTRAINT demande_reponse_profil_boite_chk CHECK (profil_boite IN ('entreprise','personne')),
  message_id            text        NOT NULL
                          CONSTRAINT demande_reponse_message_id_key UNIQUE,   -- AVEC chevrons (comme demande_acheminement)
  in_reply_to           text,                                 -- en-tête In-Reply-To (chevrons), si présent
  references_brut       text,                                 -- en-tête References brut (chaîne de Message-ID), si présent
  de_adresse            text        NOT NULL,                 -- expéditeur (adresse)
  de_nom                text,                                 -- expéditeur (nom affiché), si présent
  objet                 text,
  recu_le               timestamptz NOT NULL,                 -- date de réception (Date de l'en-tête / relève)
  corps_texte           text,                                 -- corps en texte brut (pour re-extraire une référence)
  rattachement_methode  text        NOT NULL DEFAULT 'aucun'
                          CONSTRAINT demande_reponse_rattachement_methode_chk
                          CHECK (rattachement_methode IN ('message_id','reference_objet','reference_corps','manuel','aucun')),
  rattache_le           timestamptz,                          -- horodatage du rattachement (NULL tant que non rattaché)
  traite_le             timestamptz,                          -- horodatage de traitement (NULL tant que non traité)
  note                  text,
  cree_le               timestamptz NOT NULL DEFAULT now(),
  maj_le                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE demande_reponse IS
  'Un message ENTRANT relevé dans une boîte de réponse CRPA. Conservé MÊME non rattaché (demande_id NULL VOULU) — un message qu''on n''a pas su relier ne doit jamais être perdu. N''écrit JAMAIS demande.statut (chantier ultérieur).';
COMMENT ON COLUMN demande_reponse.demande_id IS 'Demande rattachée, ou NULL (file « à rattacher », cf. index partiel demande_reponse_a_rattacher_idx).';
COMMENT ON COLUMN demande_reponse.message_id IS 'Message-ID de l''e-mail entrant, AVEC chevrons (même forme que demande_acheminement.message_id). UNIQUE → dédoublonnage des relèves.';
COMMENT ON COLUMN demande_reponse.rattachement_methode IS 'Comment le rattachement a été fait : message_id | reference_objet | reference_corps | manuel | aucun (non rattaché).';

CREATE INDEX IF NOT EXISTS demande_reponse_demande_idx      ON demande_reponse (demande_id);
CREATE INDEX IF NOT EXISTS demande_reponse_recu_idx         ON demande_reponse (recu_le DESC);
-- File « à rattacher » : index PARTIEL sur les seuls messages non reliés (petit, ciblé).
CREATE INDEX IF NOT EXISTS demande_reponse_a_rattacher_idx  ON demande_reponse (recu_le DESC) WHERE demande_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) demande_reponse_piece — une pièce jointe d'un message entrant. cle_stockage NULL tant que la pièce n'a pas été
--    déposée (S3) : ce chantier ne stocke rien ; le dépôt et l'empreinte viendront plus tard. Si le dépôt échoue,
--    motif_non_stocke garde la raison (jamais de pièce silencieusement perdue).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demande_reponse_piece (
  id                bigserial   PRIMARY KEY,
  reponse_id        bigint      NOT NULL REFERENCES demande_reponse(id) ON DELETE CASCADE,
  nom_fichier       text        NOT NULL,
  type_mime         text,
  taille_octets     bigint,
  cle_stockage      text,                    -- clé S3, NULL tant que non déposé
  empreinte_sha256  text,
  stocke_le         timestamptz,
  motif_non_stocke  text                     -- renseigné si la pièce n'a pas pu être stockée
);

COMMENT ON TABLE demande_reponse_piece IS
  'Pièce jointe d''un message entrant. Le dépôt objet (S3) est un chantier ultérieur : cle_stockage/empreinte_sha256/stocke_le restent NULL tant que la pièce n''est pas déposée ; motif_non_stocke garde la raison d''un échec de dépôt.';
COMMENT ON COLUMN demande_reponse_piece.cle_stockage IS 'Clé de l''objet dans le stockage S3, NULL tant que la pièce n''a pas été déposée.';

CREATE INDEX IF NOT EXISTS demande_reponse_piece_reponse_idx ON demande_reponse_piece (reponse_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse
--   \d demande_reponse_piece
--
--   -- (a) FK demande_id NULLABLE (message non rattaché conservé) :
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_name = 'demande_reponse' AND column_name = 'demande_id';   -- attendu : YES
--
--   -- (b) CHECK bornant profil_boite et rattachement_methode :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'demande_reponse'::regclass AND contype = 'c';
--
--   -- (c) UNIQUE sur message_id + index partiel « à rattacher » présents :
--   SELECT indexname FROM pg_indexes WHERE tablename = 'demande_reponse';
--   -- attendu : ..._message_id_key (unique), ..._demande_idx, ..._recu_idx, ..._a_rattacher_idx
--
--   -- (d) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO demande_reponse (profil_boite, message_id, de_adresse, recu_le) VALUES ('xxx','<a@b>','a@b', now()); ROLLBACK; -- viole profil_boite_chk
--   -- BEGIN; INSERT INTO demande_reponse (profil_boite, message_id, de_adresse, recu_le, rattachement_methode) VALUES ('entreprise','<a@b>','a@b', now(), 'sms'); ROLLBACK; -- viole rattachement_methode_chk
--   -- BEGIN; INSERT INTO demande_reponse (profil_boite, message_id, de_adresse, recu_le) VALUES ('entreprise','<dup@svav>','a@b', now()); INSERT INTO demande_reponse (profil_boite, message_id, de_adresse, recu_le) VALUES ('personne','<dup@svav>','c@d', now()); ROLLBACK; -- viole message_id_key (UNIQUE)
