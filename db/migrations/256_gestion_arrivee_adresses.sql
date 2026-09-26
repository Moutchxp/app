-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 256 — LOT DRIVE-2-bis : LE DOSSIER D'ARRIVÉE, LA TRACE MAIL EXHAUSTIVE, ET LES PROPOSITIONS DE TRI.
--
-- ═══ 🔴 CE QUE LA DÉCISION D'ARNO DU 26/09 CHANGE ═══════════════════════════════════════════════════════════════
-- La copie ne RANGE plus : elle DÉPOSE. Toutes les pièces partent dans un dossier d'arrivée unique, et le tri
-- devient une PROPOSITION mémorisée, qu'un geste séparé appliquera plus tard, après analyse. Trois raisons, et
-- elles sont bonnes : éprouver le tri avant de s'y fier, préparer la déduplication avec « Documents clients
-- scannés » (qui est en production), et libérer au plus vite le stockage de l'application.
--
-- ═══ 🔴 LA TABLE DES ADRESSES EST LA PIÈCE MAÎTRESSE, ET ELLE DÉPASSE CE LOT ═════════════════════════════════════
-- L'objectif des lots suivants est de reconstituer, logement par logement, l'historique COMPLET des échanges —
-- mails avec ET SANS pièce jointe, avec chaque partie. Cette table couvre donc les 56 802 messages, pas seulement
-- les 26 811 qui portent une pièce. Elle est écrite une fois ici, réutilisée ensuite, et RECALCULABLE : un nouvel
-- import de l'annuaire reconnaît des adresses qui ne l'étaient pas.
--
-- ⚠️ UNE ADRESSE EST RECONNUE **À LA DATE DU MAIL**, pas aujourd'hui. Un locataire a pu quitter le logement depuis ;
--   ranger son mail de 2021 dans le bien qu'il occupe en 2026 serait faux. La colonne `lot_cle` porte donc le lot
--   qu'il occupait CE JOUR-LÀ, et rien d'autre.
--
-- 🔴 NOS ADRESSES SONT MÉMORISÉES, MAIS MARQUÉES « interne ». On ne les jette pas — elles font partie de
--   l'historique d'un échange, et le lot RATTACHEMENT-1 en aura besoin pour savoir qui a écrit à qui. Elles ne
--   servent simplement JAMAIS de clé de rattachement : `gestion@` est des deux côtés de presque tous les mails.
--
-- ═══ 🔴 UNE PROPOSITION N'ÉCRASE JAMAIS LA PRÉCÉDENTE ════════════════════════════════════════════════════════════
-- `gestion_piece_proposition` est un HISTORIQUE. Quand le moteur change ou que l'annuaire s'enrichit, on ajoute
-- une ligne. Comparer l'ancienne et la nouvelle est précisément ce qui permettra de dire si le tri s'améliore —
-- une table écrasée ne dirait plus rien.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE N'EST ÉCRITE PAR CETTE MIGRATION : elle crée des tables vides.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/256_gestion_arrivee_adresses.sql
--
-- POUR REVENIR EN ARRIÈRE (les commandes redisent « pas encore installé » ; AUCUN fichier Drive n'est touché) :
--   DROP TABLE IF EXISTS gestion_message_adresse, gestion_piece_proposition, gestion_drive_production;
--   ALTER TABLE gestion_piece_drive DROP COLUMN IF EXISTS deja_en_production,
--     DROP COLUMN IF EXISTS production_drive_file_id;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_drive_arbre') IS NULL THEN
    RAISE EXCEPTION 'La migration 254 (arborescence Drive) doit être appliquée AVANT celle-ci.';
  END IF;
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- ── ① LE DOSSIER D'ARRIVÉE entre dans les sortes reconnues ──────────────────────────────────────────────────────
-- « 00 Arrivée des mails », puis ses AAAA / MM. Ils passent par le chemin gardé comme tous les autres dossiers.
ALTER TABLE gestion_drive_arbre DROP CONSTRAINT IF EXISTS gestion_drive_arbre_sorte_chk;
ALTER TABLE gestion_drive_arbre
  ADD CONSTRAINT gestion_drive_arbre_sorte_chk CHECK (sorte IN (
    'racine', 'non_rattaches', 'proprietaires', 'biens',
    'proprietaire', 'bien', 'occupation', 'rubrique', 'en_attente', 'raccourci', 'periode',
    'arrivee'));   -- 256 : le dossier d'arrivée unique de toutes les pièces

-- ── ② LA TRACE MAIL EXHAUSTIVE ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_message_adresse (
  id             bigserial   PRIMARY KEY,
  message_id     bigint      NOT NULL REFERENCES gestion_message(id) ON DELETE CASCADE,
  -- Forme canonique (minuscules), celle qu'on rapproche de l'annuaire.
  adresse        text        NOT NULL,
  -- Telle qu'elle était écrite, avec son nom d'affichage éventuel. On n'invente rien, on n'efface rien.
  adresse_brute  text,
  -- D'où elle vient dans le message. 'transfere' = expéditeur d'origine d'un mail transféré, lu DANS LE CORPS.
  role           text        NOT NULL,
  -- 🔴 Une de nos adresses (gestion@, @criterimmo.fr, @sansvisavis.com, partenaire interne). Mémorisée pour
  --   l'historique des échanges, JAMAIS employée comme clé de rattachement.
  interne        boolean     NOT NULL DEFAULT false,
  -- Ce que l'annuaire en dit, AU MOMENT DU CALCUL. NULL = inconnue de l'annuaire.
  partie         text,
  proprietaire_cle text,
  locataire_id   bigint,
  -- 🔴 LE LOT OCCUPÉ **À LA DATE DU MAIL**, pas aujourd'hui. C'est toute la valeur de cette colonne.
  lot_cle        text,
  -- Pourquoi ce rapprochement, en français : sert à relire une reconnaissance douteuse sans rouvrir le code.
  motif          text,
  calcule_le     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_message_adresse_role_chk
    CHECK (role IN ('expediteur', 'destinataire', 'copie', 'repondre_a', 'transfere')),
  CONSTRAINT gestion_message_adresse_partie_chk
    CHECK (partie IS NULL OR partie IN ('proprietaire', 'locataire')),
  CONSTRAINT gestion_message_adresse_adresse_chk CHECK (btrim(adresse) <> '')
);

-- L'IDEMPOTENCE : une adresse, un rôle, un message = une ligne. Recalculer met à jour, ne double pas.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_message_adresse_unique
  ON gestion_message_adresse (message_id, adresse, role);
-- « Quelles adresses porte ce message ? » et « quels messages cite cette adresse ? » : les deux sens servent.
CREATE INDEX IF NOT EXISTS gestion_message_adresse_msg_idx ON gestion_message_adresse (message_id);
CREATE INDEX IF NOT EXISTS gestion_message_adresse_adr_idx ON gestion_message_adresse (adresse) WHERE interne = false;
-- « Quelles adresses l'annuaire reconnaît-il ? » — la question du rapport, sur 200 000 lignes attendues.
CREATE INDEX IF NOT EXISTS gestion_message_adresse_partie_idx
  ON gestion_message_adresse (partie, lot_cle) WHERE partie IS NOT NULL;

COMMENT ON TABLE gestion_message_adresse IS
  'LOT DRIVE-2-bis — toutes les adresses de TOUS les messages (56 802), avec leur rôle. Écrite pour ce lot, mais '
  'faite pour les suivants : reconstituer l''historique complet des échanges d''un logement suppose de savoir qui '
  'écrivait à qui, y compris sur les mails SANS pièce jointe. Recalculable après un import d''annuaire.';
COMMENT ON COLUMN gestion_message_adresse.lot_cle IS
  'Le lot que ce locataire occupait À LA DATE DU MAIL. Un locataire a pu déménager depuis : ranger son mail de '
  '2021 dans le bien qu''il occupe en 2026 serait faux.';
COMMENT ON COLUMN gestion_message_adresse.interne IS
  'Une de NOS adresses. Mémorisée (elle fait partie de l''échange) mais jamais employée comme clé de '
  'rattachement : gestion@ est des deux côtés de presque tous les mails.';

-- ── ③ LES PROPOSITIONS DE TRI, HISTORISÉES ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_piece_proposition (
  id             bigserial   PRIMARY KEY,
  piece_id       bigint      NOT NULL REFERENCES gestion_piece(id) ON DELETE CASCADE,
  propose_le     timestamptz NOT NULL DEFAULT now(),
  -- 'bien' | 'proprietaire' | 'aucune'. « aucune » est une proposition à part entière : elle dit qu'on ne sait pas.
  destination_sorte text     NOT NULL,
  destination_cle text,
  regle          text        NOT NULL,
  confiance      text        NOT NULL,
  motif          text,
  -- 🔴 LES ADRESSES QUI ONT FONDÉ LA PROPOSITION. Sans elles, on ne pourrait pas dire POURQUOI le moteur a
  --   proposé ce bien-là — donc pas juger s'il a eu raison.
  adresses_fondatrices text,
  CONSTRAINT gestion_piece_proposition_sorte_chk
    CHECK (destination_sorte IN ('bien', 'proprietaire', 'aucune')),
  CONSTRAINT gestion_piece_proposition_cle_chk
    CHECK ((destination_sorte = 'aucune') = (destination_cle IS NULL))
);

-- 🔴 PAS D'INDEX UNIQUE SUR piece_id : c'est un HISTORIQUE. Une nouvelle proposition s'AJOUTE.
CREATE INDEX IF NOT EXISTS gestion_piece_proposition_piece_idx
  ON gestion_piece_proposition (piece_id, propose_le DESC);
CREATE INDEX IF NOT EXISTS gestion_piece_proposition_date_idx
  ON gestion_piece_proposition (propose_le DESC);

COMMENT ON TABLE gestion_piece_proposition IS
  'LOT DRIVE-2-bis — ce que le moteur PROPOSE pour une pièce, sans rien ranger. HISTORIQUE : une nouvelle '
  'proposition s''ajoute, elle n''écrase jamais. Comparer l''ancienne et la nouvelle est ce qui permettra de dire '
  'si le tri s''améliore — une table écrasée ne dirait plus rien.';

-- ── ④ L'INVENTAIRE DE « Documents clients scannés » (LECTURE SEULE, métadonnées) ────────────────────────────────
-- 🔒 Ce dossier est EN PRODUCTION et INTOUCHABLE. On ne lit que des métadonnées (md5, taille, nom, chemin) pour
--   savoir ce qui s'y trouve DÉJÀ, et ne pas recopier ce qui y est. Aucun octet de contenu n'est téléchargé.
CREATE TABLE IF NOT EXISTS gestion_drive_production (
  id             bigserial   PRIMARY KEY,
  drive_file_id  text        NOT NULL UNIQUE,
  md5            text,
  taille_octets  bigint,
  nom            text,
  chemin         text,
  releve_le      timestamptz NOT NULL DEFAULT now()
);

-- La question posée pour chaque pièce copiée : « ce md5 est-il déjà en production ? »
CREATE INDEX IF NOT EXISTS gestion_drive_production_md5_idx
  ON gestion_drive_production (md5) WHERE md5 IS NOT NULL;

COMMENT ON TABLE gestion_drive_production IS
  'LOT DRIVE-2-bis — empreintes des fichiers de « Documents clients scannés », relevées en LECTURE SEULE '
  '(métadonnées uniquement, aucun téléchargement). Sert à repérer les pièces déjà présentes en production avant '
  'le lot de déduplication. Ce dossier reste intouchable.';

-- ── ⑤ CE QUE LA COPIE RETIENT DE LA DÉDUPLICATION ───────────────────────────────────────────────────────────────
ALTER TABLE gestion_piece_drive
  ADD COLUMN IF NOT EXISTS deja_en_production        boolean,
  ADD COLUMN IF NOT EXISTS production_drive_file_id  text;

COMMENT ON COLUMN gestion_piece_drive.deja_en_production IS
  'LOT DRIVE-2-bis — un fichier de même empreinte existe déjà dans « Documents clients scannés ». NULL = pas '
  'encore comparé. Constat, pas action : rien n''est supprimé de ce fait dans ce lot.';

-- ── ⑥ LE JOURNAL DU MODULE ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece',
    'adresses_messages',   -- 256 : une passe de relevé des adresses
    'production_drive'     -- 256 : un inventaire de « Documents clients scannés »
  ]));

COMMIT;
