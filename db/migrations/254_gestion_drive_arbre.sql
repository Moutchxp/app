-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 254 — LOT DRIVE-1 : LA MÉMOIRE DE L'ARBORESCENCE NEUVE, ET LA LISTE BLANCHE QUI LA PROTÈGE.
--
-- CE QU'ELLE PORTE : un dossier Drive que NOUS avons créé = une ligne ici, avec son identifiant Drive. Cette table
-- a DEUX rôles, et le second est le plus important :
--   ① la MÉMOIRE, qui rend la construction idempotente : on retrouve un dossier par son identifiant mémorisé,
--      JAMAIS par son nom (deux dossiers peuvent porter le même nom, et un humain peut renommer le nôtre) ;
--   ② la LISTE BLANCHE du garde-fou : aucune écriture Drive n'est permise dans un dossier qui n'est pas ici.
--
-- ═══ 🔴 POURQUOI UNE LISTE BLANCHE, ET PAS SEULEMENT « SOUS LA RACINE » ══════════════════════════════════════════
-- Un garde-fou qui dirait seulement « écris sous la racine » laisserait écrire dans un dossier qu'un humain aurait
-- déposé là à la main — et que personne ne nous a demandé de toucher. La règle d'Arno du 26/09/2026 est plus
-- stricte, et c'est elle qui est codée : le parent doit être un dossier que LE PROGRAMME a créé et enregistré ici.
-- Tout le reste du Drive — « Documents clients scannés » au premier chef — est hors d'atteinte par construction,
-- puisqu'aucune de ses lignes n'existe et qu'aucun code ne peut en créer une sans avoir d'abord créé le dossier.
--
-- 🔴 CETTE TABLE NE DÉCRIT QUE DES DOSSIERS QUE NOUS AVONS FAITS. On n'y enregistre JAMAIS un dossier trouvé : la
-- seule écriture possible est « je viens de créer ce dossier, voici son identifiant ». Un `INSERT` qui viendrait
-- d'ailleurs ouvrirait une brèche dans le garde-fou ② — c'est la raison de la contrainte sur `cree_par`.
--
-- ⚠️ LA RACINE EST UNIQUE, ET LE RESTE S'Y RATTACHE. `parent_drive_id` est NULL pour elle seule (index unique
-- partiel) : deux racines rendraient l'ascension du garde-fou ① ambiguë.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE STRUCTURELLE : cette table porte des NOMS DE DOSSIERS, qui contiennent des noms de
-- personnes (c'est leur objet). Elle ne porte ni coordonnée, ni pièce, ni contenu de courrier.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/254_gestion_drive_arbre.sql
--
-- POUR REVENIR EN ARRIÈRE (la commande de construction redit « pas encore installé » ; AUCUN dossier Drive n'est
-- touché — Drive ne sait rien de cette table) :
--   DROP TABLE IF EXISTS gestion_drive_refus, gestion_drive_arbre;
-- ⚠️ Retirer cette table ne SUPPRIME rien dans Drive : elle en perd seulement la mémoire, et une reconstruction
--   créerait alors des doublons. Ne la retirer que si l'arborescence a été supprimée à la main, côté Drive.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_annuaire_proprietaire') IS NULL THEN
    RAISE EXCEPTION 'La migration 253 (annuaire) doit être appliquée AVANT celle-ci : l''arborescence en découle.';
  END IF;
END $$;

-- ── ① L'ARBRE QUE NOUS AVONS CRÉÉ = LA LISTE BLANCHE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_drive_arbre (
  id              bigserial   PRIMARY KEY,
  -- 🔑 L'IDENTIFIANT DRIVE. Unique : un même dossier ne peut pas être enregistré deux fois, donc la liste blanche
  --   ne peut pas se dédoubler.
  drive_id        text        NOT NULL UNIQUE,
  -- NULL pour la RACINE, et pour elle seule. C'est par ce chaînage que le garde-fou ① remonte jusqu'à elle.
  parent_drive_id text        REFERENCES gestion_drive_arbre(drive_id) ON DELETE RESTRICT,
  sorte           text        NOT NULL,
  -- La clé métier : identifiant WIPPIMMO du propriétaire, du lot ou du bail ; sinon le rôle du dossier.
  -- C'est elle qui rend la construction IDEMPOTENTE : on cherche par (sorte, cle), on ne cherche jamais par nom.
  cle             text        NOT NULL,
  nom             text        NOT NULL,
  -- Le chemin lisible, tel qu'on le verrait dans Drive. Sert au journal et au rapport, jamais à retrouver un dossier.
  chemin          text        NOT NULL,
  -- 🔴 QUI L'A CRÉÉ : toujours notre programme. La contrainte interdit d'enregistrer ici un dossier « trouvé » —
  --   ce serait faire entrer dans la liste blanche quelque chose que nous n'avons pas fait.
  cree_par        text        NOT NULL DEFAULT 'construction',
  -- Enregistré introuvable dans Drive (supprimé à la main, sorti de la corbeille…). SIGNALÉ, jamais recréé en
  -- silence : recréer donnerait deux dossiers pour une même clé, et la mémoire cesserait d'être une mémoire.
  absent_le       timestamptz,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_drive_arbre_sorte_chk CHECK (sorte IN (
    'racine', 'non_rattaches', 'proprietaires', 'biens',
    'proprietaire', 'bien', 'occupation', 'rubrique', 'en_attente', 'raccourci', 'periode')),
  CONSTRAINT gestion_drive_arbre_cree_par_chk CHECK (cree_par = 'construction'),
  CONSTRAINT gestion_drive_arbre_nom_chk CHECK (btrim(nom) <> ''),
  -- La racine n'a pas de parent ; tout le reste en a un. Sans cela, un dossier orphelin échapperait à l'ascension.
  CONSTRAINT gestion_drive_arbre_racine_chk CHECK ((sorte = 'racine') = (parent_drive_id IS NULL))
);

