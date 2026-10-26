-- 432_location_negociateur_alias.sql — LOCATION (Arno, 26/10/2026) : UNE PERSONNE = UN SEUL ESPACE NÉGOCIATEUR.
--
-- CONSTAT D'ARNO : le Suivi du mois montrait « Négociateur — jb.pons@sansvisavis.com » et « Négociateur — Jean-Baptiste PONS » pour la
-- même personne : une ligne saisie avec le compte collaborateur et une ligne reprise avec le seul libellé texte formaient deux espaces.
-- Le code rattache d'office un libellé qui correspond SANS AMBIGUÏTÉ à un seul compte (prénom + nom, ou adresse) ; les autres figurent dans
-- « Négociateurs à rapprocher », où Arno les rattache à la main. CETTE TABLE garde ces rattachements manuels.
--
-- EN AJOUT SEUL : une ligne par rattachement posé (libellé normalisé → compte), datée et signée ; « Détacher » la RETIRE (retire_le), elle
-- n'est jamais effacée (ni DELETE ni TRUNCATE : le verrou existant). Un seul rattachement vivant par libellé. Aucune ligne existante touchée.
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, les correspondances sans ambiguïté valent déjà ; seuls les gestes « Rattacher »
-- et « Détacher » disent « disponible après la mise à jour ».

CREATE TABLE IF NOT EXISTS gestion_location_negociateur_alias (
  id                  bigserial   PRIMARY KEY,
  libelle_normalise   text        NOT NULL CHECK (btrim(libelle_normalise) <> ''),
  libelle             text        NOT NULL CHECK (btrim(libelle) <> ''),
  compte_id           bigint      NOT NULL REFERENCES admin_utilisateur(id),
  pose_le             timestamptz NOT NULL DEFAULT now(),
  pose_par_libelle    text        NOT NULL CHECK (btrim(pose_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_negociateur_alias_vivant_idx
  ON gestion_location_negociateur_alias (libelle_normalise) WHERE retire_le IS NULL;
DROP TRIGGER IF EXISTS gestion_location_negociateur_alias_verrou_delete ON gestion_location_negociateur_alias;
CREATE TRIGGER gestion_location_negociateur_alias_verrou_delete BEFORE DELETE ON gestion_location_negociateur_alias
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_location_negociateur_alias_verrou_truncate ON gestion_location_negociateur_alias;
CREATE TRIGGER gestion_location_negociateur_alias_verrou_truncate BEFORE TRUNCATE ON gestion_location_negociateur_alias
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression();

COMMENT ON TABLE gestion_location_negociateur_alias IS
  'Rattachements manuels d''un libellé de négociateur (texte saisi ou repris) à un compte collaborateur ; détacher = retire_le (migration 432).';
