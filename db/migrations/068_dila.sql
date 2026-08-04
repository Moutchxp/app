-- 068_dila.sql — Module VEILLE PERMIS (chantier S27) : SCHÉMA D'ACCUEIL de l'annuaire DILA (Base de données locales de
-- service-public.gouv.fr, « Direction de l'information légale et administrative »). Ce chantier crée UNIQUEMENT le schéma —
-- AUCUNE donnée, AUCUNE ingestion, AUCUNE écriture dans mairie_contact.
--
-- CE QUE PORTE LA DILA (recon S26, validée) : pour nos 335 communes, 335/335 ont téléphone + adresse postale, 315 un site ;
-- mais 0/15 des communes en canal 'inconnu' et 0/7 des « rien du tout » n'ont de courriel. La DILA est donc une source de
-- CONTEXTE (standard téléphonique, adresse postale, site), JAMAIS un futur destinataire. Le schéma ci-dessous est pensé
-- pour ça : il stocke des coordonnées de contexte + la mémoire d'audit brute, pas une adresse d'envoi.
--
-- MOTIF — POURQUOI DEUX TABLES (`dila_import` brut + `dila_millesime` registre), calqué sur 064_prada.sql :
--   Le fichier DILA arrive filtré à nos mairies mais reste une donnée EXTERNE datée. On garde ses enregistrements
--   VERBATIM dans `dila_import` (colonne `donnee_brute` jsonb = l'objet DILA entier, jamais jeté → mémoire d'audit),
--   PLUS des colonnes scalaires extraites pour l'usage. `dila_millesime` est le registre d'import (un fichier = une ligne).
--   Contrairement à PRADA (aucun code INSEE → rattachement par nom, faillible), la DILA porte le code INSEE EN CLAIR :
--   le rattachement est SÛR (rapprochement 'direct'), sauf pour 2 communes fusionnées (Saint-Germain-en-Laye 78551,
--   Saint-Denis 93066) qui exposent 2 mairies → on retient la principale par la règle `ancien_code_pivot = mairie-<INSEE>-01`
--   (rapprochement 'desambigue_01'). La colonne `rapprochement` trace ce choix, comme prada_import.
--
-- SÛR : DDL ADDITIVE. CREATE TABLE / CREATE INDEX IF NOT EXISTS ; la SEULE opération non-création est l'ÉLARGISSEMENT de la
-- contrainte CHECK de mairie_contact.source (voir §1) — on n'y RETIRE aucune valeur, on AJOUTE 'annuaire_dila'. Aucun DROP
-- de table/colonne, aucun ALTER destructeur. FK NULLABLES vers commune(code_insee) (stable) et dila_millesime(id) (créée
-- ici). GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotent. AUCUN
-- ENVOI. Tout dans un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/068_dila.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) ÉLARGISSEMENT de mairie_contact.source pour accueillir la provenance 'annuaire_dila'.
--    ANCIENNE contrainte (migration 050:28, nommée automatiquement mairie_contact_source_check) :
--        CHECK (source IN ('annuaire','saisie_manuelle','reponse_mairie'))
--    NOUVELLE contrainte (même nom, liste ÉLARGIE — aucune valeur retirée) :
--        CHECK (source IN ('annuaire','saisie_manuelle','reponse_mairie','annuaire_dila'))
--    On DROP IF EXISTS puis on RE-CRÉE (idempotent) : rejouer la migration reproduit exactement la contrainte élargie.
--    'annuaire_dila' distingue la provenance DILA de l'annuaire historique 'annuaire' — trace de provenance nette, et la
--    garde « travail humain prime » (jamais d'écrasement de saisie_manuelle/confirme) reste lisible côté ingestion.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mairie_contact DROP CONSTRAINT IF EXISTS mairie_contact_source_check;
ALTER TABLE mairie_contact ADD CONSTRAINT mairie_contact_source_check
  CHECK (source IN ('annuaire','saisie_manuelle','reponse_mairie','annuaire_dila'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) dila_millesime — REGISTRE DE LICENCE + journal des imports (un fichier importé = une ligne).
--
--    ⚠️⚠️ OBLIGATION LICENCE OUVERTE v2.0 — NE PAS SUPPRIMER CES COLONNES NI CETTE TABLE PAR « NETTOYAGE » ⚠️⚠️
--    La Licence Ouverte v2.0 (Etalab) impose de conserver la PATERNITÉ (copyright), l'URL LONGUE de téléchargement, le NOM
--    EXACT du fichier source et sa DATE. Ces quatre informations sont donc des colonnes NON NULL (sauf date, cf. infra) et
--    doivent survivre à tout ré-import. Les retirer nous mettrait en infraction avec la licence de réutilisation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dila_millesime (
  id                bigserial PRIMARY KEY,
  code              text UNIQUE NOT NULL,                  -- clé de version (ex. '2026-08-03') : un import = une ligne
  fichier_source    text NOT NULL,                         -- NOM EXACT du fichier importé (ex. '2026-08-03_053120-data.gouv_local.json') — OBLIGATION LICENCE
  date_fichier      date,                                  -- date du fichier / du millésime (ex. 2026-08-03) — OBLIGATION LICENCE
  url_telechargement text NOT NULL,                        -- URL LONGUE effective (ex. https://lecomarquage.service-public.gouv.fr/donnees_locales_v4/all_latest.tar.bz2) — OBLIGATION LICENCE
  copyright         text NOT NULL
                      DEFAULT 'Direction de l''information légale et administrative (Premier ministre)', -- PATERNITÉ — OBLIGATION LICENCE
  taille_octets     bigint,                                -- taille du fichier téléchargé (octets)
  nb_enregistrements bigint,                               -- nb de mairies retenues (périmètre) pour cet import
  importe_le        timestamptz NOT NULL DEFAULT now()     -- horodatage d'import
);

COMMENT ON TABLE dila_millesime IS
  'Registre des imports de l''annuaire DILA (Base de données locales). Un fichier importé = une ligne. ⚠️ REGISTRE DE LICENCE : fichier_source, url_telechargement, date_fichier et copyright sont EXIGÉS par la Licence Ouverte v2.0 (paternité + provenance) — NE JAMAIS supprimer. Calqué sur prada_millesime (064:69).';
COMMENT ON COLUMN dila_millesime.code IS 'Clé de version de l''import (ex. ''2026-08-03''), unique : rejouer un import connu ne crée pas de doublon.';
COMMENT ON COLUMN dila_millesime.fichier_source IS 'Nom EXACT du fichier JSON importé, extrait de l''archive datée (ex. ''2026-08-03_053120-data.gouv_local.json''). OBLIGATION LICENCE OUVERTE v2.0 (conservation du nom + date de la source).';
COMMENT ON COLUMN dila_millesime.url_telechargement IS 'URL LONGUE effective du téléchargement (redirection résolue). OBLIGATION LICENCE OUVERTE v2.0.';
COMMENT ON COLUMN dila_millesime.copyright IS 'Mention de paternité de la source. OBLIGATION LICENCE OUVERTE v2.0 — à afficher/conserver.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) dila_import — enregistrements BRUTS des mairies de NOTRE PÉRIMÈTRE, filtrés (pivot.type_service_local='mairie').
--    `donnee_brute` (jsonb) = l'objet DILA ENTIER, verbatim et jamais jeté (mémoire d'audit, comme les colonnes verbatim de
--    prada_import). Les colonnes scalaires en sont l'extraction USABLE (issue des tableaux telephone[]/adresse_courriel[]/
--    site_internet[]/adresse[] et des champs top-level). AUCUN CHECK de contenu sur les coordonnées (peuvent être vides).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dila_import (
  id                 bigserial PRIMARY KEY,
  millesime_id       bigint NOT NULL REFERENCES dila_millesime(id),  -- FK vers le registre d'import (millésime)
  -- Identité DILA (top-level du JSON) :
  id_dila            text,                                  -- champ `id` de la DILA (uuid du guichet) — identifiant stable de l'enregistrement
  ancien_code_pivot  text,                                  -- ex. 'mairie-92050-01' : clé de désambiguïsation (règle -01)
  code_insee_commune char(5),                               -- code INSEE VERBATIM porté par la DILA (clé de rattachement, en clair)
  nom                text,                                  -- ex. 'Mairie - Nanterre'
  categorie          text,                                  -- ex. 'SL' (service local)
  -- Coordonnées de CONTEXTE, extraites des tableaux (jamais un destinataire d'envoi) :
  telephone          text,                                  -- telephone[].valeur (1re) — alimentera mairie_contact.telephone_standard
  courriel           text,                                  -- adresse_courriel[].valeur (souvent VIDE : 0/22 sur les communes en manque)
  site_internet      text,                                  -- site_internet[].valeur
  adresse_libelle    text,                                  -- adresse[].numero_voie (ligne de voie)
  adresse_code_postal text,                                 -- adresse[].code_postal
  adresse_commune    text,                                  -- adresse[].nom_commune
  latitude           double precision,                      -- adresse[].latitude (géoloc du guichet)
  longitude          double precision,                      -- adresse[].longitude
  -- Dates DILA (VERBATIM, format 'JJ/MM/AAAA HH:MM:SS' — conservées en texte, non normalisées) :
  date_creation      text,
  date_modification  text,
  date_diffusion     text,
  -- Mémoire d'audit : l'objet DILA entier, jamais jeté.
  donnee_brute       jsonb NOT NULL,
  -- Rattachement à une commune de notre périmètre (SÛR ici : le code INSEE est en clair) :
  code_insee         char(5) REFERENCES commune(code_insee),  -- commune rattachée (NULL si non traité / hors périmètre)
  rapprochement      text NOT NULL DEFAULT 'non_traite'
                       CONSTRAINT dila_import_rapprochement_chk
                       CHECK (rapprochement IN ('non_traite','direct','desambigue_01','manuel','ambigu','hors_perimetre')),
  importe_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dila_import_millesime_iddila_uniq UNIQUE (millesime_id, id_dila)  -- un guichet DILA par import (autorise les 2 mairies d'une commune fusionnée)
);

COMMENT ON TABLE dila_import IS
  'Enregistrements BRUTS des mairies de notre périmètre issus de l''annuaire DILA, filtrés sur pivot.type_service_local=''mairie''. donnee_brute (jsonb) = l''objet DILA entier, jamais jeté (mémoire d''audit) ; les colonnes scalaires en sont l''extraction usable. Source de CONTEXTE (téléphone/adresse/site), jamais un destinataire. Calqué sur prada_import (064:34).';
COMMENT ON COLUMN dila_import.donnee_brute IS 'Objet DILA COMPLET et verbatim (jsonb). Garantit qu''aucune information n''est perdue par l''extraction scalaire : mémoire d''audit, jamais jetée.';
COMMENT ON COLUMN dila_import.code_insee_commune IS 'Code INSEE tel que porté par la DILA (top-level `code_insee_commune` / pivot). Clé de rattachement EN CLAIR — rattachement sûr, contrairement à PRADA.';
COMMENT ON COLUMN dila_import.ancien_code_pivot IS 'Ex. ''mairie-92050-01''. Sert à désambiguïser les 2 communes fusionnées (78551, 93066) qui exposent une mairie principale (-01) et une mairie déléguée : on retient la -01.';
COMMENT ON COLUMN dila_import.courriel IS 'Courriel VERBATIM (adresse_courriel[].valeur) — souvent VIDE. La DILA n''apporte AUCUN courriel pour les 22 communes en manque : ne JAMAIS en faire un destinataire automatique.';
COMMENT ON COLUMN dila_import.telephone IS 'Téléphone du guichet (telephone[].valeur). Destiné à mairie_contact.telephone_standard (standard de la mairie), PAS au service urbanisme.';
COMMENT ON COLUMN dila_import.code_insee IS 'Commune de notre périmètre rattachée (FK nullable). NULL si non traité, ambigu ou hors périmètre.';
COMMENT ON COLUMN dila_import.rapprochement IS 'État du rattachement. Valeurs ÉCRITES aujourd''hui : direct (code INSEE unique) | desambigue_01 (>=2 mairies pour une même commune → principale retenue par mairie-<INSEE>-01 ; les mairies déléguées écartées ne sont PAS écrites). ⚠️ VALEURS DE GARDE réservées, JAMAIS écrites par l''ingestion actuelle — NE PAS retirer du CHECK au « nettoyage » : non_traite | manuel | ambigu | hors_perimetre. En particulier ''hors_perimetre'' est réservée à un futur ÉLARGISSEMENT du périmètre (enregistrements qu''on ramènerait alors) — à ne pas confondre avec une mairie déléguée écartée, dont la commune est DANS le périmètre.';

CREATE INDEX IF NOT EXISTS dila_import_code_insee_idx         ON dila_import (code_insee);
CREATE INDEX IF NOT EXISTS dila_import_code_insee_commune_idx ON dila_import (code_insee_commune);
CREATE INDEX IF NOT EXISTS dila_import_rapprochement_idx      ON dila_import (rapprochement);
CREATE INDEX IF NOT EXISTS dila_import_millesime_idx          ON dila_import (millesime_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN après le psql -f ci-dessus) :
--
--   \d dila_millesime
--   \d dila_import
--
--   -- (a) la contrainte source est ÉLARGIE (doit contenir les 4 valeurs, dont annuaire_dila) :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'mairie_contact_source_check';
--   -- Attendu : CHECK ((source = ANY (ARRAY['annuaire','saisie_manuelle','reponse_mairie','annuaire_dila'])))
--
--   -- (b) 'annuaire_dila' est désormais ACCEPTÉ, et une valeur inconnue TOUJOURS refusée (contrôle en transaction annulée) :
--   -- BEGIN;
--   --   UPDATE mairie_contact SET source = 'annuaire_dila' WHERE code_insee = '75056';   -- doit PASSER
--   --   UPDATE mairie_contact SET source = 'xxx'           WHERE code_insee = '75056';   -- doit ÉCHOUER (CHECK)
--   -- ROLLBACK;   -- ⚠️ ne rien laisser : ce fichier n'écrit AUCUNE donnée réelle.
--
--   -- (c) rapprochement borné (doit échouer) :
--   -- INSERT INTO dila_import (millesime_id, donnee_brute, rapprochement) VALUES (0, '{}'::jsonb, 'xxx');  -- viole dila_import_rapprochement_chk (et FK)
--
--   -- (d) colonnes de licence présentes et NOT NULL sur dila_millesime (fichier_source, url_telechargement, copyright) :
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'dila_millesime' AND column_name IN ('fichier_source','url_telechargement','copyright','date_fichier');