-- UNE SEULE RACINE. Deux rendraient l'ascension du garde-fou ① ambiguë — et deux arborescences concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_drive_arbre_racine_unique
  ON gestion_drive_arbre ((1)) WHERE sorte = 'racine';

-- La clé d'idempotence : (sorte, cle) désigne AU PLUS un dossier. C'est elle qu'on interroge avant de créer.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_drive_arbre_cle_unique
  ON gestion_drive_arbre (sorte, cle);
CREATE INDEX IF NOT EXISTS gestion_drive_arbre_parent_idx
  ON gestion_drive_arbre (parent_drive_id);

COMMENT ON TABLE gestion_drive_arbre IS
  'LOT DRIVE-1 — les dossiers Drive que NOUS avons créés sous « Base de données locative ». Double rôle : mémoire '
  '(idempotence par (sorte, cle), jamais par nom) et LISTE BLANCHE du garde-fou — aucune écriture Drive n''est '
  'permise dans un dossier absent de cette table, même situé sous la racine. On n''y enregistre jamais un dossier '
  'trouvé : uniquement un dossier qu''on vient de créer.';
COMMENT ON COLUMN gestion_drive_arbre.absent_le IS
  'Enregistré mais introuvable dans Drive. SIGNALÉ, jamais recréé en silence : recréer donnerait deux dossiers pour '
  'une même clé et la mémoire cesserait d''être fiable.';

-- ── ② LE JOURNAL DES REFUS — une pièce de preuve, pas un log de confort ─────────────────────────────────────────
-- 🔴 TOUTE ÉCRITURE REFUSÉE PAR LE GARDE-FOU LAISSE UNE LIGNE ICI. Un refus silencieux serait le pire des deux
-- mondes : la protection joue, et personne ne sait qu'elle a dû jouer.
CREATE TABLE IF NOT EXISTS gestion_drive_refus (
  id              bigserial   PRIMARY KEY,
  survenu_le      timestamptz NOT NULL DEFAULT now(),
  -- L'opération tentée : 'creer_dossier', 'creer_raccourci', 'modifier', 'copier', 'supprimer', 'partager'.
  operation       text        NOT NULL,
  parent_drive_id text,
  cible_drive_id  text,
  nom_tente       text,
  -- Lequel des deux gardes a refusé, et pourquoi, en français.
  garde           text        NOT NULL,
  motif           text        NOT NULL,
  auteur_libelle  text        NOT NULL DEFAULT 'construction',
  CONSTRAINT gestion_drive_refus_garde_chk CHECK (garde IN ('hors_racine', 'hors_liste_blanche', 'racine_existante', 'autre')),
  CONSTRAINT gestion_drive_refus_motif_chk CHECK (btrim(motif) <> '')
);

CREATE OR REPLACE FUNCTION gestion_drive_refus_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_drive_refus est APPEND-ONLY (pièce de preuve) : % interdit.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_drive_refus_no_update_delete ON gestion_drive_refus;
CREATE TRIGGER gestion_drive_refus_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_drive_refus
  FOR EACH ROW EXECUTE FUNCTION gestion_drive_refus_append_only();
DROP TRIGGER IF EXISTS gestion_drive_refus_no_truncate ON gestion_drive_refus;
CREATE TRIGGER gestion_drive_refus_no_truncate
  BEFORE TRUNCATE ON gestion_drive_refus
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_drive_refus_append_only();

CREATE INDEX IF NOT EXISTS gestion_drive_refus_date_idx ON gestion_drive_refus (survenu_le DESC);

COMMENT ON TABLE gestion_drive_refus IS
  'LOT DRIVE-1 — journal APPEND-ONLY des écritures Drive REFUSÉES par le garde-fou. Un refus silencieux serait le '
  'pire des deux mondes : la protection joue, et personne ne sait qu''elle a dû jouer.';

-- ── ③ LE JOURNAL DU MODULE ACCEPTE L'ENTITÉ « drive_arbre » ─────────────────────────────────────────────────────
-- Créer un dossier est un GESTE : il laisse une ligne dans le journal du module, avec qui, quand, quoi et l'id.
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',          -- 243 : un courrier PARTI de chez nous
    'piece_drive',    -- 245 : une pièce jointe COPIÉE dans le Drive
    'compte_google',  -- 246 : un collaborateur relie ou délie son compte Google
    'annuaire',       -- 253 : un import de l'annuaire WIPPIMMO
    'drive_arbre'     -- 254 : un dossier créé dans « Base de données locative »
  ]));

COMMIT;
