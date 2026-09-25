-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 253 — LOT ANNUAIRE-1 : L'ANNUAIRE DES PROPRIÉTAIRES, DE LEURS LOTS ET DE LEURS LOCATAIRES.
--
-- CE QU'ELLE PORTE : une copie LOCALE et INTERROGEABLE de trois exports WIPPIMMO (Lots, Bailleurs, Locataires), pour
-- répondre en une frappe à « qui est qui par rapport à ce logement ? ». WIPPIMMO reste la SOURCE : ici, rien n'est
-- saisi à la main, tout vient d'un import, et chaque ligne garde l'identifiant WIPPIMMO dont elle est née.
--
-- ═══ CE QUI A ÉTÉ MESURÉ SUR LES VRAIS EXPORTS (25/09/2026), ET QUI EXPLIQUE CHAQUE CHOIX ═══════════════════════
--
-- 🔴 « LOCATAIRES » N'EST PAS UNE TABLE DE PERSONNES, C'EST UNE TABLE DE BAUX. Mesuré : 535 lignes pour 509 noms
--   distincts ; 23 noms portés par plusieurs lignes, dont 22 avec LE MÊME e-mail sur toutes leurs lignes — une
--   personne, plusieurs baux. D'où DEUX tables : `gestion_annuaire_locataire` (la personne) et
--   `gestion_annuaire_occupation` (le bail, un par ligne WIPPIMMO). Deux lignes ne deviennent UNE personne que si
--   le nom normalisé ET un contact (e-mail, sinon téléphone) coïncident — jamais sur le seul nom. Le 23ᵉ cas, qui
--   n'a pas le même e-mail, reste donc DEUX personnes : on ne fusionne pas au jugé.
--
-- 🔴 UN LOT SANS PROPRIÉTAIRE RESTE UN LOT. `Lots.Propriétaire` est du TEXTE (« NOM Prénom »), rapproché de
--   `Bailleurs` sur « Nom prop. + Prénom prop. » normalisé — 270 sur 270 mesurés. Mais un nom peut être porté par
--   DEUX bailleurs (mesuré : 1 cas, « GUSCHEMANN Gracieuse », ids 102 et 103) : alors `proprietaire_id` reste NULL,
--   le texte d'origine est conservé dans `proprietaire_texte`, et l'import le SIGNALE. Rapprocher au jugé
--   attribuerait les lots, les loyers et les locataires d'un client à un autre.
--
-- 🔴 UNE OCCUPATION PEUT VISER UN LOT QU'ON NE GÈRE PAS. Mesuré : 14 lignes de `Locataires` sur 535 citent un
--   `Lot` absent de l'export Lots. `lot_id` est alors NULL et `lot_wippimmo_id` garde la référence : l'écran dit
--   « lot hors gestion » au lieu de perdre le bail.
--
-- ⚠️ `Fin gest.` EST VIDE SUR LES 365 LIGNES et `Télécoms` sur les 307 bailleurs. Les colonnes existent quand même :
--   elles seront remplies le jour où WIPPIMMO les remplira, et une colonne absente ferait échouer l'import entier.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE N'EST ÉCRITE PAR CETTE MIGRATION. Elle crée des tables vides. Ce sont les exports,
--   passés par la commande d'import, qui les remplissent.
--
-- ═══ LA NORMALISATION EST FAITE PAR L'APPLICATION, PAS PAR LA BASE ═══════════════════════════════════════════════
-- Les colonnes `*_normalise` arrivent DÉJÀ en minuscules et sans accent (`app/lib/gestion/annuaire.ts`), les
-- téléphones déjà en E.164, les e-mails déjà en minuscules. Deux raisons, et la seconde est un piège connu :
--   ① `unaccent()` n'est PAS marquée IMMUTABLE par PostgreSQL : l'employer dans une expression d'index est refusé,
--      et le contourner par une fonction enrobante marquée IMMUTABLE à la main est un mensonge au planificateur ;
--   ② le SQL de recherche devient RIGOUREUSEMENT LE MÊME avec ou sans extension. `pg_trgm` n'accélère que ; il ne
--      change aucun résultat. Le code applicatif n'a donc AUCUNE branche à tenir de ce côté.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/253_gestion_annuaire.sql
--
-- POUR REVENIR EN ARRIÈRE (l'entrée « Annuaire » redit « pas encore installé » ; rien d'autre n'est touché) :
--   DROP TABLE IF EXISTS gestion_annuaire_contact, gestion_annuaire_occupation, gestion_annuaire_locataire,
--                        gestion_annuaire_lot, gestion_annuaire_proprietaire, gestion_annuaire_import;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── LES EXTENSIONS DE CONFORT, JAMAIS EXIGÉES ───────────────────────────────────────────────────────────────────
-- `pg_trgm` rend instantanée la recherche par fragment sur 300 à 500 lignes ; sans elle, le même SQL balaie la
-- table — sur ces volumes, personne ne le sent. On ESSAIE, et un refus (droits insuffisants) n'arrête rien.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm indisponible (%) — la recherche fonctionnera sans elle, par balayage.', SQLERRM;
END $$;

-- ── ① LE PROPRIÉTAIRE ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_annuaire_proprietaire (
  id              bigserial   PRIMARY KEY,
  -- 🔑 LA CLÉ D'IMPORT. C'est elle, et elle seule, qui fait qu'un ré-import MET À JOUR au lieu de DOUBLER.
  wippimmo_id     text        NOT NULL UNIQUE,
  civilite        text,
  nom             text        NOT NULL,
  prenom          text,
  -- Ce qu'on affiche, et ce que `Lots.Propriétaire` écrit : « NOM Prénom ».
  nom_complet     text        NOT NULL,
  -- Minuscules, sans accent, espaces réduits : la forme sur laquelle on rapproche et on cherche.
  nom_normalise   text        NOT NULL,
  adresse         text,
  commune         text,
  code_postal     text,
  adresse_normalisee text,
  -- 🔴 DÉRIVÉE, JAMAIS SAISIE : la plus ancienne « Déb gest. » de ses lots. Recalculée à chaque import, parce
  --   qu'un lot qui arrive ou qui part la change. La saisir ferait deux vérités qui divergeraient.
  relation_depuis date,
  -- 📁 RÉSERVÉ AU LOT SUIVANT : l'identifiant du dossier Drive « Documents clients scannés » de ce propriétaire.
  --   Vide aujourd'hui, et AUCUN code ne l'écrit. La colonne existe pour que le jour venu ce soit un UPDATE, pas
  --   une migration de plus sur une table déjà pleine.
  drive_dossier_id text,
  -- 🔴 « DISPARU » NE VEUT PAS DIRE « EFFACÉ ». Un export suivant où ce propriétaire n'apparaît plus pose cette
  --   date ; la ligne reste, ses lots restent, son historique reste. L'écran le dit, et un retour l'efface.
  absent_le       timestamptz,
  importe_le      timestamptz NOT NULL DEFAULT now(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_annuaire_proprietaire_nom_chk CHECK (btrim(nom) <> ''),
  CONSTRAINT gestion_annuaire_proprietaire_cle_chk CHECK (btrim(wippimmo_id) <> '')
);

-- ── ② LE LOT ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_annuaire_lot (
  id              bigserial   PRIMARY KEY,
  wippimmo_id     text        NOT NULL UNIQUE,
  -- NULL quand le nom écrit dans `Lots.Propriétaire` est porté par PLUSIEURS bailleurs : on ne tranche pas.
  proprietaire_id bigint      REFERENCES gestion_annuaire_proprietaire(id),
  -- Ce que WIPPIMMO a écrit, gardé MOT POUR MOT — c'est la seule pièce qui permet de rejuger un rapprochement.
  proprietaire_texte text     NOT NULL,
  immeuble        text,
  nature          text,
  type_bien       text,
  adresse         text,
  commune         text,
  code_postal     text,
  adresse_normalisee text,
  gestion_debut   date,
  gestion_fin     date,
  absent_le       timestamptz,
  importe_le      timestamptz NOT NULL DEFAULT now(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_annuaire_lot_cle_chk CHECK (btrim(wippimmo_id) <> '')
);

-- ── ③ LE LOCATAIRE (la PERSONNE) ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_annuaire_locataire (
  id              bigserial   PRIMARY KEY,
  -- 🔑 LA CLÉ DE PERSONNE : nom normalisé + un contact certain (e-mail, sinon téléphone), sinon l'id WIPPIMMO de
  --   la première ligne rencontrée. Deux baux ne deviennent une personne QUE si cette clé coïncide.
  cle_personne    text        NOT NULL UNIQUE,
  -- L'id WIPPIMMO de la ligne qui a créé la personne. Trace, pas identité : les autres lignes vivent dans
  --   `gestion_annuaire_occupation`.
  wippimmo_id     text        NOT NULL,
  nom             text        NOT NULL,
  nom_normalise   text        NOT NULL,
  adresse         text,
  commune         text,
  code_postal     text,
  adresse_normalisee text,
  absent_le       timestamptz,
  importe_le      timestamptz NOT NULL DEFAULT now(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_annuaire_locataire_nom_chk CHECK (btrim(nom) <> '')
);

-- ── ④ L'OCCUPATION : QUI HABITE QUOI, DE QUAND À QUAND ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_annuaire_occupation (
  id              bigserial   PRIMARY KEY,
  -- 🔑 UNE LIGNE WIPPIMMO = UNE OCCUPATION. C'est ici que vit la clé d'import de `Locataires.xlsx`.
  wippimmo_id     text        NOT NULL UNIQUE,
  locataire_id    bigint      NOT NULL REFERENCES gestion_annuaire_locataire(id) ON DELETE CASCADE,
  -- NULL = le lot n'est pas dans l'export Lots (mesuré : 14 cas sur 535). L'écran dit « lot hors gestion ».
  lot_id          bigint      REFERENCES gestion_annuaire_lot(id),
  lot_wippimmo_id text        NOT NULL,
  entree          date,
  sortie          date,
  absent_le       timestamptz,
  importe_le      timestamptz NOT NULL DEFAULT now(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  -- Une sortie ne peut pas précéder l'entrée. Les deux peuvent manquer (dates vides dans l'export).
  CONSTRAINT gestion_annuaire_occupation_dates_chk CHECK (entree IS NULL OR sortie IS NULL OR sortie >= entree)
);

-- ── ⑤ LES CONTACTS : PLUSIEURS TÉLÉPHONES, PLUSIEURS E-MAILS ────────────────────────────────────────────────────
-- Mesuré : 45 bailleurs et 134 locataires ont PLUSIEURS valeurs dans une seule cellule (« a@x;b@y »,
-- « 06 .. ; 06 .. », « 06 .. / 06 .. »). Les laisser dans une colonne texte rendrait impossible la recherche par
-- téléphone, qui est précisément une des quatre entrées demandées.
CREATE TABLE IF NOT EXISTS gestion_annuaire_contact (
  id              bigserial   PRIMARY KEY,
  -- Pas de clé étrangère polymorphe possible : le sujet est nommé, et les deux tables sont contraintes.
  sujet           text        NOT NULL,
  sujet_id        bigint      NOT NULL,
  sorte           text        NOT NULL,
  -- La forme CANONIQUE : E.164 pour un téléphone (+33…), minuscules pour un e-mail. C'est elle qu'on interroge.
  valeur          text        NOT NULL,
  -- Ce qui était écrit dans la cellule. On l'affiche tel quel : un numéro reformaté n'est plus reconnu par
  --   celui qui l'a saisi, et c'est lui qui appellera.
  valeur_brute    text        NOT NULL,
  -- L'ordre de la cellule : le PREMIER est le principal. Sans lui, deux mails s'afficheraient au hasard.
  rang            integer     NOT NULL DEFAULT 0,
  absent_le       timestamptz,
  importe_le      timestamptz NOT NULL DEFAULT now(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_annuaire_contact_sujet_chk CHECK (sujet IN ('proprietaire', 'locataire')),
  CONSTRAINT gestion_annuaire_contact_sorte_chk CHECK (sorte IN ('telephone', 'email')),
  CONSTRAINT gestion_annuaire_contact_valeur_chk CHECK (btrim(valeur) <> ''),
  -- Le même numéro écrit deux fois dans la même cellule (mesuré : « 0667698249 ; 0667698249 ») ne fait qu'une ligne.
  CONSTRAINT gestion_annuaire_contact_unique UNIQUE (sujet, sujet_id, sorte, valeur)
);

-- ── ⑥ LE JOURNAL DES IMPORTS, APPEND-ONLY GARANTI EN BASE ───────────────────────────────────────────────────────
-- TABLE SŒUR, jamais `gestion_releve_run` : y écrire ferait avancer un curseur qui ne nous regarde pas (doctrine
-- de la partie 10 de la migration 228).
CREATE TABLE IF NOT EXISTS gestion_annuaire_import (
  id              bigserial   PRIMARY KEY,
  demarre_le      timestamptz NOT NULL DEFAULT now(),
  termine_le      timestamptz,
  -- 'simulation' (sans --appliquer) ou 'applique'. La simulation est journalisée AUSSI : c'est elle qu'on relit
  --   pour dire « voilà ce qui allait être écrit ».
  mode            text        NOT NULL,
  dossier         text        NOT NULL,
  resultat        text        NOT NULL DEFAULT 'en_cours',
  proprietaires_crees      integer NOT NULL DEFAULT 0,
  proprietaires_majs       integer NOT NULL DEFAULT 0,
  proprietaires_inchanges  integer NOT NULL DEFAULT 0,
  lots_crees               integer NOT NULL DEFAULT 0,
  lots_majs                integer NOT NULL DEFAULT 0,
  lots_inchanges           integer NOT NULL DEFAULT 0,
  locataires_crees         integer NOT NULL DEFAULT 0,
  locataires_majs          integer NOT NULL DEFAULT 0,
  locataires_inchanges     integer NOT NULL DEFAULT 0,
  occupations_creees       integer NOT NULL DEFAULT 0,
  occupations_majs         integer NOT NULL DEFAULT 0,
  occupations_inchangees   integer NOT NULL DEFAULT 0,
  contacts_crees           integer NOT NULL DEFAULT 0,
  contacts_retires         integer NOT NULL DEFAULT 0,
  -- Les lignes qui n'ont PAS pu entrer, et pourquoi. Jamais un compteur seul : un rejet sans motif est un rejet
  --   qu'on ne corrigera pas.
  rejets                   integer NOT NULL DEFAULT 0,
  rejets_detail            text,
  -- Les noms portés par plusieurs bailleurs. Signalés, jamais fusionnés.
  homonymes                integer NOT NULL DEFAULT 0,
  homonymes_detail         text,
  -- Ceux qui étaient là au dernier import et qui ne sont plus dans cet export. Marqués, jamais effacés.
  disparus                 integer NOT NULL DEFAULT 0,
  revenus                  integer NOT NULL DEFAULT 0,
  erreur                   text,
  auteur_libelle  text        NOT NULL DEFAULT 'automatique',
  CONSTRAINT gestion_annuaire_import_mode_chk CHECK (mode IN ('simulation', 'applique')),
  CONSTRAINT gestion_annuaire_import_resultat_chk CHECK (resultat IN ('en_cours', 'ok', 'echec'))
);

CREATE OR REPLACE FUNCTION gestion_annuaire_import_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- On autorise l'UPDATE qui CLÔT la passe en cours (termine_le était NULL), et rien d'autre : une passe s'écrit
  -- en deux temps (ouverture, puis compteurs), mais une passe close ne se réécrit jamais.
  IF TG_OP = 'UPDATE' AND OLD.termine_le IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'gestion_annuaire_import est APPEND-ONLY : % interdit sur une passe déjà close.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_annuaire_import_no_update_delete ON gestion_annuaire_import;
CREATE TRIGGER gestion_annuaire_import_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_annuaire_import
  FOR EACH ROW EXECUTE FUNCTION gestion_annuaire_import_append_only();
DROP TRIGGER IF EXISTS gestion_annuaire_import_no_truncate ON gestion_annuaire_import;
CREATE TRIGGER gestion_annuaire_import_no_truncate
  BEFORE TRUNCATE ON gestion_annuaire_import
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_annuaire_import_append_only();

-- ── LES INDEX DE LA RECHERCHE ───────────────────────────────────────────────────────────────────────────────────
-- Un seul champ à l'écran, quatre entrées possibles (nom, adresse, téléphone, e-mail) : chacune a le sien.
CREATE INDEX IF NOT EXISTS gestion_annuaire_contact_valeur_idx
  ON gestion_annuaire_contact (valeur) WHERE absent_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_annuaire_contact_sujet_idx
  ON gestion_annuaire_contact (sujet, sujet_id, sorte, rang);
CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_proprietaire_idx
  ON gestion_annuaire_lot (proprietaire_id);
CREATE INDEX IF NOT EXISTS gestion_annuaire_occupation_lot_idx
  ON gestion_annuaire_occupation (lot_id, entree DESC);
CREATE INDEX IF NOT EXISTS gestion_annuaire_occupation_locataire_idx
  ON gestion_annuaire_occupation (locataire_id, entree DESC);
-- L'occupation EN COURS d'un lot : c'est la question posée à chaque ligne de résultat.
CREATE INDEX IF NOT EXISTS gestion_annuaire_occupation_encours_idx
  ON gestion_annuaire_occupation (lot_id) WHERE sortie IS NULL;

-- Les index de FRAGMENT ne sont posés que si `pg_trgm` a pu être installée. Sans eux, le MÊME SQL balaie 300 à
-- 500 lignes — imperceptible ; avec eux, il ne balaie rien. Aucun résultat ne change.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_nom_trgm
      ON gestion_annuaire_proprietaire USING gin (nom_normalise gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_adresse_trgm
      ON gestion_annuaire_proprietaire USING gin (adresse_normalisee gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS gestion_annuaire_locataire_nom_trgm
      ON gestion_annuaire_locataire USING gin (nom_normalise gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_adresse_trgm
      ON gestion_annuaire_lot USING gin (adresse_normalisee gin_trgm_ops);
  ELSE
    CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_nom_idx ON gestion_annuaire_proprietaire (nom_normalise);
    CREATE INDEX IF NOT EXISTS gestion_annuaire_locataire_nom_idx ON gestion_annuaire_locataire (nom_normalise);
    CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_adresse_idx ON gestion_annuaire_lot (adresse_normalisee);
  END IF;
END $$;

-- ── LE JOURNAL DU MODULE ACCEPTE L'ENTITÉ « annuaire » ──────────────────────────────────────────────────────────
-- Un import est un GESTE : il laisse une ligne dans le journal du module, comme une relève ou un envoi.
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',          -- 243 : un courrier PARTI de chez nous
    'piece_drive',    -- 245 : une pièce jointe COPIÉE dans le Drive
    'compte_google',  -- 246 : un collaborateur relie ou délie son compte Google
    'annuaire'        -- 253 : un import de l'annuaire WIPPIMMO
  ]));

COMMENT ON TABLE gestion_annuaire_proprietaire IS
  'LOT ANNUAIRE-1 — les bailleurs, importés de WIPPIMMO (Bailleurs.xlsx). wippimmo_id est la clé d''import : un '
  'ré-import met à jour, il ne double jamais. relation_depuis est DÉRIVÉE de la plus ancienne Déb gest. de ses '
  'lots, jamais saisie. drive_dossier_id est RÉSERVÉ au lot suivant et n''est écrit par aucun code aujourd''hui. '
  'absent_le marque un disparu du dernier export — la ligne reste, avec tout son historique.';
COMMENT ON TABLE gestion_annuaire_locataire IS
  'LOT ANNUAIRE-1 — les locataires, en tant que PERSONNES. Locataires.xlsx est une table de BAUX (mesuré : 535 '
  'lignes, 509 noms) : deux lignes ne deviennent une personne que si le nom normalisé ET un contact coïncident '
  '(cle_personne). Sur le seul nom, elles restent deux — on ne fusionne pas au jugé.';
COMMENT ON TABLE gestion_annuaire_occupation IS
  'LOT ANNUAIRE-1 — un bail : qui occupe quel lot, de quand à quand. Une ligne par ligne de Locataires.xlsx. '
  'lot_id NULL = lot absent de l''export Lots (mesuré : 14 sur 535) ; lot_wippimmo_id garde la référence et '
  'l''écran dit « lot hors gestion » plutôt que de perdre le bail.';
COMMENT ON COLUMN gestion_annuaire_lot.proprietaire_id IS
  'NULL quand le nom écrit dans Lots.Propriétaire est porté par PLUSIEURS bailleurs (mesuré : 1 cas). On ne '
  'tranche pas : proprietaire_texte garde le nom, et l''import le signale.';
COMMENT ON TABLE gestion_annuaire_import IS
  'LOT ANNUAIRE-1 — journal APPEND-ONLY des imports, simulations comprises. Une passe s''ouvre puis se clôt (seul '
  'UPDATE toléré : celui qui pose termine_le) ; une passe close ne se réécrit jamais. Garanti EN BASE par le '
  'trigger gestion_annuaire_import_append_only.';

COMMIT;
