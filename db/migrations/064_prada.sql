-- 064_prada.sql — Module VEILLE PERMIS (chantier S14a) : registre des PRADA (Personnes Responsables de l'Accès aux
-- Documents Administratifs). Chaque administration désigne une PRADA (art. R.330-2 CRPA) : c'est la personne à qui une
-- demande de communication de documents (CADA) doit idéalement être adressée nominativement. Ce chantier crée UNIQUEMENT
-- le SCHÉMA D'ACCUEIL — aucune donnée, aucun code, aucun écran.
--
-- MOTIF — POURQUOI DEUX TABLES (`prada_import` brut + `mairie_prada` retenu) :
--   Le CSV de l'annuaire CADA arrive « à plat » et SALE. On garde d'abord ses lignes VERBATIM dans `prada_import` : elles
--   ne sont JAMAIS jetées. Si on ne conservait que les PRADA rapprochées, une commune qu'on n'a PAS su rattacher
--   disparaîtrait EN SILENCE — impossible alors de mener une revue manuelle ni de comprendre pourquoi elle manque. Le brut
--   est la mémoire d'audit ; `mairie_prada` n'est que la vue « retenue » (au plus une PRADA par commune).
--
-- ⚠️ LE CSV CADA NE CONTIENT AUCUN CODE INSEE. Le rattachement à une commune se fait donc par NOM + DÉPARTEMENT, et reste
--   FAILLIBLE (homonymes, SAINT/ST, tirets, communes nouvelles…). D'où la colonne `rapprochement` sur le brut (traçant
--   comment chaque ligne a été — ou non — rattachée) et le vocabulaire de confiance sur `mairie_prada` : 'presume' =
--   rapproché AUTOMATIQUEMENT, NON VÉRIFIÉ ; 'confirme' = validé À LA MAIN. Même sémantique que `mairie_contact` (050:29).
--
-- SÛR : DDL ADDITIVE uniquement (CREATE TABLE / CREATE INDEX IF NOT EXISTS). AUCUN DROP, AUCUN ALTER sur l'existant
-- (commune, mairie_contact, demande, config_*, sitadel_*). Les seules références sortantes sont des FK NULLABLES vers
-- commune(code_insee) — table stable — et vers prada_import(id) créée ici même. GOLDEN-SAFE (aucun contact
-- moteur/config_scoring/batiment). Idempotent. Tout dans un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/064_prada.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) prada_import — lignes BRUTES du CSV annuaire CADA, VERBATIM, jamais nettoyées.
--    Les 8 colonnes du fichier sont conservées telles quelles en `text`, SANS aucun CHECK de contenu : elles doivent
--    pouvoir accueillir n'importe quoi, y compris un courriel VIDE (le fichier réel en contient). Seuls l'état de
--    rapprochement et l'intégrité (millésime+rang uniques, FK commune nullable) sont contraints.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prada_import (
  id                 bigserial PRIMARY KEY,
  millesime          text    NOT NULL,                    -- ex. '2026-07' : version de l'annuaire CADA importé
  ligne              integer NOT NULL,                    -- rang de la ligne dans le fichier source (traçabilité)
  -- Les 8 colonnes du CSV, VERBATIM (aucune normalisation, aucun CHECK — peut être NULL ou vide) :
  classement         text,
  departement        text,                                -- département tel qu'écrit dans le fichier (≠ commune.departement char(2))
  nom_administration text,
  prenom             text,
  nom                text,
  courriel           text,                                -- peut être VIDE : le fichier réel contient des courriels absents
  adresse            text,
  code_postal_ville  text,
  -- État de rapprochement (le CSV n'a pas de code INSEE → rattachement par nom + département, faillible) :
  code_insee         char(5) REFERENCES commune(code_insee),   -- commune rattachée (NULL tant que non/ pas rattaché)
  rapprochement      text NOT NULL DEFAULT 'non_traite'
                       CONSTRAINT prada_import_rapprochement_chk
                       CHECK (rapprochement IN ('non_traite','automatique','manuel','ambigu','hors_perimetre')),
  importe_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prada_import_millesime_ligne_uniq UNIQUE (millesime, ligne)
);

COMMENT ON TABLE prada_import IS
  'Lignes BRUTES du CSV annuaire CADA, verbatim et jamais jetées (mémoire d''audit). Deux tables plutôt qu''une : si l''on ne gardait que les PRADA rapprochées, une commune non rattachée disparaîtrait en silence et la revue manuelle deviendrait impossible. Le CSV ne contient AUCUN code INSEE : le rattachement se fait par nom + département et reste faillible (d''où la colonne rapprochement).';
COMMENT ON COLUMN prada_import.courriel IS 'Courriel VERBATIM du fichier — peut être vide/NULL (le fichier réel en contient) : aucun CHECK de contenu.';
COMMENT ON COLUMN prada_import.departement IS 'Département tel qu''écrit dans le CSV (texte brut), à ne pas confondre avec commune.departement (char(2) normalisé).';
COMMENT ON COLUMN prada_import.code_insee IS 'Commune rattachée par rapprochement nom+département (NULL si non traité, ambigu ou hors périmètre). FK nullable vers commune.';
COMMENT ON COLUMN prada_import.rapprochement IS 'État du rattachement de la ligne : non_traite | automatique | manuel | ambigu | hors_perimetre. Trace la revue et explique une commune manquante.';

