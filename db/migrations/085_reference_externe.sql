-- 085_reference_externe.sql — Module VEILLE PERMIS (chantier P1) : RÉFÉRENCE INTERNE DE LA MAIRIE.
-- ⚠️ Un dépôt e-mail conserve son message_id ; un dépôt MANUEL (téléservice) ne conservait RIEN. La mairie renvoie SA
-- référence (ex. Paris « SLC260810440700 », par accusé de réception) : c'est ce qu'elle comprend, la PREUVE DE DÉPÔT en cas de
-- saisine CADA, et le point d'entrée si elle appelle. On la stocke dans une TABLE DÉDIÉE (pas une colonne sur `demande`) :
-- une demande peut recevoir PLUSIEURS références (Paris n'accepte qu'un dossier par dépôt → une demande à 4 dossiers = 4 dépôts
-- = 4 références). N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS. Requiert 084.
--
-- SÛR : CREATE TABLE/INDEX IF NOT EXISTS additif. Aucun DROP de table/colonne/index, aucune ALTER de `demande`. GOLDEN-SAFE.
-- Un seul BEGIN/COMMIT. Idempotente. Format de `reference` LIBRE (chaque commune le sien) → AUCUN CHECK de forme.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/085_reference_externe.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

CREATE TABLE IF NOT EXISTS demande_reference_externe (
  id           bigserial   PRIMARY KEY,
  demande_id   bigint      NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
  -- Renseigné quand le dépôt ne porte QUE sur un dossier (cas Paris : 1 dépôt = 1 dossier). NULL = la référence couvre toute
  -- la demande. ON DELETE SET NULL : la référence (preuve de dépôt) survit même si le dossier disparaît du référentiel.
  dossier_id   bigint      REFERENCES sitadel_dossier(id) ON DELETE SET NULL,
  reference    text        NOT NULL,   -- format LIBRE (propre à chaque commune) — JAMAIS de CHECK de forme
  source       text,                   -- d'où vient la référence (liste fermée ci-dessous)
  note         text,
  recu_le      timestamptz,            -- date de l'accusé de réception (souvent postérieure au dépôt)
  cree_le      timestamptz NOT NULL DEFAULT now(),
  -- Liste fermée de PROVENANCE (bornée, mais NULL toléré si l'on ne sait pas) — jamais un CHECK sur la FORME de la référence.
  CONSTRAINT demande_reference_externe_source_chk CHECK (source IS NULL OR source IN ('accuse_reception','saisie_manuelle','autre')),
  -- Ne jamais enregistrer DEUX FOIS la même référence pour une même demande (23505 → 409 métier côté route).
  CONSTRAINT demande_reference_externe_demande_id_reference_key UNIQUE (demande_id, reference)
);

COMMENT ON TABLE demande_reference_externe IS 'Référence interne renvoyée par la mairie lors d''un dépôt manuel (téléservice), reçue par accusé de réception. Sert de PREUVE DE DÉPÔT en cas de saisine CADA (équivalent du message_id d''un envoi e-mail) ET de point d''entrée quand la mairie appelle en citant sa référence. Plusieurs par demande possibles (certaines communes, ex. Paris, n''acceptent qu''un dossier par dépôt).';
COMMENT ON COLUMN demande_reference_externe.dossier_id IS 'Dossier concerné quand le dépôt ne porte que sur lui (NULL = toute la demande).';
COMMENT ON COLUMN demande_reference_externe.reference IS 'Référence de la mairie, format LIBRE (aucune contrainte de forme).';

-- Recherche/lookup par forme NORMALISÉE (majuscules, sans espaces ni tirets) : une référence dictée au téléphone est rarement
-- tapée à l'identique. L'expression doit rester alignée sur normaliserReference() (demandesListe.ts).
CREATE INDEX IF NOT EXISTS demande_reference_externe_norm_idx
  ON demande_reference_externe (upper(regexp_replace(reference, '[[:space:]-]', '', 'g')));
CREATE INDEX IF NOT EXISTS demande_reference_externe_demande_idx ON demande_reference_externe (demande_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reference_externe
--     -- demande_id NOT NULL (FK demande, ON DELETE CASCADE) ; dossier_id NULLABLE (FK sitadel_dossier, ON DELETE SET NULL) ;
--     -- reference NOT NULL (aucun CHECK de forme) ; UNIQUE (demande_id, reference) ; index normalisé.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_reference_externe_source_chk';
--     -- doit lister : accuse_reception, saisie_manuelle, autre
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'demande_reference_externe_norm_idx';
--     -- doit contenir upper(regexp_replace(reference, '[[:space:]-]'::text, ''::text, 'g'::text))
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO demande_reference_externe (demande_id, reference, source) VALUES (1,'X','bidon'); ROLLBACK; -- viole le CHECK source
--   -- BEGIN;
--   --   INSERT INTO demande_reference_externe (demande_id, reference) VALUES (1,'DOUBLON');
--   --   INSERT INTO demande_reference_externe (demande_id, reference) VALUES (1,'DOUBLON'); -- viole l'UNIQUE (23505)
--   -- ROLLBACK;