CREATE INDEX IF NOT EXISTS prada_import_departement_idx   ON prada_import (departement);
CREATE INDEX IF NOT EXISTS prada_import_rapprochement_idx  ON prada_import (rapprochement);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) prada_millesime — journal des imports d'annuaire CADA, calqué sur sitadel_millesime (047:29-38).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prada_millesime (
  id              bigserial PRIMARY KEY,
  code            text UNIQUE NOT NULL,                   -- ex. '2026-07' : version de l'annuaire importé (un import = une ligne)
  fichier_source  text,                                   -- nom du fichier CSV source (obligation de traçabilité de provenance)
  lignes_lues     bigint,                                 -- total lignes lues dans le CSV
  lignes_retenues bigint,                                 -- total lignes retenues (rattachées à une commune du périmètre)
  importe_le      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE prada_millesime IS
  'Journal des imports de l''annuaire CADA (un millésime = une ligne, avec le fichier source et les volumes). Calqué sur sitadel_millesime.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) mairie_prada — la PRADA RETENUE, AU PLUS UNE PAR COMMUNE (même motif que mairie_contact:26).
--    Vocabulaire de statut identique à mairie_contact (050:29) : 'presume' = rapproché automatiquement (non vérifié),
--    'confirme' = validé à la main, 'invalide' = écarté.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mairie_prada (
  code_insee       char(5) PRIMARY KEY REFERENCES commune(code_insee),
  import_id        bigint REFERENCES prada_import(id),    -- ligne brute d'origine (NULL si saisie manuelle sans import)
  nom              text,
  prenom           text,
  courriel         text,
  adresse_formatee text,
  millesime        text NOT NULL,                         -- version de l'annuaire d'où provient cette PRADA
  origine          text NOT NULL DEFAULT 'annuaire_cada'
                     CONSTRAINT mairie_prada_origine_chk
                     CHECK (origine IN ('annuaire_cada','saisie_manuelle')),
  statut           text NOT NULL DEFAULT 'presume'
                     CONSTRAINT mairie_prada_statut_chk
                     CHECK (statut IN ('presume','confirme','invalide')),
  maj_le           timestamptz NOT NULL DEFAULT now(),
  note             text
);

COMMENT ON TABLE mairie_prada IS
  'PRADA retenue par commune (au plus une, même motif que mairie_contact). Vue « propre » alimentée depuis prada_import ; les lignes brutes, elles, ne sont jamais jetées. statut: presume|confirme|invalide — MÊME sémantique que mairie_contact.';
COMMENT ON COLUMN mairie_prada.statut IS 'presume = rapproché AUTOMATIQUEMENT et NON vérifié ; confirme = validé à la main ; invalide = écarté. Aligné sur mairie_contact.statut.';
COMMENT ON COLUMN mairie_prada.origine IS 'Provenance : annuaire_cada (import) | saisie_manuelle.';
COMMENT ON COLUMN mairie_prada.import_id IS 'Ligne brute prada_import ayant produit cette PRADA (NULL si saisie manuelle directe).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) mairie_prada_journal — append-only, STRICTEMENT calqué sur mairie_contact_journal (050:38-51). Aucun FK (la trace
--    survit à la disparition d'une commune au ré-import). Transposition 1:1 : email_avant→courriel_avant,
--    email_apres→courriel_apres, source→origine ; id/code_insee/motif/auteur/horodatage identiques.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mairie_prada_journal (
  id             bigserial PRIMARY KEY,
  code_insee     char(5) NOT NULL,
  courriel_avant text,
  courriel_apres text,
  origine        text,
  motif          text,
  auteur         text,                                    -- id admin (saisie manuelle) ou NULL/'import' (automatique)
  horodatage     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mairie_prada_journal IS
  'Historique append-only des changements de PRADA d''une commune (courriel_avant→courriel_apres). Une ligne par changement, y compris le 1er renseignement. Jamais écrasé. Calqué sur mairie_contact_journal.';

CREATE INDEX IF NOT EXISTS mairie_prada_journal_code_idx ON mairie_prada_journal (code_insee, horodatage);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN après le psql -f ci-dessus) :
--
--   \d prada_import
--   \d prada_millesime
--   \d mairie_prada
--   \d mairie_prada_journal
--
--   -- Les 4 CHECK de liste fermée sont-ils en place ? (doit lister rapprochement, origine, statut) :
--   SELECT conrelid::regclass AS table, conname, pg_get_constraintdef(oid) AS definition
--     FROM pg_constraint
--    WHERE conrelid IN ('prada_import'::regclass,'mairie_prada'::regclass) AND contype = 'c'
--    ORDER BY conrelid::regclass::text, conname;
--
--   -- Contrôle NÉGATIF des CHECK — chacun de ces INSERT DOIT ÉCHOUER (violation de contrainte) :
--   -- INSERT INTO prada_import (millesime, ligne, rapprochement) VALUES ('_test_', 1, 'xxx');      -- viole prada_import_rapprochement_chk
--   -- INSERT INTO mairie_prada (code_insee, millesime, origine) VALUES ('75056', '_test_', 'xxx'); -- viole mairie_prada_origine_chk
--   -- INSERT INTO mairie_prada (code_insee, millesime, statut)  VALUES ('75056', '_test_', 'xxx'); -- viole mairie_prada_statut_chk
--
--   -- Contrôle POSITIF de l'unicité brute (le 2e INSERT doit échouer sur prada_import_millesime_ligne_uniq) :
--   -- INSERT INTO prada_import (millesime, ligne) VALUES ('_test_', 1);
--   -- INSERT INTO prada_import (millesime, ligne) VALUES ('_test_', 1);   -- doit violer l'unicité (millesime, ligne)
--   -- (penser à ROLLBACK / DELETE des lignes '_test_' après contrôle : ce fichier n'écrit AUCUNE donnée réelle.)
